#!/bin/bash

# OrthoAndSpineTools Production Deployment Script
# Check-gated deployment with automatic rollback on failure
#
# Flow:
#   1. Record current running image IDs and tag them <compose-name>:pre-deploy-<ts>
#   2. Build new images WITHOUT taking site down
#   3. Bring new stack up (minimal downtime), wait for health
#   4. Run Playwright checks against the LOCAL stack (public hostname resolved to 127.0.0.1)
#   5. On failure: retag pre-deploy images back to the compose names, recreate
#      app containers with --no-build --no-deps, verify image IDs, exit non-zero
#      (rollback logic lives in scripts/lib/deploy-rollback.sh)
#
# Usage:
#   ./deploy.sh              # Full deploy with checks
#   ./deploy.sh --skip-checks # Emergency deploy (logs loudly)
#   ./deploy.sh --dry-run    # Show what would happen, don't deploy
#
# Test/drill hooks (used by scripts/tests/deploy-rollback.test.sh):
#   DEPLOY_COMPOSE_FILE  compose file (default docker-compose.prod.yml)
#   DEPLOY_CHECK_CMD     run this instead of the Playwright checks
#   DEPLOY_HEALTH_CMD    run this instead of the local curl health checks
#   FORCE_CHECK_FAIL=1   treat the pre-deploy checks as failed (rollback drill)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-docker-compose.prod.yml}"

# shellcheck source=scripts/lib/deploy-rollback.sh
source "$SCRIPT_DIR/scripts/lib/deploy-rollback.sh"

# Parse arguments
SKIP_CHECKS=false
DRY_RUN=false
for arg in "$@"; do
  case $arg in
    --skip-checks)
      SKIP_CHECKS=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
  esac
done

# Local check target.
# http://localhost on this box only returns a 301 to https://orthoandspinetools.com, so
# "curl -sf http://localhost/..." passed on the redirect and Playwright ended up testing
# the PUBLIC site (old containers, shared rate-limit bucket). Instead, pin the real
# hostname to the local nginx so TLS, server_name and routing match production exactly.
CHECK_HOST="${CHECK_HOST:-orthoandspinetools.com}"
CHECK_IP="${CHECK_IP:-127.0.0.1}"
CHECK_BASE_URL="${CHECK_BASE_URL:-https://$CHECK_HOST}"

local_curl() {
    curl -sf --max-time 10 \
        --resolve "$CHECK_HOST:443:$CHECK_IP" \
        --resolve "$CHECK_HOST:80:$CHECK_IP" \
        "$CHECK_BASE_URL$1"
}

# Health check used after deploy and after rollback.
dr_health_check() {
    if [ -n "${DEPLOY_HEALTH_CMD:-}" ]; then
        bash -c "$DEPLOY_HEALTH_CMD"
        return
    fi
    local_curl /health > /dev/null && local_curl /api/health > /dev/null
}

# Prefer Node 20 from ~/.local/node20/bin if present (Playwright needs Node 20+)
if [ -d "$HOME/.local/node20/bin" ]; then
    export PATH="$HOME/.local/node20/bin:$PATH"
    echo "📦 Using Node from ~/.local/node20/bin"
fi

# Verify Node version for Playwright (needs 20+)
check_node_version() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
        if [ "$NODE_VERSION" -lt 20 ]; then
            echo "⚠️  Node.js $NODE_VERSION detected. Playwright requires Node 20+."
            echo "   Install Node 20 to ~/.local/node20/bin or run: sudo npx playwright install-deps chromium"
            return 1
        fi
    fi
    return 0
}

echo "🏥 OrthoAndSpineTools Production Deployment"
echo "=========================================="

if [ "$DRY_RUN" = true ]; then
    echo "🔍 DRY RUN MODE - No changes will be made"
    echo ""
fi

if [ "$SKIP_CHECKS" = true ]; then
    echo ""
    echo "⚠️  =============================================="
    echo "⚠️  WARNING: PRE-DEPLOY CHECKS SKIPPED"
    echo "⚠️  This is an EMERGENCY deployment mode!"
    echo "⚠️  The site may be broken after this deploy."
    echo "⚠️  =============================================="
    echo ""
fi

