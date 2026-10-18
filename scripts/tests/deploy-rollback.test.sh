#!/bin/bash
# End-to-end test for deploy.sh auto-rollback, using real docker + compose.
#
# Builds a tiny compose project (busybox stand-ins named like production:
# postgres, backend, frontend, bot-analytics, nginx), deploys v1, then runs the REAL
# deploy.sh to deploy v2 twice:
#   1. failed-check path: FORCE_CHECK_FAIL=1 -> deploy.sh must exit non-zero and the
#      app containers must be back on the v1 image IDs, compose :latest tags must point
#      at v1, pre-deploy tags must be kept, postgres must not be recreated, and no
#      compose command may use --build during rollback.
#   2. passing-check path: DEPLOY_CHECK_CMD=true -> deploy.sh exits 0 and stays on v2.
#   3. failing stub check command: DEPLOY_CHECK_CMD records the image the backend runs
#      during the check (proves the new build was live) and exits 1 -> back on the
#      previous image IDs.
#
# Usage: scripts/tests/deploy-rollback.test.sh   (needs docker + docker compose, non-root)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
PROJECT="ostrbtest$$"
export COMPOSE_PROJECT_NAME="$PROJECT"
FAILS=0

cleanup() {
    (cd "$WORK" && docker compose -f compose.yml down -t 1 --remove-orphans > /dev/null 2>&1) || true
    docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$PROJECT-" | xargs -r docker rmi -f > /dev/null 2>&1 || true
    rm -rf "$WORK"
}
trap cleanup EXIT

pass() { echo "  PASS: $*"; }
fail() { echo "  FAIL: $*"; FAILS=$((FAILS + 1)); }
assert_eq() { if [ "$1" = "$2" ]; then pass "$3 ($1)"; else fail "$3: got '$1', want '$2'"; fi; }
assert_ne() { if [ "$1" != "$2" ]; then pass "$3"; else fail "$3: both '$1'"; fi; }

short() { echo "${1#sha256:}" | cut -c1-12; }

# ---- fixture project -------------------------------------------------------
mkdir -p "$WORK/app" "$WORK/bin"
cat > "$WORK/app/Dockerfile" <<'DOCKERFILE'
FROM busybox:1.36
COPY version /version
CMD ["sh", "-c", "trap 'exit 0' TERM; while true; do sleep 1; done"]
DOCKERFILE

cat > "$WORK/compose.yml" <<'COMPOSE'
x-idle: &idle
  image: busybox:1.36
  command: ["sh", "-c", "trap 'exit 0' TERM; while true; do sleep 1; done"]
services:
  postgres:
    <<: *idle
  backend:
    build: ./app
    depends_on: [postgres]
  frontend:
    build: ./app
    depends_on: [backend]
  bot-analytics:
    build: ./app
    depends_on: [postgres]
  nginx:
    <<: *idle
    depends_on: [backend, frontend]
COMPOSE
echo "POSTGRES_PASSWORD=unused" > "$WORK/.env"

# docker shim: log every docker invocation so we can assert no --build during rollback.
REAL_DOCKER="$(command -v docker)"
cat > "$WORK/bin/docker" <<SHIM
#!/bin/bash
echo "docker \$*" >> "$WORK/docker.log"
exec "$REAL_DOCKER" "\$@"
SHIM
chmod +x "$WORK/bin/docker"

cd "$WORK"
dc() { docker compose -f compose.yml "$@"; }
running_id() { docker inspect --format '{{.Image}}' "$(dc ps -q "$1")"; }
container_id() { dc ps -q "$1"; }
tag_id() { docker image inspect --format '{{.Id}}' "$1" 2>/dev/null || echo none; }
version_in() { dc exec -T "$1" cat /version; }

export DEPLOY_COMPOSE_FILE=compose.yml
export DEPLOY_DB_SNAPSHOT_CMD=true
export DEPLOY_HEALTH_CMD="docker compose -f compose.yml exec -T backend cat /version && docker compose -f compose.yml exec -T frontend cat /version"
export ROLLBACK_HEALTH_TIMEOUT=10 ROLLBACK_HEALTH_INTERVAL=1

run_deploy() {
    : > "$WORK/docker.log"
    set +e
    PATH="$WORK/bin:$PATH" "$REPO_ROOT/deploy.sh" "$@" > "$WORK/deploy.out" 2>&1
    local rc=$?
    set -e
    # Drop buildkit progress lines to keep CI logs readable.
    grep -vE '^(#|$)' "$WORK/deploy.out" | sed 's/^/    | /' || true
    return $rc
}

echo "== setup: deploy v1 =="
echo v1 > app/version
dc up -d --build --quiet-pull > /dev/null 2>&1
V1_BACKEND="$(running_id backend)"; V1_FRONTEND="$(running_id frontend)"
PG_CID="$(container_id postgres)"
echo "  v1 backend=$(short "$V1_BACKEND") frontend=$(short "$V1_FRONTEND") postgres container=$(short "$PG_CID")"

