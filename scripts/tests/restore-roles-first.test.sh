#!/usr/bin/env bash
# Tests for the roles-first restore fix (2026-10-25 Sunday restore test failure) and SEC review M1, L1-L7.
# Static checks and the backup-script stub test always run. The live part runs when local Postgres
# binaries are available (PG_BIN, or pg_config --bindir) and builds a tiny fixture where tables are
# owned by and granted to non-default roles and ost_guard event triggers exist, like OST prod.
# RESTORE_TEST_DOCKER=1 also runs the container path (image must already be present; DOCKER= may be podman).
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

B=scripts/database-backup-production.sh
R=scripts/db/restore-scratch.sh

# ---- static ---------------------------------------------------------------------------------------
grep -q 'pg_dumpall -U "$DB_USER" --roles-only --no-role-passwords' "$B" || fail "backup script must dump roles without passwords"
grep -q 'roles_dir="$BACKUP_DIR/roles"' "$B" || fail "roles file must live in roles/ (outside the backup_*.sql.gz glob)"
grep -q 'chmod 600 "$roles_file"' "$B" || fail "roles file must be chmod 600"
pass "backup script writes a passwordless roles file"
grep -q -- '--network none' "$R" || fail "scratch container must have no network"
grep -q -- '--pull never' "$R" || fail "scratch must not pull images"
grep -A3 'DOCKER run' "$R" | grep -qE -- '(^|[[:space:]])(-p|--publish|-P|--publish-all|-v|--volume)[[:space:]=]' && fail "scratch container must not publish ports or mount volumes"
# The script must have no way to reach another server: no host/port/db inputs, the only -h is its own socket.
grep -qE 'PGHOST|PGPORT|--host|--port|--dbname' "$R" && fail "scratch script must not take host/port/db inputs"
grep -nE -- '(^|[[:space:]])-h[[:space:]]' "$R" | grep -v -- '-h "$SOCK"' | grep -q . && fail "only the private socket may be used with -h"
grep -q 'orthoandspinetools-postgres' "$R" && fail "scratch script must not reference the live container"
roles_line="$(grep -n 'applying roles failed' "$R" | head -1 | cut -d: -f1)"
restore_line="$(grep -n 'full restore, stop on the first error' "$R" | head -1 | cut -d: -f1)"
[[ -n "$roles_line" && -n "$restore_line" && "$roles_line" -lt "$restore_line" ]] || fail "roles must be applied before the restore"
trap_line="$(grep -n '^trap cleanup EXIT' "$R" | head -1 | cut -d: -f1)"
mktemp_line="$(grep -n 'WORK="$(mktemp' "$R" | head -1 | cut -d: -f1)"
[[ -n "$trap_line" && -n "$mktemp_line" && "$trap_line" -lt "$mktemp_line" ]] || fail "cleanup trap must be set before the temp dir is created (L3)"
grep -qE 'cat "\$WORK/[a-z]+\.err"' "$R" && fail "raw stderr must not be printed (L1)"
pass "restore script is scratch-only, roles first, trap first, no raw stderr"

# ---- L4: a roles failure still uploads the data dump, then exits nonzero --------------------------
S="$(mktemp -d)"
cleanup_s() { rm -rf "$S"; }
trap cleanup_s EXIT
mkdir -p "$S/root/scripts" "$S/bin" "$S/bk"
: >"$S/root/scripts/backup-to-r2.js"
cat >"$S/bin/docker" <<'STUB'
#!/bin/bash
case "$1" in
ps) echo "abc orthoandspinetools-postgres" ;;
exec)
	case " $* " in
	*" pg_dumpall "*) echo "pg_dumpall: simulated failure" >&2; exit 1 ;;
	*" pg_dump "*) printf -- '-- dump\nSELECT 1;\n-- PostgreSQL database dump complete\n' ;;
	esac ;;
esac
STUB
cat >"$S/bin/node" <<'STUB'
#!/bin/bash
echo "$2" >>"$UPLOAD_LOG"
STUB
chmod +x "$S/bin/docker" "$S/bin/node"
set +e
PATH="$S/bin:$PATH" OST_ROOT="$S/root" BACKUP_DIR="$S/bk" SKIP_R2_BACKUP=0 UPLOAD_LOG="$S/uploads" bash "$B" >"$S/out" 2>&1
rc=$?
set -e
((rc != 0)) || fail "backup must exit nonzero when the roles dump fails"
grep -q 'backup_.*\.sql\.gz' "$S/uploads" 2>/dev/null || fail "data dump must still be uploaded when the roles dump fails (L4)"
ls "$S"/bk/backup_*.sql.gz >/dev/null 2>&1 || fail "data dump must be kept"
pass "roles failure: data dump kept and uploaded, then exit $rc (L4)"

