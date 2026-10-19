#!/usr/bin/env bash
# Restore test (audit item 6/8): restore a pg_dump into a THROWAWAY postgres container and prove it is usable.
#   - container: postgres:15.14-alpine (prod version), random superuser password, data dir and /tmp on tmpfs
#     (nothing restored ever lands on disk), removed on exit even after a failure
#   - restores with ON_ERROR_STOP / --exit-on-error, so a partial restore fails
#   - compares every table's row count in the restored DB with the counts in the dump itself (COPY sections)
#   - checks the minimum table count, that required tables have rows, and migration state
#     (_prisma_migrations vs backend/prisma/migrations, the same check `prisma migrate status` makes)
#   - prints table names and counts only, never row contents
# Used on the box for prod dumps (streamed over ssh, never written to the box disk) and in CI for the seed fixture.
#
# Usage: restore-test.sh [options] < dump      (or --dump FILE)
#   --dump FILE            dump file (default: stdin)
#   --format plain-gz|plain|custom   (default plain-gz)
#   --min-tables N         fail below N public tables (default 1)
#   --require-rows T[,T]   tables that must have at least one row (default implants)
#   --migrations DIR       repo migrations dir to compare with _prisma_migrations (default: skip)
#   --allow-migration-drift  report migration drift but do not fail on it
# Env: DOCKER (default docker; the box uses "sudo docker"), PG_IMAGE (default postgres:15.14-alpine)
set -euo pipefail
umask 077

DOCKER="${DOCKER:-docker}"
PG_IMAGE="${PG_IMAGE:-postgres:15.14-alpine}"
DUMP=- FORMAT=plain-gz MIN_TABLES=1 REQUIRE=implants MIGR_DIR="" ALLOW_DRIFT=false
while [[ $# -gt 0 ]]; do
	case "$1" in
	--dump) DUMP="$2"; shift 2 ;;
	--format) FORMAT="$2"; shift 2 ;;
	--min-tables) MIN_TABLES="$2"; shift 2 ;;
	--require-rows) REQUIRE="$2"; shift 2 ;;
	--migrations) MIGR_DIR="$2"; shift 2 ;;
	--allow-migration-drift) ALLOW_DRIFT=true; shift ;;
	*) echo "restore-test: unknown option $1" >&2; exit 2 ;;
	esac
done
case "$FORMAT" in plain-gz | plain | custom) ;; *) echo "restore-test: bad --format $FORMAT" >&2; exit 2 ;; esac

say() { printf 'restore-test: %s\n' "$*"; }
die() { printf 'restore-test: FAILED: %s\n' "$*" >&2; exit 1; }

CNAME="ost-restore-test-$$-$RANDOM"
# shellcheck disable=SC2329
cleanup() { $DOCKER rm -f -v "$CNAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

PGPW="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
$DOCKER run -d --name "$CNAME" --network none \
	--tmpfs /var/lib/postgresql/data:rw,size=1g --tmpfs /tmp:rw,size=512m \
	-e POSTGRES_PASSWORD="$PGPW" -e POSTGRES_DB=restoretest "$PG_IMAGE" >/dev/null || die "could not start $PG_IMAGE"
ready=false
for _ in $(seq 1 60); do
	if $DOCKER exec "$CNAME" psql -U postgres -d restoretest -qAtc 'select 1' >/dev/null 2>&1; then ready=true; break; fi
	sleep 1
done
$ready || die "throwaway postgres did not start"
say "throwaway container up: $($DOCKER exec "$CNAME" postgres --version) (network none, tmpfs data)"

# The dump goes into the container's tmpfs only.
if [[ "$DUMP" == - ]]; then
	$DOCKER exec -i "$CNAME" sh -c 'cat > /tmp/in' || die "could not read the dump from stdin"
else
	[[ -r "$DUMP" ]] || die "cannot read $DUMP"
	$DOCKER exec -i "$CNAME" sh -c 'cat > /tmp/in' <"$DUMP" || die "could not copy the dump into the container"
fi
bytes="$($DOCKER exec "$CNAME" stat -c%s /tmp/in)"
((bytes > 0)) || die "dump is empty"
case "$FORMAT" in
plain-gz) $DOCKER exec "$CNAME" sh -c 'gzip -t /tmp/in && gzip -dc /tmp/in > /tmp/dump.sql' || die "dump failed gzip -t" ;;
plain) $DOCKER exec "$CNAME" sh -c 'mv /tmp/in /tmp/dump.sql' ;;
custom) $DOCKER exec "$CNAME" sh -c 'pg_restore -f /tmp/dump.sql /tmp/in' || die "pg_restore could not read the archive" ;;
esac
say "dump read: $bytes bytes ($FORMAT)"

# Expected counts from the dump itself: rows between each COPY line and its terminating backslash-dot.
# shellcheck disable=SC2016
$DOCKER exec "$CNAME" sh -c 'awk '\''/^COPY /{t=$2; n=0; inb=1; next} inb && $0=="\\."{print t"\t"n; inb=0; next} inb{n++}'\'' /tmp/dump.sql | sed "s/\"//g" | sort > /tmp/expected.tsv'