echo ""
echo "== test 1: failed check rolls back to v1 =="
echo v2 > app/version
RC=0; FORCE_CHECK_FAIL=1 run_deploy || RC=$?
assert_ne "$RC" "0" "deploy.sh exits non-zero on failed check (rc=$RC)"
TS="$(sed -n 's/.*pre-deploy-\([0-9]\{8\}-[0-9]\{6\}\).*/\1/p' deploy.out | head -n1)"
echo "  image IDs before deploy: backend=$(short "$V1_BACKEND") frontend=$(short "$V1_FRONTEND")"
echo "  image IDs after rollback: backend=$(short "$(running_id backend)") frontend=$(short "$(running_id frontend)")"
assert_eq "$(running_id backend)" "$V1_BACKEND" "backend container back on v1 image ID"
assert_eq "$(running_id frontend)" "$V1_FRONTEND" "frontend container back on v1 image ID"
assert_eq "$(version_in backend)" "v1" "backend serves v1"
assert_eq "$(version_in frontend)" "v1" "frontend serves v1"
assert_eq "$(tag_id "$PROJECT-backend:latest")" "$V1_BACKEND" "$PROJECT-backend:latest retagged to v1"
assert_eq "$(tag_id "$PROJECT-frontend:latest")" "$V1_FRONTEND" "$PROJECT-frontend:latest retagged to v1"
assert_ne "$TS" "" "pre-deploy timestamp found in output ($TS)"
assert_eq "$(tag_id "$PROJECT-backend:pre-deploy-$TS")" "$V1_BACKEND" "pre-deploy backend tag kept"
assert_eq "$(tag_id "$PROJECT-frontend:pre-deploy-$TS")" "$V1_FRONTEND" "pre-deploy frontend tag kept"
assert_eq "$(container_id postgres)" "$PG_CID" "postgres container not recreated"
if grep -E 'compose .* up .*--build' "$WORK/docker.log" | grep -v -- '--no-build' > /dev/null; then
    fail "a compose up used --build"
else
    pass "no compose up used --build"
fi
if grep -E 'compose .* up .*--no-build --no-deps --force-recreate backend frontend' docker.log > /dev/null; then
    pass "rollback ran 'up -d --no-build --no-deps --force-recreate backend frontend'"
else
    fail "rollback did not run the expected --no-build --no-deps up"; grep -E 'compose .* up ' docker.log || true
fi
grep -q 'Rolled back to previous version' deploy.out && pass "deploy.sh reports rollback success" || fail "no rollback success message"

echo ""
echo "== test 2: passing check stays on v2 =="
echo v2b > app/version
RC=0; DEPLOY_CHECK_CMD=true run_deploy || RC=$?
assert_eq "$RC" "0" "deploy.sh exits 0 when checks pass"
NEW_BACKEND="$(running_id backend)"; NEW_FRONTEND="$(running_id frontend)"
echo "  image IDs: before=$(short "$V1_BACKEND")/$(short "$V1_FRONTEND") after=$(short "$NEW_BACKEND")/$(short "$NEW_FRONTEND")"
assert_ne "$NEW_BACKEND" "$V1_BACKEND" "backend moved off v1"
assert_ne "$NEW_FRONTEND" "$V1_FRONTEND" "frontend moved off v1"
assert_eq "$NEW_BACKEND" "$(tag_id "$PROJECT-backend:latest")" "backend runs the new :latest"
assert_eq "$(version_in backend)" "v2b" "backend serves new version"
assert_eq "$(container_id postgres)" "$PG_CID" "postgres container not recreated"

echo ""
echo "== test 3: failing stub check command rolls back to previous build =="
PREV_BACKEND="$NEW_BACKEND"; PREV_FRONTEND="$NEW_FRONTEND"
echo v3 > app/version
RC=0
DEPLOY_CHECK_CMD="docker inspect --format '{{.Image}}' \$(docker compose -f compose.yml ps -q backend) > $WORK/during-check.id; exit 1" \
    run_deploy || RC=$?
DURING="$(cat "$WORK/during-check.id" 2>/dev/null || echo none)"
echo "  image IDs: before=$(short "$PREV_BACKEND") during-check=$(short "$DURING") after=$(short "$(running_id backend)")"
assert_ne "$RC" "0" "deploy.sh exits non-zero on failing check command (rc=$RC)"
assert_ne "$DURING" "$PREV_BACKEND" "new backend build was live during the check"
assert_eq "$(running_id backend)" "$PREV_BACKEND" "backend back on previous image ID"
assert_eq "$(running_id frontend)" "$PREV_FRONTEND" "frontend back on previous image ID"
assert_eq "$(version_in backend)" "v2b" "backend serves previous version"
assert_eq "$(container_id postgres)" "$PG_CID" "postgres container not recreated"

echo ""
if [ "$FAILS" -eq 0 ]; then
    echo "ALL DEPLOY ROLLBACK TESTS PASSED"
else
    echo "$FAILS ASSERTION(S) FAILED"
    exit 1
fi
