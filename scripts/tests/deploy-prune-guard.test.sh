#!/bin/bash
# Guard tests for the deploy.sh disk check and build-cache prune. No docker needed:
# docker and df are replaced by logging stubs on PATH.
#
#   1. deploy.sh (and the lib it sources) never contains volume prune, system prune,
#      image prune, rmi, or a prune with -a/--all; the only prune is the allowlisted
#      "docker builder prune -f", and it is called after the success banner.
#   2. Disk check: mocked df below 5G makes deploy.sh exit non-zero with a plain message
#      before any docker build; 5G or more passes.
#   3. Prune runs only after the health check succeeds: a simulated failed health check,
#      a failed deploy health state, or --skip-checks means no prune.
#   4. --dry-run prints the prune command without running it.
#
# Usage: bash scripts/tests/deploy-prune-guard.test.sh   (non-root)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$REPO_ROOT/deploy.sh"
LIB="$REPO_ROOT/scripts/lib/deploy-disk-prune.sh"
WORK="$(mktemp -d)"
FAILS=0
trap 'rm -rf "$WORK"' EXIT

pass() { echo "  PASS: $*"; }
fail() { echo "  FAIL: $*"; FAILS=$((FAILS + 1)); }

# Executable lines only (comments and echo/printf text are not commands).
code_lines() {
    grep -vE '^[[:space:]]*#' "$1" | grep -vE '^[[:space:]]*(echo|printf)[[:space:]]'
}

echo "== 1: static guard on deploy.sh and scripts/lib/deploy-disk-prune.sh =="
for f in "$DEPLOY" "$LIB"; do
    name="${f#"$REPO_ROOT"/}"
    for pat in 'volume[[:space:]]+prune' 'system[[:space:]]+prune' 'image[[:space:]]+prune' '(^|[[:space:]])rmi([[:space:]]|$)' 'prune[^#]*[[:space:]](-a|--all)([[:space:]=]|$)' 'prune[^#]*[[:space:]]-[a-zA-Z]*a[a-zA-Z]*([[:space:]]|$)'; do
        if code_lines "$f" | grep -En "$pat" > /dev/null; then
            fail "$name has a forbidden command matching /$pat/"; code_lines "$f" | grep -En "$pat" || true
        else
            pass "$name: no /$pat/"
        fi
    done
done
# Commands that run a prune (the readonly allowlist definition is checked separately).
PRUNES="$( { code_lines "$DEPLOY"; code_lines "$LIB"; } | grep -E 'docker[[:space:]].*prune' | grep -vE '^readonly DEPLOY_PRUNE_CMD=' || true)"
if [ "$(printf '%s\n' "$PRUNES" | grep -c . || true)" = "1" ] && printf '%s' "$PRUNES" | grep -Eq '^[[:space:]]*if ! docker builder prune -f; then$'; then
    pass "exactly one prune command, the allowlisted 'docker builder prune -f'"
else
    fail "prune commands are not exactly the allowlisted one:"; printf '%s\n' "$PRUNES"
fi
if grep -Eq '^readonly DEPLOY_PRUNE_CMD="docker builder prune -f"$' "$LIB"; then
    pass "DEPLOY_PRUNE_CMD is the fixed allowlisted string (readonly)"
else
    fail "DEPLOY_PRUNE_CMD is not the fixed string"
fi
BANNER_LINE="$(grep -n 'Deployment completed successfully' "$DEPLOY" | head -n1 | cut -d: -f1)"
PRUNE_CALL_LINE="$(grep -nE '^dd_prune_build_cache "\$HEALTH_OK" "\$SKIP_CHECKS" false$' "$DEPLOY" | cut -d: -f1)"
HEALTH_GATE_LINE="$(grep -n 'if \[ "\$HEALTH_OK" = false \]; then' "$DEPLOY" | tail -n1 | cut -d: -f1)"
if [ -n "$PRUNE_CALL_LINE" ] && [ -n "$BANNER_LINE" ] && [ "$PRUNE_CALL_LINE" -gt "$BANNER_LINE" ] && [ "$PRUNE_CALL_LINE" -gt "$HEALTH_GATE_LINE" ]; then
    pass "prune is called once, after the final health gate (line $HEALTH_GATE_LINE) and the success banner (line $BANNER_LINE)"
else
    fail "prune call is not after the health gate and success banner (call=$PRUNE_CALL_LINE banner=$BANNER_LINE gate=$HEALTH_GATE_LINE)"