# PHI leak gate (phi-guard). Runs before any docker build and is NOT skipped by --skip-checks.
echo "🔒 Running phi-guard PHI scan..."
sh "$SCRIPT_DIR/scripts/phi-guard/phi-scan.sh" --all --root "$SCRIPT_DIR" || { echo "deploy: PHI gate failed; report to the Security Officer" >&2; exit 1; }

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ This script should not be run as root for security reasons"
   exit 1
fi

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed."
    exit 1
fi

# Check compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ $COMPOSE_FILE not found!"
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    source .env
else
    echo "❌ .env file not found. Create it first."
    exit 1
fi

# Record current running images and tag them <compose-name>:pre-deploy-<ts> for rollback.
# These tags are kept (not auto-deleted) so a manual rollback is always possible.
echo ""
echo "📸 Recording current images for rollback..."
if [ "$DRY_RUN" = true ]; then
    for svc in $DEPLOY_APP_SERVICES; do
        if DRY_NAME="$(dr_resolve_image_name "$svc" 2>/dev/null)"; then
            echo "   $svc: $DRY_NAME running $(dr_running_id "$svc" | cut -c8-19)"
        else
            echo "   $svc: (not running or not resolvable)"
        fi
    done
else
    RECORD_RC=0
    dr_record || RECORD_RC=$?
    if [ "$RECORD_RC" -eq 2 ]; then
        echo "❌ Could not resolve/tag the running images. Aborting before build."
        exit 1
    elif [ "$RECORD_RC" -eq 1 ]; then
        echo "⚠️  Not all app services are running; automatic rollback will not be possible."
    fi
fi

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "🔍 DRY RUN: Would tag running images as <compose-name>:pre-deploy-<ts>"
    echo "🔍 DRY RUN: Would build new images (without taking site down)"
    echo "🔍 DRY RUN: Would bring up new stack and wait for health"
    if [ "$SKIP_CHECKS" = false ]; then
        echo "🔍 DRY RUN: Would run Playwright checks"
        echo "🔍 DRY RUN: On failure, would retag pre-deploy images to the compose names and recreate with --no-build"
    fi
    echo ""
    echo "✅ Dry run complete. No changes made."
    exit 0
fi

# Build new images WITHOUT taking site down
echo ""
echo "🔨 Building new images (site stays up)..."
docker compose -f "$COMPOSE_FILE" build --no-cache backend frontend

# Bring up new stack with minimal downtime
echo ""
echo "🚀 Deploying new containers..."
docker compose -f "$COMPOSE_FILE" up -d backend frontend bot-analytics

# CRITICAL: Force recreate nginx to refresh upstream IPs
echo "🔄 Refreshing nginx upstream connections..."
docker compose -f "$COMPOSE_FILE" up -d --force-recreate nginx

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be healthy..."
HEALTH_TIMEOUT=60
HEALTH_INTERVAL=5
ELAPSED=0

while [ $ELAPSED -lt $HEALTH_TIMEOUT ]; do
    if dr_health_check > /dev/null 2>&1; then
        echo "✅ Site is responding"
        break
    fi
    sleep $HEALTH_INTERVAL
    ELAPSED=$((ELAPSED + HEALTH_INTERVAL))
    echo "   Waiting... ($ELAPSED/${HEALTH_TIMEOUT}s)"
done

if [ $ELAPSED -ge $HEALTH_TIMEOUT ]; then
    echo "❌ Health check timeout after ${HEALTH_TIMEOUT}s"
    # Will trigger rollback below if checks enabled
fi

# Verify basic health
echo ""
echo "🔍 Verifying service health..."
HEALTH_OK=true

if [ -n "${DEPLOY_HEALTH_CMD:-}" ]; then
    if dr_health_check > /dev/null 2>&1; then
        echo "   ✅ Health command passed"
    else
        echo "   ❌ Health command failed"
        HEALTH_OK=false
    fi
else
    if local_curl /health > /dev/null 2>&1; then
        echo "   ✅ Nginx responding"
    else
        echo "   ❌ Nginx not responding"
        HEALTH_OK=false
    fi

    if local_curl /api/health > /dev/null 2>&1; then
        echo "   ✅ Backend API responding"
    else
        echo "   ❌ Backend API not responding"
        HEALTH_OK=false
    fi