# ---- live (local Postgres binaries) ---------------------------------------------------------------
PG_BIN="${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}"
if [[ -z "$PG_BIN" || ! -x "$PG_BIN/initdb" ]]; then
	echo "skip: live test (no local Postgres binaries; set PG_BIN)"
	exit 0
fi
T="$(mktemp -d)"
cleanup_t() { "$PG_BIN/pg_ctl" -D "$T/src" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$T" "$S"; }
trap cleanup_t EXIT
"$PG_BIN/initdb" -D "$T/src" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$T/src" -w -l "$T/src.log" -o "-c listen_addresses='' -c unix_socket_directories=$T -p 55438" start >/dev/null
q() { "$PG_BIN/psql" -h "$T" -p 55438 -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
q -d postgres <<'SQL'
CREATE ROLE ost_migrator LOGIN PASSWORD 'fixture-only';
CREATE ROLE ost_app LOGIN;
CREATE DATABASE fx;
SQL
# ost_guard like prod (roles.sql): block DROP without override, auto-add a no-truncate trigger on CREATE TABLE.
q -d fx <<'SQL'
CREATE SCHEMA ost_guard;
CREATE FUNCTION ost_guard.block_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ost_guard: TRUNCATE blocked'; END $$;
CREATE FUNCTION ost_guard.block_sql_drop() RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE o record;
BEGIN
  FOR o IN SELECT * FROM pg_event_trigger_dropped_objects() WHERE NOT is_temporary AND object_type = 'table' LOOP
    IF nullif(current_setting('ost.allow_destructive', true), '') IS NULL THEN
      RAISE EXCEPTION 'ost_guard: dropping % blocked', o.object_identity;
    END IF;
  END LOOP;
END $$;
CREATE FUNCTION ost_guard.attach_truncate_guard() RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE object_type = 'table' AND schema_name = 'public' AND command_tag = 'CREATE TABLE' LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = c.objid AND tgname = 'ost_guard_no_truncate') THEN
      EXECUTE format('CREATE TRIGGER ost_guard_no_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION ost_guard.block_truncate()', c.object_identity);
    END IF;
  END LOOP;
END $$;
CREATE EVENT TRIGGER ost_guard_sql_drop ON sql_drop EXECUTE FUNCTION ost_guard.block_sql_drop();
CREATE EVENT TRIGGER ost_guard_attach_truncate ON ddl_command_end EXECUTE FUNCTION ost_guard.attach_truncate_guard();
CREATE TABLE public.implants (id int primary key, name text);
CREATE TABLE public.analytics_page_views (id int primary key, path text);
INSERT INTO public.implants SELECT g, 'i'||g FROM generate_series(1,5) g;
INSERT INTO public.implants VALUES (6, NULL);
INSERT INTO public.analytics_page_views SELECT g, '/p'||g FROM generate_series(1,3) g;
ALTER TABLE public.implants OWNER TO ost_migrator;
ALTER TABLE public.analytics_page_views OWNER TO ost_migrator;
GRANT SELECT, INSERT ON public.implants, public.analytics_page_views TO ost_app;
SQL
[[ "$(q -d fx -At -c "select count(*) from pg_trigger where tgname='ost_guard_no_truncate'")" == 2 ]] || fail "fixture: guard triggers not attached"
"$PG_BIN/pg_dump" -h "$T" -p 55438 -U postgres -d fx | gzip >"$T/full.sql.gz"
"$PG_BIN/pg_dump" -h "$T" -p 55438 -U postgres -d fx -Fc >"$T/full.dump"
"$PG_BIN/pg_dump" -h "$T" -p 55438 -U postgres -d fx --no-owner --no-privileges -t public.analytics_page_views | gzip >"$T/an.sql.gz"
zcat "$T/an.sql.gz" | grep -q 'ost_guard_no_truncate' || fail "fixture: analytics dump should carry the guard trigger (like prod)"
"$PG_BIN/pg_dumpall" -h "$T" -p 55438 -U postgres --roles-only --no-role-passwords >"$T/roles.sql"
grep -qi password "$T/roles.sql" && fail "fixture roles file has a password"
grep -v 'ost_' "$T/roles.sql" >"$T/empty.sql" # valid, complete roles file with only postgres
printf 'public.implants|6\npublic.analytics_page_views|3\n' >"$T/expect.ok"
printf '# manifest\npublic.implants\t7\npublic.analytics_page_views\t3\n' >"$T/expect.bad"

export PG_BIN TMPDIR="$T"
run() { bash "$R" --trusted-dump --min-tables 2 "$@"; }
must_fail() { # label args...
	local label="$1"; shift
	if run "$@" >"$T/out" 2>&1; then cat "$T/out" >&2; fail "$label should FAIL"; fi
	pass "$label fails: $(grep -o 'FAILED: .*' "$T/out" | head -1)"
}
leftovers() { find "$T" -maxdepth 1 -name 'ost-restore-scratch.*' | grep -c . || true; }

must_fail "restore without roles (bug reproduced)" --roles "$T/empty.sql" --dump "$T/full.sql.gz"
run --roles "$T/roles.sql" --dump "$T/full.sql.gz" --analytics "$T/an.sql.gz" --expect-counts "$T/expect.ok" >"$T/out" || { cat "$T/out"; fail "plain restore with roles failed"; }
grep -q 'event triggers disabled: ost_guard' "$T/out" || fail "analytics path did not disable the ost_guard event triggers (L7)"
pass "plain .sql.gz + analytics + expect-counts, roles first: 0 errors, counts match, guard triggers disabled in scratch (L7)"
run --roles "$T/roles.sql" --dump "$T/full.dump" --expect-counts "$T/expect.ok" >/dev/null || fail "custom-format restore with roles failed"
pass "custom-format restore with roles first: 0 errors, counts match"
# L7: without the disable step the analytics load must fail (proves the path is really exercised).
sed 's/ALTER EVENT TRIGGER \$e DISABLE/SELECT 1/' "$R" >"$T/nodisable.sh"
if bash "$T/nodisable.sh" --trusted-dump --min-tables 2 --roles "$T/roles.sql" --dump "$T/full.sql.gz" --analytics "$T/an.sql.gz" >/dev/null 2>&1; then
	fail "analytics load should fail when the guard triggers stay enabled"
fi
pass "with guard triggers left enabled the analytics load fails (disable path is needed and tested)"

# M1: empty and truncated dumps must fail
: | gzip >"$T/emptydump.sql.gz"
must_fail "empty .sql.gz dump (M1)" --roles "$T/roles.sql" --dump "$T/emptydump.sql.gz"
zcat "$T/full.sql.gz" | awk '/^COPY public.implants /{exit} {print}' | gzip >"$T/cut.sql.gz"
must_fail "plain dump cut before a table's data (M1)" --roles "$T/roles.sql" --dump "$T/cut.sql.gz"
head -c "$(($(stat -c %s "$T/full.sql.gz") / 2))" "$T/full.sql.gz" >"$T/cutgz.sql.gz"
must_fail "plain dump with a cut gzip stream (M1)" --roles "$T/roles.sql" --dump "$T/cutgz.sql.gz"
# Data-heavy custom dump so fixed cuts land inside the data section (pg_dump 16 also writes a second,
# redundant TOC copy after the data; losing only that copy loses no rows).
q -d postgres -c "CREATE DATABASE fxbig" >/dev/null
q -d fxbig <<'SQL'
CREATE TABLE public.bulk (id int primary key, v text);
INSERT INTO public.bulk SELECT g, md5(g::text) || md5((g * 7)::text) FROM generate_series(1, 20000) g;
ALTER TABLE public.bulk OWNER TO ost_migrator;
SQL
"$PG_BIN/pg_dump" -h "$T" -p 55438 -U postgres -d fxbig -Fc >"$T/big.dump"
bsz="$(stat -c %s "$T/big.dump")"
bash "$R" --trusted-dump --min-tables 1 --roles "$T/roles.sql" --dump "$T/big.dump" >/dev/null || fail "full data-heavy custom dump should pass"
head -c "$((bsz * 2 / 3))" "$T/big.dump" >"$T/cut.dump"
if bash "$R" --trusted-dump --min-tables 1 --roles "$T/roles.sql" --dump "$T/cut.dump" >"$T/out" 2>&1; then fail "custom dump cut to 2/3 should FAIL"; fi
pass "custom dump cut to 2/3 (M1) fails: $(grep -o 'FAILED: .*' "$T/out")"
head -c "$((bsz * 9 / 10))" "$T/big.dump" >"$T/cut2.dump"
if bash "$R" --trusted-dump --min-tables 1 --roles "$T/roles.sql" --dump "$T/cut2.dump" >"$T/out" 2>&1; then fail "custom dump missing its last 10% should FAIL"; fi
pass "custom dump missing its last 10% (M1) fails: $(grep -o 'FAILED: .*' "$T/out")"
# Cut a custom dump at many points: each run must FAIL, or (cut only after all data) restore every row.
run --roles "$T/roles.sql" --dump "$T/full.dump" --counts-out "$T/full.counts" >/dev/null || fail "full custom dump should pass"
fsz="$(stat -c %s "$T/full.dump")"
for pct in 50 55 60 65 70 75 80 85 90 93 96 98 99; do
	head -c "$((fsz * pct / 100))" "$T/full.dump" >"$T/cutp.dump"
	rm -f "$T/cutp.counts"
	if run --roles "$T/roles.sql" --dump "$T/cutp.dump" --counts-out "$T/cutp.counts" >/dev/null 2>&1; then
		cmp -s "$T/full.counts" "$T/cutp.counts" || fail "custom dump cut at ${pct}% passed with missing rows"
	fi
done
pass "custom dump cut at 50-99%: every cut fails or has every row (M1)"
if bash "$R" --trusted-dump --roles "$T/roles.sql" --dump "$T/full.sql.gz" >"$T/out" 2>&1; then fail "default --min-tables 39 should fail a 2-table dump"; fi
pass "default --min-tables 39 fails a 2-table dump: $(grep -o 'FAILED: .*' "$T/out")"
must_fail "--expect-counts mismatch (M1)" --roles "$T/roles.sql" --dump "$T/full.sql.gz" --expect-counts "$T/expect.bad"
grep -q 'count mismatch public.implants: restored 6 expected 7' "$T/out" || fail "mismatch line should name table and counts only"

# L1: only the ERROR phrase is printed, never raw stderr or row values
zcat "$T/full.sql.gz" | sed 's/^\(6\t\)\\N$/\1SECRETVALUE/; s/^5\ti5$/notanint\tSECRETVALUE/' | gzip >"$T/baddata.sql.gz"
must_fail "dump with a bad COPY row" --roles "$T/roles.sql" --dump "$T/baddata.sql.gz"
grep -q SECRETVALUE "$T/out" && fail "row values leaked into output (L1)"
grep -qE 'CONTEXT|DETAIL|LINE [0-9]' "$T/out" && fail "raw psql context leaked into output (L1)"
pass "error output carries the ERROR phrase only, no row values (L1)"

# L2: psql meta-commands refused (roles file in both modes, dumps in PG_BIN mode); COPY data lines starting with \N are fine
{ echo '\! touch '"$T"'/pwned'; cat "$T/roles.sql"; } >"$T/roles.meta.sql"
must_fail "roles file with a \\! line (L2)" --roles "$T/roles.meta.sql" --dump "$T/full.sql.gz"
{ echo '\! touch '"$T"'/pwned'; zcat "$T/full.sql.gz"; } | gzip >"$T/meta.sql.gz"
must_fail "dump with a \\! line in PG_BIN mode (L2)" --roles "$T/roles.sql" --dump "$T/meta.sql.gz"
[[ ! -e "$T/pwned" ]] || fail "a meta-command ran on the host (L2)"
zcat "$T/full.sql.gz" | grep -qP '^6\t\\N$' || fail "fixture should have a COPY row starting a NULL column"
pass "meta-command lines refused; nothing ran on the host (L2)"
# N1 (SEC repro): a "COPY ... FROM stdin;" line inside a dollar-quoted string fools the line pre-filter
# into treating the next lines as COPY data; the random-key \restrict fence must still stop the \!.
# It also lifts the dump's own pg_dump restrict key first, as a crafted file could.
ownkey="$(zcat "$T/full.sql.gz" | awk '/^\\restrict /{print $2; exit}')"
[[ -n "$ownkey" ]] || fail "fixture: pg_dump should write a restrict header"
# shellcheck disable=SC2016
zcat "$T/full.sql.gz" | awk -v m="$T/pwned2" -v k="$ownkey" '{print} /^SET client_encoding/ && !d {print "SELECT $x$"; print "COPY a FROM stdin;"; print "$x$;"; print "\\unrestrict " k; print "\\! touch " m; d=1}' | gzip >"$T/bypass.sql.gz"
zcat "$T/bypass.sql.gz" | grep -q '^\\! touch' || fail "fixture: bypass line missing"
must_fail "dump with \\! hidden behind a dollar-quoted COPY line (N1)" --roles "$T/roles.sql" --dump "$T/bypass.sql.gz"
grep -qE 'restricted|wrong key' "$T/out" || fail "N1 bypass should be stopped by the psql restrict fence, got: $(grep -o 'FAILED: .*' "$T/out")"
[[ ! -e "$T/pwned2" ]] || fail "N1 bypass ran a command on the host"
pass "N1 bypass stopped by the restrict fence; nothing ran on the host"
# Control: with the fence removed the same file gets past the pre-filter and runs the command
# (it only touches a marker in this test's temp dir), so the test above really exercises the fence.
sed -e '/# fence-open$/d' -e '/# fence-close$/d' -e 's/strip_own_fence "\$1" # fence-body$/cat -- "$1"/' "$R" >"$T/nofence.sh"
grep -q 'fence-' "$T/nofence.sh" && fail "could not build the no-fence control script"
bash "$T/nofence.sh" --trusted-dump --min-tables 2 --roles "$T/roles.sql" --dump "$T/bypass.sql.gz" >/dev/null 2>&1 || true
[[ -e "$T/pwned2" ]] || fail "control: without the fence the N1 repro should get past the pre-filter"
rm -f "$T/pwned2"
pass "control: without the fence the N1 repro runs (pre-filter alone is not enough)"

# password material refused
printf "CREATE ROLE x;\nALTER ROLE x WITH PASSWORD 'SCRAM-SHA-256\$4096:abc';\n-- PostgreSQL database cluster dump complete\n" >"$T/pw.sql"
must_fail "roles file with password material" --roles "$T/pw.sql" --dump "$T/full.sql.gz"

# L3: early failures leave no temp dir behind
[[ "$(leftovers)" == 0 ]] || fail "temp dirs left behind after failures (L3)"
pass "no temp dir left after any failure (L3)"

# N5: host-binary mode is refused for untrusted input unless CI=true or --trusted-dump.
if env -u CI bash "$R" --min-tables 2 --roles "$T/roles.sql" --dump "$T/full.sql.gz" >"$T/out" 2>&1; then fail "PG_BIN mode without --trusted-dump outside CI should be refused"; fi
grep -q 'only for dumps you generated yourself' "$T/out" || fail "N5 refusal message missing"
CI=true bash "$R" --min-tables 2 --roles "$T/roles.sql" --dump "$T/full.sql.gz" >/dev/null || fail "CI=true should allow PG_BIN mode"
pass "PG_BIN mode refused without --trusted-dump outside CI; allowed with CI=true (N5)"

# I1/I2: COPY parsing edge cases. A text first column whose row starts with "COPY ", a schema and
# table with spaces, and a partitioned table (dumped normally and with --load-via-partition-root).
q -d postgres -c "CREATE DATABASE fxedge" >/dev/null
q -d fxedge <<'SQL'
CREATE TABLE public.notes (body text, id int);
INSERT INTO public.notes VALUES ('COPY public.x (a) FROM stdin;', 1), ('COPY y', 2), ('plain', 3);
CREATE SCHEMA "my schema";
CREATE TABLE "my schema"."t x" (id int);
INSERT INTO "my schema"."t x" SELECT generate_series(1, 4);
CREATE TABLE public.parted (id int, k int) PARTITION BY RANGE (k);
CREATE TABLE public.parted_a PARTITION OF public.parted FOR VALUES FROM (0) TO (10);
CREATE TABLE public.parted_b PARTITION OF public.parted FOR VALUES FROM (10) TO (20);
INSERT INTO public.parted SELECT g, g FROM generate_series(1, 15) g;
SQL
printf 'public.notes|3\nmy schema.t x|4\npublic.parted_a|9\npublic.parted_b|6\n' >"$T/edge.expect"
"$PG_BIN/pg_dump" -h "$T" -p 55438 -U postgres -d fxedge | gzip >"$T/edge.sql.gz"
"$PG_BIN/pg_dump" -h "$T" -p 55438 -U postgres -d fxedge -Fc >"$T/edge.dump"
"$PG_BIN/pg_dump" -h "$T" -p 55438 -U postgres -d fxedge --load-via-partition-root | gzip >"$T/edge_root.sql.gz"
"$PG_BIN/pg_dump" -h "$T" -p 55438 -U postgres -d fxedge --load-via-partition-root -Fc >"$T/edge_root.dump"
zcat "$T/edge.sql.gz" | grep -q $'^COPY y\t2$' || fail "fixture: expected a data row starting with COPY"
for f in edge.sql.gz edge.dump edge_root.sql.gz edge_root.dump; do
	bash "$R" --trusted-dump --min-tables 4 --roles "$T/roles.sql" --dump "$T/$f" --expect-counts "$T/edge.expect" >"$T/out" 2>&1 ||
		{ cat "$T/out" >&2; fail "edge-case dump $f should restore and match"; }
done
pass "COPY-like data rows, names with spaces, partitions and --load-via-partition-root: plain and custom pass with exact counts (I1, I2)"

if [[ "${RESTORE_TEST_DOCKER:-0}" == 1 ]]; then
	# Fixtures come from PG_BIN's pg_dump; a newer major writes archives the 15 image cannot read.
	img_major="$(${DOCKER:-docker} run --rm --pull never --network none "${PG_IMAGE:-postgres:15-alpine}" postgres --version | grep -oE '[0-9]+' | head -1)"
	bin_major="$("$PG_BIN/pg_dump" --version | grep -oE '[0-9]+' | head -1)"
	[[ "$img_major" == "$bin_major" ]] || fail "docker mode needs PG_BIN of the image's major ($img_major), got $bin_major"
	# Same fixtures through the container path (the script never pulls; CI pre-pulls the image).
	env -u PG_BIN bash "$R" --min-tables 2 --roles "$T/roles.sql" --dump "$T/full.dump" --analytics "$T/an.sql.gz" --expect-counts "$T/expect.ok" >"$T/out" ||
		{ cat "$T/out"; fail "docker-mode restore with roles failed"; }
	grep -q 'event triggers disabled: ost_guard' "$T/out" || fail "docker mode did not disable guard triggers"
	pass "docker-mode custom dump + analytics + expect-counts: 0 errors, counts match"
	if env -u PG_BIN bash "$R" --min-tables 2 --roles "$T/roles.sql" --dump "$T/cut.sql.gz" >/dev/null 2>&1; then fail "docker mode must fail a truncated dump"; fi
	pass "docker-mode truncated dump fails"
	# I5: the restrict fence also wraps psql input in docker mode (no pre-filter there).
	if env -u PG_BIN bash "$R" --min-tables 2 --roles "$T/roles.sql" --dump "$T/meta.sql.gz" >"$T/out" 2>&1; then fail "docker mode should refuse a \\! line"; fi
	grep -q 'backslash commands are restricted' "$T/out" || fail "docker mode: expected the restrict fence to refuse, got: $(grep -o 'FAILED: .*' "$T/out")"
	if env -u PG_BIN bash "$R" --min-tables 2 --roles "$T/roles.sql" --dump "$T/bypass.sql.gz" >"$T/out" 2>&1; then fail "docker mode should refuse the N1 bypass"; fi
	grep -qE 'restricted|wrong key' "$T/out" || fail "docker mode: N1 bypass not stopped by the fence"
	pass "docker mode: \\! lines and the N1 bypass are refused by the restrict fence (I5)"
	env -u PG_BIN bash "$R" --min-tables 4 --roles "$T/roles.sql" --dump "$T/edge_root.dump" --expect-counts "$T/edge.expect" >/dev/null ||
		fail "docker mode: --load-via-partition-root edge dump should pass"
	pass "docker mode: edge-case dump passes with exact counts"
	[[ "$(leftovers)" == 0 ]] || fail "docker mode left temp dirs"
fi
echo "all restore-roles-first tests passed"