fi
if [ "$(grep -cE '^[[:space:]]*dd_prune_build_cache ' "$DEPLOY")" = "2" ]; then
    pass "deploy.sh calls the prune helper only in the success path and the dry-run report"
else
    fail "unexpected number of dd_prune_build_cache calls"; grep -nE 'dd_prune_build_cache' "$DEPLOY"
fi
BUILD_LINE="$(grep -nE '^docker compose -f "\$COMPOSE_FILE" build' "$DEPLOY" | head -n1 | cut -d: -f1)"
DISK_LINE="$(grep -nE '^if ! dd_disk_check; then$' "$DEPLOY" | head -n1 | cut -d: -f1)"
RECORD_LINE="$(grep -nE 'dr_record \|\| RECORD_RC' "$DEPLOY" | head -n1 | cut -d: -f1)"
if [ -n "$DISK_LINE" ] && [ "$DISK_LINE" -lt "$BUILD_LINE" ] && [ "$DISK_LINE" -lt "$RECORD_LINE" ]; then
    pass "disk check (line $DISK_LINE) runs before tagging (line $RECORD_LINE) and build (line $BUILD_LINE)"
else
    fail "disk check is not before tagging and build"
fi

# ---- stubs -----------------------------------------------------------------
mkdir -p "$WORK/bin" "$WORK/run"
cat > "$WORK/bin/docker" <<SHIM
#!/bin/bash
echo "docker \$*" >> "$WORK/docker.log"
exit 0
SHIM
cat > "$WORK/bin/df" <<SHIM
#!/bin/bash
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "/dev/root 80000000 70000000 \${FAKE_DF_AVAIL_KB:?} \${FAKE_DF_USE_PCT:-50}% /"
SHIM
chmod +x "$WORK/bin/docker" "$WORK/bin/df"
echo "services: {}" > "$WORK/run/compose.yml"
echo "POSTGRES_PASSWORD=unused" > "$WORK/run/.env"

run_deploy() {
    : > "$WORK/docker.log"
    set +e
    (cd "$WORK/run" && PATH="$WORK/bin:$PATH" DEPLOY_COMPOSE_FILE=compose.yml "$DEPLOY" "$@") > "$WORK/deploy.out" 2>&1
    local rc=$?
    set -e
    return $rc
}

echo ""
echo "== 2: disk check with mocked df =="
RC=0; FAKE_DF_AVAIL_KB=$((4 * 1024 * 1024)) run_deploy || RC=$?
if [ "$RC" -ne 0 ]; then pass "deploy.sh exits non-zero with 4.0G free (rc=$RC)"; else fail "deploy.sh exited 0 with 4.0G free"; fi
if grep -q 'not enough free disk space on /: 4.0G free, need at least 5G' "$WORK/deploy.out"; then
    pass "plain error message names free space and the 5G minimum"
else
    fail "missing disk error message"; sed 's/^/    | /' "$WORK/deploy.out"
fi
if grep -Eq ' (build|up|tag|compose)( |$)' "$WORK/docker.log"; then
    fail "docker build/tag/compose ran despite the disk check"; cat "$WORK/docker.log"
else
    pass "no docker build, tag or compose call before the disk check stopped the deploy"
fi
RC=0; FAKE_DF_AVAIL_KB=$((5 * 1024 * 1024 - 1)) run_deploy || RC=$?
if [ "$RC" -ne 0 ]; then pass "just under 5G fails"; else fail "just under 5G passed"; fi

# shellcheck source=scripts/lib/deploy-disk-prune.sh
source "$LIB"
if (PATH="$WORK/bin:$PATH" FAKE_DF_AVAIL_KB=$((5 * 1024 * 1024)) dd_disk_check > /dev/null); then pass "exactly 5G passes"; else fail "exactly 5G failed"; fi
if (PATH="$WORK/bin:$PATH" FAKE_DF_AVAIL_KB=$((40 * 1024 * 1024)) dd_disk_check > /dev/null); then pass "40G passes"; else fail "40G failed"; fi
if (PATH="$WORK/bin:$PATH" FAKE_DF_AVAIL_KB=garbage dd_disk_check > /dev/null 2>&1); then fail "unreadable df passed"; else pass "unreadable df output fails closed"; fi
if (PATH="$WORK/bin:$PATH" FAKE_DF_AVAIL_KB=$((40 * 1024 * 1024)) FAKE_DF_USE_PCT=garbage dd_disk_check > /dev/null 2>&1); then fail "unreadable use% passed"; else pass "unreadable use% fails closed"; fi

