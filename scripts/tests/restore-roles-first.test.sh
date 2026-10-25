#!/usr/bin/env bash
# Tests for the roles-first restore fix (2026-10-25 Sunday restore test failure).
# Static checks always run. The live part runs when local Postgres binaries are available
# (PG_BIN, or pg_config --bindir) and builds a tiny fixture where tables are owned by and
# granted to non-default roles, like OST prod after roles.sql.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

B=scripts/database-backup-production.sh
R=scripts/db/restore-scratch.sh
grep -q 'pg_dumpall -U "$DB_USER" --roles-only --no-role-passwords' "$B" || fail "backup script must dump roles without passwords"
grep -q 'roles_dir="$BACKUP_DIR/roles"' "$B" || fail "roles file must live in roles/ (outside the backup_*.sql.gz glob)"
grep -q 'chmod 600 "$roles_file"' "$B" || fail "roles file must be chmod 600"
pass "backup script writes a passwordless roles file"
grep -q -- '--network none' "$R" || fail "scratch container must have no network"
grep -q -- '--pull never' "$R" || fail "scratch must not pull images"
grep -A3 'DOCKER run' "$R" | grep -qE -- '(^|[[:space:]])(-p|--publish|-P|--publish-all|-v|--volume)[[:space:]=]' && fail "scratch container must not publish ports or mount volumes"
grep -q 'orthoandspinetools-postgres' "$R" || fail "scratch script must know the live container name to refuse it"
roles_line="$(grep -n 'applying roles failed' "$R" | head -1 | cut -d: -f1)"
restore_line="$(grep -n 'full restore, stop on the first error' "$R" | head -1 | cut -d: -f1)"
[[ -n "$roles_line" && -n "$restore_line" && "$roles_line" -lt "$restore_line" ]] || fail "roles must be applied before the restore"
pass "restore script is scratch-only and applies roles first"

PG_BIN="${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}"
if [[ -z "$PG_BIN" || ! -x "$PG_BIN/initdb" ]]; then
	echo "skip: live test (no local Postgres binaries; set PG_BIN)"
	exit 0
fi
T="$(mktemp -d)"
trap '"$PG_BIN/pg_ctl" -D "$T/src" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
"$PG_BIN/initdb" -D "$T/src" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$T/src" -w -l "$T/src.log" -o "-c listen_addresses='' -c unix_socket_directories=$T -p 55438" start >/dev/null
q() { "$PG_BIN/psql" -h "$T" -p 55438 -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
q -d postgres <<'SQL'
CREATE ROLE ost_migrator LOGIN PASSWORD 'fixture-only';
CREATE ROLE ost_app LOGIN;
CREATE DATABASE fx;
SQL
q -d fx <<'SQL'
CREATE TABLE public.implants (id int primary key, name text);
CREATE TABLE public.analytics_page_views (id int primary key, path text);
INSERT INTO public.implants SELECT g, 'i'||g FROM generate_series(1,5) g;
INSERT INTO public.analytics_page_views SELECT g, '/p'||g FROM generate_series(1,3) g;
ALTER TABLE public.implants OWNER TO ost_migrator;
ALTER TABLE public.analytics_page_views OWNER TO ost_migrator;
GRANT SELECT, INSERT ON public.implants, public.analytics_page_views TO ost_app;
SQL
"$PG_BIN/pg_dump" -h "$T" -p 55438 -U postgres -d fx | gzip >"$T/full.sql.gz"
"$PG_BIN/pg_dump" -h "$T" -p 55438 -U postgres -d fx -Fc >"$T/full.dump"
"$PG_BIN/pg_dump" -h "$T" -p 55438 -U postgres -d fx --no-owner --no-privileges -t public.analytics_page_views | gzip >"$T/an.sql.gz"
"$PG_BIN/pg_dumpall" -h "$T" -p 55438 -U postgres --roles-only --no-role-passwords >"$T/roles.sql"
grep -qi password "$T/roles.sql" && fail "fixture roles file has a password"
printf -- '-- no roles\n' >"$T/empty.sql"

export PG_BIN TMPDIR="$T"
bash "$R" --roles "$T/empty.sql" --dump "$T/full.sql.gz" >/dev/null 2>&1 && fail "restore without roles should fail (reproduces the bug)"
pass "without roles the restore fails (bug reproduced)"
bash "$R" --roles "$T/roles.sql" --dump "$T/full.sql.gz" --analytics "$T/an.sql.gz" >/dev/null || fail "plain restore with roles failed"
pass "plain .sql.gz restore with roles first: 0 errors, counts match"
bash "$R" --roles "$T/roles.sql" --dump "$T/full.dump" >/dev/null || fail "custom-format restore with roles failed"
pass "custom-format restore with roles first: 0 errors, counts match"
printf "CREATE ROLE x;\nALTER ROLE x WITH PASSWORD 'SCRAM-SHA-256\$4096:abc';\n" >"$T/pw.sql"
bash "$R" --roles "$T/pw.sql" --dump "$T/full.sql.gz" >/dev/null 2>&1 && fail "roles file with password material must be refused"
pass "roles file with password material is refused"
if [[ "${RESTORE_TEST_DOCKER:-0}" == 1 ]]; then
	# Same fixtures through the docker path (CI pre-pulls postgres:15-alpine; the script never pulls).
	env -u PG_BIN bash "$R" --roles "$T/roles.sql" --dump "$T/full.dump" --analytics "$T/an.sql.gz" >/dev/null || fail "docker-mode restore with roles failed"
	pass "docker-mode restore with roles first: 0 errors, counts match"
fi
echo "all restore-roles-first tests passed"
