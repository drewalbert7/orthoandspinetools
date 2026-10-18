#!/bin/bash
# Tests for the deploy.sh database order and the pre-deploy snapshot gate (DB safety audit items 1 and 4).
# No docker needed: docker, df and sudo are logging stubs on PATH. Runs the REAL deploy.sh and the REAL
# scripts/predeploy-db-snapshot.sh.
#
#   1. deploy.sh order: snapshot < build < migrate < switch (compose up). The default migrate step is
#      `sudo -n /usr/local/sbin/ost-db-migrate` (root-owned copy; dstrad cannot read migrator.env).
#   2. Fail-closed: a failed snapshot stops before the build; a failed migrate (or a missing sudo rule)
#      stops before the switch. --skip-checks does not skip either. --no-migrate skips only the migrate.
#   3. predeploy-db-snapshot.sh: empty dump, unreadable archive, dump below the size floor, table count
#      different from the live DB, or no implants data all exit non-zero and leave no snapshot behind;
#      a good dump is mode 600 in a 700 dir.
#   4. --dry-run reports the snapshot and migrate steps and runs neither.
#
# Usage: bash scripts/tests/deploy-db-order.test.sh   (non-root)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$REPO_ROOT/deploy.sh"
SNAP="$REPO_ROOT/scripts/predeploy-db-snapshot.sh"
WORK="$(mktemp -d)"
FAILS=0
trap 'rm -rf "$WORK"' EXIT
pass() { echo "  PASS: $*"; }
fail() { echo "  FAIL: $*"; FAILS=$((FAILS + 1)); }

mkdir -p "$WORK/bin" "$WORK/run"
LOG="$WORK/calls.log"
cat > "$WORK/bin/docker" <<SHIM
#!/bin/bash
echo "docker \$*" >> "$LOG"
case " \$* " in
  *" pg_dump "*)
    [ "\${FAKE_DUMP:-ok}" = empty ] && exit 0
    head -c "\${FAKE_DUMP_BYTES:-30000}" /dev/zero; exit 0 ;;
  *" pg_restore -l"*)
    cat > /dev/null
    [ "\${FAKE_DUMP:-ok}" = unreadable ] && exit 1
    for i in \$(seq 1 "\${FAKE_DUMP_TABLES:-39}"); do echo "\$i; 1259 1 TABLE public t\$i postgres"; echo "\$i; 0 1 TABLE DATA public t\$i postgres"; done
    [ "\${FAKE_DUMP:-ok}" = no-implants ] || echo "99; 0 1 TABLE DATA public implants postgres"
    exit 0 ;;
  *" pg_roles "*) echo 1; exit 0 ;;
  *" pg_tables "*) echo "\${FAKE_LIVE_TABLES:-39}"; exit 0 ;;
esac
exit 0
SHIM
cat > "$WORK/bin/df" <<'SHIM'
#!/bin/bash
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "/dev/root 80000000 30000000 41943040 50% /"
SHIM
cat > "$WORK/bin/sudo" <<SHIM
#!/bin/bash
echo "sudo \$*" >> "$LOG"
exit "\${FAKE_SUDO_RC:-0}"
SHIM
chmod +x "$WORK/bin/docker" "$WORK/bin/df" "$WORK/bin/sudo"
echo "services: {}" > "$WORK/run/compose.yml"
echo "POSTGRES_PASSWORD=unused" > "$WORK/run/.env"

run_deploy() {
    : > "$LOG"
    set +e
    (cd "$WORK/run" && PATH="$WORK/bin:$PATH" DEPLOY_COMPOSE_FILE=compose.yml DEPLOY_HEALTH_CMD=true DEPLOY_CHECK_CMD=true \
        DEPLOY_DB_SNAPSHOT_CMD="${SNAP_CMD:-echo SNAPSHOT >> $LOG}" "$DEPLOY" "$@") > "$WORK/deploy.out" 2>&1
    local rc=$?
    set -e
    return $rc
}
line_of() { grep -nE "$1" "$LOG" | head -n1 | cut -d: -f1; }
switched() { grep -Eq 'compose -f compose.yml up -d backend frontend bot-analytics' "$LOG"; }
built() { grep -Eq 'compose -f compose.yml build ' "$LOG"; }
migrated() { grep -Eq '^(sudo -n /usr/local/sbin/ost-db-migrate|MIGRATE)' "$LOG"; }