fi

# Rollback: see scripts/lib/deploy-rollback.sh (dr_rollback)
rollback() {
    dr_rollback
}

checks_failed() {
    echo ""
    echo "❌ =============================================="
    echo "❌ PRE-DEPLOY CHECKS FAILED!"
    echo "❌ =============================================="
    echo ""
    if rollback; then
        echo ""
        echo "🔙 Rolled back to previous version."
        echo "   Fix the issues and redeploy."
    else
        echo ""
        echo "❌ Rollback failed! Manual intervention required."
    fi
    exit 1
}

# Run pre-deploy checks unless --skip-checks
if [ "$SKIP_CHECKS" = false ]; then
    echo ""
    echo "🧪 Running pre-deploy checks..."
    
    if [ "${FORCE_CHECK_FAIL:-0}" = "1" ]; then
        echo "⚠️  FORCE_CHECK_FAIL=1: treating checks as failed (rollback drill)"
        checks_failed
    elif [ -n "${DEPLOY_CHECK_CMD:-}" ]; then
        echo "🔍 Running DEPLOY_CHECK_CMD..."
        if bash -c "$DEPLOY_CHECK_CMD"; then
            echo "✅ All pre-deploy checks passed!"
        else
            checks_failed
        fi
    elif [ ! -d "e2e" ] || [ ! -f "e2e/package.json" ]; then
        echo "⚠️  Pre-deploy checks not configured (e2e/ directory missing)"
        echo "   Skipping checks for this deploy."
    else
        cd e2e
        
        # Check Node version
        if ! check_node_version; then
            echo "⚠️  Skipping Playwright checks due to Node version"
            cd ..
        else
            # Install dependencies if needed
            if [ ! -d "node_modules" ]; then
                echo "📦 Installing pre-deploy check dependencies..."
                npm ci --include=dev
                echo "📦 Installing Playwright browser..."
                echo "   (If this fails, run: sudo npx playwright install-deps chromium)"
                npx playwright install chromium || {
                    echo "⚠️  Playwright browser install failed."
                    echo "   Try: sudo npx playwright install-deps chromium"
                    cd ..
                    # Don't fail deploy, but warn
                    echo "⚠️  Continuing without Playwright checks"
                }
            fi
            
            # Run the checks
            if [ -d "node_modules" ]; then
                echo ""
                echo "🔍 Running Playwright checks against $CHECK_BASE_URL (resolved to $CHECK_IP, local stack)..."
                if BASE_URL="$CHECK_BASE_URL" CHECK_RESOLVE_TO="$CHECK_IP" CHECK_EXPECT_SERVER_IP="$CHECK_IP" npm run predeploy:check; then
                    echo ""
                    echo "✅ All pre-deploy checks passed!"
                    cd ..
                else
                    cd ..
                    checks_failed
                fi
            else
                cd ..
            fi
        fi
    fi
else
    echo ""
    echo "⚠️  =============================================="
    echo "⚠️  SKIPPING PRE-DEPLOY CHECKS (--skip-checks)"
    echo "⚠️  This deployment was NOT validated!"
    echo "⚠️  =============================================="
fi

# Final health check
if [ "$HEALTH_OK" = false ]; then
    echo ""
    echo "❌ Basic health checks failed after deploy."
    if [ "$SKIP_CHECKS" = false ]; then
        if rollback; then
            echo "🔙 Rolled back to previous version."
        else
            echo "❌ Rollback failed! Manual intervention required."
        fi
        exit 1
    else
        echo "⚠️  Continuing anyway due to --skip-checks"
    fi
fi

echo ""
echo "🎉 =============================================="
echo "🎉 Deployment completed successfully!"
echo "🎉 =============================================="
echo ""
echo "📋 Post-deploy checklist:"
echo "   1. Run ./scripts/production-qa-smoke.sh"
echo "   2. Check https://orthoandspinetools.com"
echo "   3. Verify analytics: ./scripts/analytics-durability-report.sh"
echo ""
echo "🔗 Services:"
echo "   - Website: https://orthoandspinetools.com"
echo "   - Health:  https://orthoandspinetools.com/health"
echo ""
echo "📊 Logs: docker compose -f $COMPOSE_FILE logs -f"