echo ""
echo "== 2b: use% gate (build cache and images share /) =="
RC=0; FAKE_DF_AVAIL_KB=$((40 * 1024 * 1024)) FAKE_DF_USE_PCT=92 run_deploy || RC=$?
if [ "$RC" -ne 0 ]; then pass "40G free but 92% used fails (rc=$RC)"; else fail "92% used passed"; fi
if grep -q '/ is 92% full (40.0G free); a build needs it below 90%' "$WORK/deploy.out"; then
    pass "plain error message names use% and the 90% limit"
else
    fail "missing use% error message"; sed 's/^/    | /' "$WORK/deploy.out"
fi
if grep -Eq ' (build|up|tag|compose|exec)( |$)' "$WORK/docker.log"; then
    fail "docker build/tag/compose/exec ran despite the use% gate"; cat "$WORK/docker.log"
else
    pass "no docker build, tag, compose or exec call before the use% gate stopped the deploy"
fi
if (PATH="$WORK/bin:$PATH" FAKE_DF_AVAIL_KB=$((6 * 1024 * 1024)) FAKE_DF_USE_PCT=90 dd_disk_check > /dev/null 2>&1); then fail "exactly 90% passed"; else pass "exactly 90% fails"; fi
if (PATH="$WORK/bin:$PATH" FAKE_DF_AVAIL_KB=$((6 * 1024 * 1024)) FAKE_DF_USE_PCT=89 dd_disk_check > /dev/null); then pass "6G free at 89% passes"; else fail "6G at 89% failed"; fi
if (PATH="$WORK/bin:$PATH" FAKE_DF_AVAIL_KB=$((4 * 1024 * 1024)) FAKE_DF_USE_PCT=10 dd_disk_check > /dev/null 2>&1); then fail "4G free at 10% passed"; else pass "4G free fails even at 10% used (both conditions required)"; fi

echo ""
echo "== 3: prune only after a passing health check =="
prune_case() {  # <label> <health_cmd_rc> <health_ok> <skip_checks> <want: yes|no>
    local label="$1" hc="$2" ok="$3" skip="$4" want="$5"
    : > "$WORK/docker.log"
    (
        dr_health_check() { return "$hc"; }
        PATH="$WORK/bin:$PATH" dd_prune_build_cache "$ok" "$skip" false
    ) > "$WORK/prune.out" 2>&1
    if grep -q 'builder prune' "$WORK/docker.log"; then got=yes; else got=no; fi
    if [ "$got" = "$want" ]; then pass "$label: prune=$got"; else fail "$label: prune=$got, want $want"; cat "$WORK/prune.out"; fi
    if [ "$got" = yes ]; then
        if [ "$(cat "$WORK/docker.log")" = "docker builder prune -f" ]; then
            pass "$label: ran exactly 'docker builder prune -f' and nothing else"
        else
            fail "$label: unexpected docker calls"; cat "$WORK/docker.log"
        fi
    fi
}
prune_case "simulated failed health check" 1 true false no
prune_case "deploy health checks failed (HEALTH_OK=false)" 0 false false no
prune_case "--skip-checks deploy" 0 true true no
prune_case "validated deploy, health check passes" 0 true false yes

echo ""
echo "== 4: --dry-run prints the prune command without running it =="
RC=0; FAKE_DF_AVAIL_KB=$((40 * 1024 * 1024)) run_deploy --dry-run || RC=$?
if [ "$RC" -eq 0 ]; then pass "dry run exits 0"; else fail "dry run rc=$RC"; sed 's/^/    | /' "$WORK/deploy.out"; fi
if grep -q 'would run: docker builder prune -f' "$WORK/deploy.out"; then pass "dry run prints the prune command"; else fail "dry run did not print the prune command"; fi
if grep -q 'builder prune' "$WORK/docker.log"; then fail "dry run ran docker builder prune"; else pass "dry run did not run any prune"; fi

echo ""
if [ "$FAILS" -eq 0 ]; then
    echo "ALL DEPLOY PRUNE GUARD TESTS PASSED"
else
    echo "$FAILS ASSERTION(S) FAILED"
    exit 1
fi
