#!/bin/bash
# shellcheck shell=bash
# Disk guard and build-cache prune for deploy.sh. Sourced by deploy.sh, not executed.
#
# Each deploy adds about 2.3G of docker build cache and / sits near 90% after a deploy.
#   dd_disk_check          fails before any build when / has less than 5G free.
#   dd_prune_build_cache   runs the ONE allowlisted prune (build cache only) after a
#                          successful, validated deploy whose health check passes.
# Never prune volumes, images or the system here, and never remove pre-deploy-* tags:
# they are the rollback path. scripts/tests/deploy-prune-guard.test.sh enforces this.

# Free space on / required before any build, in GiB.
readonly DEPLOY_MIN_FREE_GB=5

# The only prune deploy.sh may run. Build cache only.
readonly DEPLOY_PRUNE_CMD="docker builder prune -f"

# Available KiB on /, from POSIX df output.
dd_free_kb() {
    df -Pk / | awk 'NR==2 {print $4}'
}

dd_disk_check() {
    local free_kb need_kb free_gb
    free_kb="$(dd_free_kb)"
    need_kb=$((DEPLOY_MIN_FREE_GB * 1024 * 1024))
    if ! [[ "$free_kb" =~ ^[0-9]+$ ]]; then
        echo "deploy: could not read free disk space on / (df gave '$free_kb'). Nothing was built." >&2
        return 1
    fi
    free_gb="$(awk -v k="$free_kb" 'BEGIN { printf "%.1f", k / 1048576 }')"
    if [ "$free_kb" -lt "$need_kb" ]; then
        echo "deploy: not enough free disk space on /: ${free_gb}G free, need at least ${DEPLOY_MIN_FREE_GB}G." >&2
        echo "deploy: nothing was built. Free space first (build cache: $DEPLOY_PRUNE_CMD), then run deploy.sh again." >&2
        return 1
    fi
    echo "💾 Disk check: ${free_gb}G free on / (minimum ${DEPLOY_MIN_FREE_GB}G)"
}

# Usage: dd_prune_build_cache <health_ok> <skip_checks> <dry_run>
# Prunes only when the deploy was validated (no --skip-checks), the deploy health
# checks passed, and a fresh dr_health_check passes right now.
dd_prune_build_cache() {
    local health_ok="$1" skip_checks="$2" dry_run="$3"
    if [ "$dry_run" = true ]; then
        if [ "$skip_checks" = true ]; then
            echo "🔍 DRY RUN: would skip the build cache prune (--skip-checks deploys are not validated)"
        else
            echo "🔍 DRY RUN: after a successful deploy and a passing health check, would run: $DEPLOY_PRUNE_CMD"
        fi
        return 0
    fi
    if [ "$skip_checks" = true ]; then
        echo "🧹 Build cache prune skipped: deploy was not validated (--skip-checks)"
        return 0
    fi
    if [ "$health_ok" != true ]; then
        echo "🧹 Build cache prune skipped: health checks did not pass"
        return 0
    fi
    if ! dr_health_check > /dev/null 2>&1; then
        echo "🧹 Build cache prune skipped: final health check failed"
        return 0
    fi
    echo "🧹 Pruning build cache: $DEPLOY_PRUNE_CMD"
    if ! docker builder prune -f; then
        echo "⚠️  Build cache prune failed; the deploy itself succeeded."
    fi
}