# Roles referenced by the dump (OWNER TO / GRANT) do not exist here; create them NOLOGIN so ownership restores as-is.
$DOCKER exec "$CNAME" sh -c "grep -oE '(OWNER TO|TO|FROM) [a-z_][a-z0-9_]*;' /tmp/dump.sql | awk '{print \$NF}' | tr -d ';' | sort -u | grep -vxE 'postgres|public' > /tmp/roles.txt || true"
# shellcheck disable=SC2016
$DOCKER exec "$CNAME" sh -c 'while read -r r; do psql -U postgres -d restoretest -qAtc "create role \"$r\" nologin" >/dev/null; done < /tmp/roles.txt'

if ! $DOCKER exec "$CNAME" sh -c 'psql -U postgres -d restoretest -X -q -v ON_ERROR_STOP=1 -f /tmp/dump.sql > /tmp/restore.out 2> /tmp/restore.err'; then
	$DOCKER exec "$CNAME" sh -c 'head -c 600 /tmp/restore.err' >&2 || true
	die "restore stopped on an error"
fi
say "restore finished with ON_ERROR_STOP (no errors)"

$DOCKER exec -i "$CNAME" sh -c 'psql -U postgres -d restoretest -qAtX -v ON_ERROR_STOP=1 > /tmp/restored.tsv' <<'SQL'
SELECT format('SELECT %L || chr(9) || count(*) FROM %I.%I;', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY 1 \gexec
SQL
$DOCKER exec "$CNAME" sh -c 'sort -o /tmp/restored.tsv /tmp/restored.tsv'

tables="$($DOCKER exec "$CNAME" psql -U postgres -d restoretest -qAtc "select count(*) from pg_tables where schemaname = 'public'")"
# shellcheck disable=SC2016
rows="$($DOCKER exec "$CNAME" awk -F'\t' '{s+=$2} END{print s+0}' /tmp/restored.tsv)"
say "restored: $tables public tables, $rows rows"
((tables >= MIN_TABLES)) || die "$tables public tables, need at least $MIN_TABLES"
if ! $DOCKER exec "$CNAME" sh -c 'diff /tmp/expected.tsv /tmp/restored.tsv > /tmp/diff.txt'; then
	$DOCKER exec "$CNAME" sh -c 'grep -E "^[<>]" /tmp/diff.txt' >&2 || true
	die "row counts differ between the dump (<) and the restored database (>)"
fi
say "row counts: every table matches the dump exactly"

IFS=',' read -r -a req <<<"$REQUIRE"
for t in "${req[@]}"; do
	[[ -n "$t" ]] || continue
	n="$($DOCKER exec "$CNAME" psql -U postgres -d restoretest -qAtc "select count(*) from public.\"$t\"" 2>/dev/null || echo missing)"
	if ! [[ "$n" =~ ^[0-9]+$ ]] || ((n == 0)); then die "required table $t has ${n} rows"; fi
	say "required table $t: $n rows"
done

if [[ -n "$MIGR_DIR" ]]; then
	[[ -d "$MIGR_DIR" ]] || die "no migrations dir $MIGR_DIR"
	repo="$(find "$MIGR_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)"
	applied="$($DOCKER exec "$CNAME" psql -U postgres -d restoretest -qAtc \
		"select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null order by 1" 2>/dev/null)" ||
		die "no _prisma_migrations table"
	failed="$($DOCKER exec "$CNAME" psql -U postgres -d restoretest -qAtc \
		"select count(*) from _prisma_migrations where finished_at is null and rolled_back_at is null")"
	pending="$(comm -23 <(printf '%s\n' "$repo") <(printf '%s\n' "$applied" | sort -u) | grep -c . || true)"
	unknown="$(comm -13 <(printf '%s\n' "$repo") <(printf '%s\n' "$applied" | sort -u) | grep -c . || true)"
	say "migrations: $(printf '%s\n' "$repo" | grep -c .) in repo, $(printf '%s\n' "$applied" | sort -u | grep -c .) applied, $pending pending, $unknown applied but not in repo, $failed failed"
	comm -23 <(printf '%s\n' "$repo") <(printf '%s\n' "$applied" | sort -u) | sed 's/^/restore-test:   pending: /'
	comm -13 <(printf '%s\n' "$repo") <(printf '%s\n' "$applied" | sort -u) | sed 's/^/restore-test:   applied, not in repo: /'
	if ((failed > 0 || pending > 0 || unknown > 0)); then
		if $ALLOW_DRIFT; then say "migration drift reported (allowed by --allow-migration-drift)"; else die "migration state is not clean"; fi
	else
		say "migration status clean: database schema is up to date with the repo migrations"
	fi
fi
say "PASSED (container $CNAME removed on exit; nothing restored was written to disk)"