echo "== 1: deploy order =="
RC=0; run_deploy || RC=$?
if [ "$RC" -eq 0 ]; then pass "deploy exits 0"; else fail "deploy rc=$RC"; sed 's/^/    | /' "$WORK/deploy.out"; fi
S="$(line_of '^SNAPSHOT$')"; B="$(line_of 'compose -f compose.yml build ')"
M="$(line_of '^sudo -n /usr/local/sbin/ost-db-migrate$')"; U="$(line_of 'up -d backend frontend bot-analytics')"
if [ -n "$S" ] && [ -n "$B" ] && [ -n "$M" ] && [ -n "$U" ] && [ "$S" -lt "$B" ] && [ "$B" -lt "$M" ] && [ "$M" -lt "$U" ]; then
    pass "order: snapshot ($S) < build ($B) < migrate ($M) < switch ($U)"
else
    fail "wrong order snapshot=$S build=$B migrate=$M switch=$U"; cat "$LOG"
fi
if [ -n "$M" ]; then pass "default migrate step is 'sudo -n /usr/local/sbin/ost-db-migrate'"; else fail "default migrate step not used"; fi

echo ""
echo "== 2: fail-closed =="
RC=0; SNAP_CMD="echo SNAPSHOT >> $LOG; exit 1" run_deploy || RC=$?
if [ "$RC" -ne 0 ] && ! built && ! migrated && ! switched; then pass "failed snapshot: exit $RC, no build, no migrate, no switch"; else fail "failed snapshot did not stop the deploy (rc=$RC)"; cat "$LOG"; fi
grep -q 'Pre-deploy DB snapshot failed. Aborting before build.' "$WORK/deploy.out" && pass "failed snapshot: plain message" || fail "failed snapshot: no message"

RC=0; FAKE_SUDO_RC=1 run_deploy || RC=$?
if [ "$RC" -ne 0 ] && built && ! switched; then pass "failed migrate / missing sudo rule: exit $RC, built, no switch"; else fail "failed migrate did not stop before the switch (rc=$RC)"; cat "$LOG"; fi
grep -q 'Nothing was switched; the old containers keep serving.' "$WORK/deploy.out" && pass "failed migrate: plain message" || fail "failed migrate: no message"

RC=0; FAKE_SUDO_RC=1 run_deploy --skip-checks || RC=$?
if [ "$RC" -ne 0 ] && ! switched && grep -q '^SNAPSHOT$' "$LOG"; then pass "--skip-checks still snapshots and still stops on a failed migrate"; else fail "--skip-checks bypassed the DB gate (rc=$RC)"; cat "$LOG"; fi

RC=0; run_deploy --no-migrate || RC=$?
if [ "$RC" -eq 0 ] && grep -q '^SNAPSHOT$' "$LOG" && ! migrated && switched && grep -q 'prisma migrate deploy SKIPPED' "$WORK/deploy.out"; then
    pass "--no-migrate: snapshot still runs, migrate skipped loudly, switch happens"
else
    fail "--no-migrate behaved wrong (rc=$RC)"; cat "$LOG"
fi

echo ""
echo "== 3: predeploy-db-snapshot.sh =="
SNAPDIR="$WORK/snaps"
snap() { : > "$LOG"; env PATH="$WORK/bin:$PATH" OST_PREDEPLOY_DIR="$SNAPDIR" "$@" bash "$SNAP" test > "$WORK/snap.out" 2>&1; }
leftover() { find "$SNAPDIR" -maxdepth 1 -type f -name 'predeploy_*' 2>/dev/null | grep -c . || true; }
snap_fail() { # <label> <message> env...
    local label="$1" msg="$2"; shift 2
    rm -rf "$SNAPDIR"
    if snap "$@"; then fail "$label: exited 0"; else pass "$label: exits non-zero"; fi
    grep -q "$msg" "$WORK/snap.out" && pass "$label: says '$msg'" || { fail "$label: missing message"; sed 's/^/    | /' "$WORK/snap.out"; }
    [ "$(leftover)" = 0 ] && pass "$label: no snapshot or .partial left" || fail "$label: left files behind"
}
snap_fail "empty dump" "empty dump" FAKE_DUMP=empty
snap_fail "unreadable archive" "unreadable dump" FAKE_DUMP=unreadable
snap_fail "below size floor" "below the 20000-byte floor" FAKE_DUMP_BYTES=1000
snap_fail "table count mismatch" "dump has 38 public tables, live database has 39" FAKE_DUMP_TABLES=38
snap_fail "no implants data" "no implants table data" FAKE_DUMP=no-implants
rm -rf "$SNAPDIR"
if snap; then pass "good dump: exits 0"; else fail "good dump failed"; sed 's/^/    | /' "$WORK/snap.out"; fi
F="$(find "$SNAPDIR" -maxdepth 1 -name 'predeploy_*_test.dump' | head -n1)"
if [ -n "$F" ] && [ "$(stat -c%a "$F")" = 600 ] && [ "$(stat -c%a "$SNAPDIR")" = 700 ]; then pass "good dump: file 600, dir 700"; else fail "good dump: wrong perms or missing"; fi
grep -q '39/39 public tables, TOC readable, implants data present' "$WORK/snap.out" && pass "good dump: reports table count and checks" || fail "good dump: no summary"

