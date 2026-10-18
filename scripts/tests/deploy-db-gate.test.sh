#!/bin/bash
# Tests for the deploy.sh database gate (scripts/lib/deploy-db.sh; DB safety audit items 1 and 4).
# No docker needed: docker and df are logging stubs on PATH. Runs the REAL deploy.sh end to end.
#
#   1. Happy path: dump -> verify -> migrate (as ost_migrator, new image, -e DATABASE_URL) ->
#      switch (compose up), in that order. The dump is 600 with a .sha256; the URL is never printed.
#   2. Fail-closed: pg_dump error, empty/small dump, corrupt gzip, table-count mismatch, missing
#      implants COPY: deploy exits non-zero, never migrates, never switches.
#   3. Migrator config: missing .env.migrate, wrong role, loose permissions, or a failed migrate
#      stop the deploy before the switch. --no-migrate still dumps and switches without migrating.
#   4. --dry-run reports the gate and changes nothing.
#
# Usage: bash scripts/tests/deploy-db-gate.test.sh   (non-root)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$REPO_ROOT/deploy.sh"
WORK="$(mktemp -d)"
FAILS=0
trap 'rm -rf "$WORK"' EXIT
pass() { echo "  PASS: $*"; }
fail() { echo "  FAIL: $*"; FAILS=$((FAILS + 1)); }

SECRET_PW="test-only-$(date +%s)-not-a-real-password"
mkdir -p "$WORK/bin" "$WORK/run"
cat > "$WORK/bin/docker" <<SHIM
#!/bin/bash
echo "docker \$*" >> "$WORK/docker.log"
if [ "\$1" = exec ] && [[ " \$* " == *" pg_dump "* ]]; then
    [ "\${FAKE_PGDUMP_RC:-0}" = 0 ] || exit "\$FAKE_PGDUMP_RC"
    [ "\${FAKE_DUMP_MODE:-ok}" = empty ] && exit 0
    for i in \$(seq 1 \${FAKE_DUMP_TABLES:-39}); do echo "CREATE TABLE public.t\$i (id integer);"; done
    if [ "\${FAKE_DUMP_MODE:-ok}" != no-implants ]; then
        echo "COPY public.implants (id, slug) FROM stdin;"; echo "1	x"; echo '\\.'
    fi
    exit 0
fi
if [ "\$1" = exec ] && [[ " \$* " == *" psql "* ]]; then echo "\${FAKE_LIVE_TABLES:-39}"; exit 0; fi
if [ "\$1" = compose ] && [[ " \$* " == *" run "* ]]; then
    u="\${DATABASE_URL#*://}"; echo "run-db-user=\${u%%:*}" >> "$WORK/docker.log"
    exit "\${FAKE_MIGRATE_RC:-0}"
fi
exit 0
SHIM
cat > "$WORK/bin/df" <<'SHIM'
#!/bin/bash
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "/dev/root 80000000 30000000 41943040 50% /"
SHIM
# A gzip that corrupts its output on demand (to test the gzip -t gate).
REAL_GZIP="$(command -v gzip)"
cat > "$WORK/bin/gzip" <<SHIM
#!/bin/bash
if [ "\${FAKE_GZIP_CORRUPT:-0}" = 1 ] && [ "\$1" = -6 ]; then "$REAL_GZIP" "\$@" | head -c 200; exit 0; fi
exec "$REAL_GZIP" "\$@"
SHIM
chmod +x "$WORK/bin/docker" "$WORK/bin/df" "$WORK/bin/gzip"
echo "services: {}" > "$WORK/run/compose.yml"
echo "POSTGRES_PASSWORD=unused" > "$WORK/run/.env"

write_migrate_env() { # <role> <mode>
    ( umask 077; printf 'MIGRATE_DATABASE_URL=postgresql://%s:%s@postgres:5432/orthoandspinetools\n' "$1" "$SECRET_PW" > "$WORK/run/.env.migrate" )
    chmod "$2" "$WORK/run/.env.migrate"
}

run_deploy() {
    : > "$WORK/docker.log"
    rm -rf "$WORK/run/.deploy-backups"
    set +e
    (cd "$WORK/run" && PATH="$WORK/bin:$PATH" DEPLOY_COMPOSE_FILE=compose.yml DEPLOY_HEALTH_CMD=true \
        DEPLOY_CHECK_CMD=true DEPLOY_DUMP_MIN_BYTES=200 "$DEPLOY" "$@") > "$WORK/deploy.out" 2>&1
    local rc=$?
    set -e
    return $rc
}
line_of() { grep -nE "$1" "$WORK/docker.log" | head -n1 | cut -d: -f1; }
switched() { grep -Eq 'compose -f compose.yml up -d backend frontend bot-analytics' "$WORK/docker.log"; }
migrated() { grep -Eq 'compose -f compose.yml run .*prisma migrate deploy' "$WORK/docker.log"; }

echo "== 1: happy path order and secrecy =="
write_migrate_env ost_migrator 600
RC=0; run_deploy || RC=$?
if [ "$RC" -eq 0 ]; then pass "deploy exits 0"; else fail "deploy rc=$RC"; sed 's/^/    | /' "$WORK/deploy.out"; fi
B="$(line_of ' compose -f compose.yml build ')"; D="$(line_of '^docker exec .* pg_dump ')"
M="$(line_of 'run --rm --no-deps -T -e DATABASE_URL backend npx prisma migrate deploy')"
U="$(line_of 'up -d backend frontend bot-analytics')"
if [ -n "$B" ] && [ -n "$D" ] && [ -n "$M" ] && [ -n "$U" ] && [ "$B" -lt "$D" ] && [ "$D" -lt "$M" ] && [ "$M" -lt "$U" ]; then
    pass "order: build ($B) < dump ($D) < migrate ($M) < switch ($U)"