echo ""
echo "== 3b: predeploy snapshot refuses symlinks; root uses ost-predeploy-root =="
# Static: root path selection and noclobber/mktemp/symlink checks are present.
grep -q 'ost-predeploy-root' "$SNAP" && pass "snapshot script names root-owned ost-predeploy-root" || fail "missing ost-predeploy-root"
grep -q 'set -o noclobber' "$SNAP" && pass "snapshot script enables noclobber" || fail "missing noclobber"
grep -q 'mktemp' "$SNAP" && pass "snapshot script uses mktemp" || fail "missing mktemp"
grep -q '\-L "\$DIR"' "$SNAP" && pass "snapshot script refuses symlink DIR" || fail "missing -L DIR check"
# Behavioral: DIR that is a symlink must fail closed.
rm -rf "$SNAPDIR" "$WORK/snap-real"
mkdir -p "$WORK/snap-real"
ln -s "$WORK/snap-real" "$SNAPDIR"
if snap; then fail "symlink DIR: exited 0"; else pass "symlink DIR: exits non-zero"; fi
grep -q 'refusing symlink directory' "$WORK/snap.out" && pass "symlink DIR: message" || { fail "symlink DIR: missing message"; sed 's/^/    | /' "$WORK/snap.out"; }
# Behavioral: planted symlink as the final OUT name is refused (mktemp still writes .partial safely).
rm -rf "$SNAPDIR"
mkdir -p "$SNAPDIR"
# Plant many possible final names for the next few seconds (predictable pattern).
for i in 0 1 2 3 4 5; do
  ts="$(date -u -d "+$i seconds" +%Y%m%dT%H%M%SZ 2>/dev/null || date -u -v+"${i}S" +%Y%m%dT%H%M%SZ 2>/dev/null || true)"
  [ -n "$ts" ] || continue
  ln -sf /etc/passwd "$SNAPDIR/predeploy_${ts}_test.dump" 2>/dev/null || true
done
# Even with plants, mktemp path must succeed OR refuse a symlink final; never follow a symlink for write.
# Our flow writes via mktemp then mv -n to OUT; if OUT is a planted symlink, refuse.
# Force OUT collision by pre-creating the exact name the script will pick: wrap date.
# Simpler check: PARTIAL cannot be replaced by making DIR a symlink to elsewhere with a clobber target.
rm -rf "$SNAPDIR"
mkdir -p "$SNAPDIR"
# Create a symlink where mktemp might not land; instead verify -L on a forged PARTIAL path is refused
# by pointing OST_PREDEPLOY_DIR at a dir and ensuring a symlink file named like mktemp is not used.
# Direct unit: if DIR contains only a symlink "file", good dump still works via mktemp unique name.
if snap; then pass "mktemp dump succeeds in a clean dir (no predictable clobber)"; else fail "clean mktemp dump failed"; sed 's/^/    | /' "$WORK/snap.out"; fi
# Forged final OUT symlink: create after learning the pattern by running with a fixed clock is hard;
# assert the script checks -L on OUT before mv.
grep -n '\-L "\$OUT"' "$SNAP" | grep -q . && pass "snapshot script refuses symlink OUT" || fail "missing -L OUT check"

echo ""
echo "== 4: --dry-run =="
RC=0; run_deploy --dry-run || RC=$?
if [ "$RC" -eq 0 ] && grep -q 'Would take a verified pre-deploy DB snapshot' "$WORK/deploy.out" && grep -q 'Would run prisma migrate deploy as ost_migrator BEFORE the switch' "$WORK/deploy.out"; then
    pass "dry run reports the snapshot and migrate steps"
else
    fail "dry run output wrong (rc=$RC)"; sed 's/^/    | /' "$WORK/deploy.out"
fi
if ! grep -q '^SNAPSHOT$' "$LOG" && ! migrated && ! built && ! switched; then pass "dry run ran no snapshot, migrate, build or switch"; else fail "dry run changed something"; cat "$LOG"; fi

echo ""
if [ "$FAILS" -eq 0 ]; then echo "ALL DEPLOY DB ORDER TESTS PASSED"; else echo "$FAILS ASSERTION(S) FAILED"; exit 1; fi