else
    fail "wrong order build=$B dump=$D migrate=$M switch=$U"; cat "$WORK/docker.log"
fi
if grep -q 'migrate status' "$WORK/docker.log"; then pass "migrate status checked after deploy"; else fail "no migrate status"; fi
if grep -qx 'run-db-user=ost_migrator' "$WORK/docker.log"; then pass "migration container got the ost_migrator URL via -e DATABASE_URL"; else fail "migrator URL not passed"; cat "$WORK/docker.log"; fi
if grep -q "$SECRET_PW" "$WORK/deploy.out" "$WORK/docker.log"; then fail "the migrator password appeared in output or argv"; else pass "migrator password never printed or on a command line"; fi
DUMP="$(ls "$WORK"/run/.deploy-backups/db/predeploy_*.sql.gz 2>/dev/null | head -n1)"
if [ -n "$DUMP" ] && [ "$(stat -c%a "$DUMP")" = 600 ] && [ -f "$DUMP.sha256" ]; then pass "verified dump is mode 600 with a .sha256"; else fail "dump missing, wrong mode or no sha256"; fi
if [ "$(stat -c%a "$WORK/run/.deploy-backups/db")" = 700 ]; then pass "dump directory is 700"; else fail "dump directory not 700"; fi

echo ""
echo "== 2: fail-closed dump checks =="
dump_fail_case() { # <label> <expected message> env...
    local label="$1" msg="$2"; shift 2
    RC=0; env "$@" bash -c "$(declare -f run_deploy); WORK='$WORK' DEPLOY='$DEPLOY'; run_deploy" || RC=$?
    if [ "$RC" -ne 0 ]; then pass "$label: deploy exits non-zero"; else fail "$label: deploy exited 0"; fi
    if grep -q "$msg" "$WORK/deploy.out"; then pass "$label: says '$msg'"; else fail "$label: missing message"; sed 's/^/    | /' "$WORK/deploy.out"; fi
    if migrated || switched; then fail "$label: migrated or switched anyway"; cat "$WORK/docker.log"; else pass "$label: no migration, no switch"; fi
}
dump_fail_case "pg_dump error" "pg_dump failed" FAKE_PGDUMP_RC=1
dump_fail_case "empty dump" "below the 200-byte minimum" FAKE_DUMP_MODE=empty
dump_fail_case "corrupt gzip" "failed gzip -t" FAKE_GZIP_CORRUPT=1
dump_fail_case "table count mismatch" "dump has 38 CREATE TABLE statements; live database has 39" FAKE_DUMP_TABLES=38
dump_fail_case "below minimum tables" "minimum 30" FAKE_DUMP_TABLES=5 FAKE_LIVE_TABLES=5
dump_fail_case "no implants COPY" "no implants COPY section" FAKE_DUMP_MODE=no-implants

echo ""
echo "== 3: migrator configuration and failures =="
mig_fail_case() { # <label> <expected message> [env...]
    local label="$1" msg="$2"; shift 2
    RC=0; env "$@" bash -c "$(declare -f run_deploy); WORK='$WORK' DEPLOY='$DEPLOY'; run_deploy" || RC=$?
    if [ "$RC" -ne 0 ]; then pass "$label: deploy exits non-zero"; else fail "$label: deploy exited 0"; fi
    if grep -q "$msg" "$WORK/deploy.out"; then pass "$label: says '$msg'"; else fail "$label: missing message"; sed 's/^/    | /' "$WORK/deploy.out"; fi
    if switched; then fail "$label: switched anyway"; else pass "$label: no switch"; fi
    if grep -q "$SECRET_PW" "$WORK/deploy.out"; then fail "$label: password printed"; fi
}
rm -f "$WORK/run/.env.migrate"
mig_fail_case "missing .env.migrate" ".env.migrate not found"
write_migrate_env postgres 600
mig_fail_case "superuser URL" "must use the ost_migrator role"
write_migrate_env ost_app 600
mig_fail_case "app role URL" "must use the ost_migrator role"
write_migrate_env ost_migrator 644
mig_fail_case "world-readable .env.migrate" "must be mode 600"
write_migrate_env ost_migrator 600
mig_fail_case "prisma migrate deploy fails" "prisma migrate deploy failed" FAKE_MIGRATE_RC=1
rm -f "$WORK/run/.env.migrate"
RC=0; run_deploy --no-migrate || RC=$?
if [ "$RC" -eq 0 ] && grep -q 'pg_dump' "$WORK/docker.log" && ! migrated && switched; then
    pass "--no-migrate: dump still gates, no migration, switch happens"
else
    fail "--no-migrate behaved wrong (rc=$RC)"; cat "$WORK/docker.log"
fi

echo ""
echo "== 4: --dry-run =="
RC=0; run_deploy --dry-run || RC=$?
if [ "$RC" -eq 0 ] && grep -q 'Would dump orthoandspinetools' "$WORK/deploy.out" && grep -q 'A real deploy would STOP before the switch' "$WORK/deploy.out"; then
    pass "dry run reports the dump gate and the missing migrator config"
else
    fail "dry run output wrong (rc=$RC)"; sed 's/^/    | /' "$WORK/deploy.out"
fi
if grep -Eq 'pg_dump|compose .*(run|up|build)' "$WORK/docker.log"; then fail "dry run touched the database or containers"; else pass "dry run ran no dump, migrate, build or switch"; fi

echo ""
if [ "$FAILS" -eq 0 ]; then echo "ALL DEPLOY DB GATE TESTS PASSED"; else echo "$FAILS ASSERTION(S) FAILED"; exit 1; fi
