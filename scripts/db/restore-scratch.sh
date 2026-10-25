#!/usr/bin/env bash
# Full restore of an OST Postgres dump into a THROWAWAY scratch cluster, roles first.
#
# Why: since roles.sql (2026-10-18) the OST tables are owned by ost_migrator and granted to ost_app
# and ost_backup. pg_dump (plain or -Fc) does not contain roles, so a restore into a fresh cluster
# stops at the first "role ... does not exist". This script creates the roles from a passwordless
# roles file (pg_dumpall --roles-only --no-role-passwords) BEFORE the restore, then restores with
# ON_ERROR_STOP / --exit-on-error, so owners and GRANTs come back exactly and nothing is skipped.
#
# Never touches prod: refuses the live container name, uses --network none, tmpfs data, no ports,
# no named volumes, and removes only the container it started.
#
# Usage: restore-scratch.sh --roles ROLES.sql[.gz] --dump DUMP [--analytics ANALYTICS.sql.gz] [--counts-out FILE]
#   DUMP: plain .sql / .sql.gz (database-backup-production.sh) or custom-format .dump (pg_dump -Fc)
#   --analytics: also run the partial analytics test (fleetmon ost_analytics): drop the analytics
#                tables in scratch and load the analytics-only dump on top of the full restore.
# Env:
#   DOCKER    docker command (default docker; the box may use "sudo docker")
#   PG_IMAGE  image already present locally (default postgres:15-alpine; never pulled: --pull never)
#   PG_BIN    if set (e.g. /usr/lib/postgresql/15/bin), use a local throwaway cluster instead of docker
#             (unix socket only, listen_addresses='', data under a mktemp dir)
# Prints table names and row counts only, never row contents.
set -euo pipefail
umask 077

ROLES="" DUMP="" ANALYTICS="" COUNTS_OUT=""
while [[ $# -gt 0 ]]; do
	case "$1" in
	--roles) ROLES="$2"; shift 2 ;;
	--dump) DUMP="$2"; shift 2 ;;
	--analytics) ANALYTICS="$2"; shift 2 ;;
	--counts-out) COUNTS_OUT="$2"; shift 2 ;;
	*) echo "restore-scratch: unknown option $1" >&2; exit 2 ;;
	esac
done
say() { printf 'restore-scratch: %s\n' "$*"; }
die() { printf 'restore-scratch: FAILED: %s\n' "$*" >&2; exit 1; }
[[ -r "$ROLES" ]] || die "--roles file required (pg_dumpall --roles-only --no-role-passwords)"
[[ -r "$DUMP" ]] || die "--dump file required"
[[ -z "$ANALYTICS" || -r "$ANALYTICS" ]] || die "cannot read $ANALYTICS"

LIVE_CONTAINER="orthoandspinetools-postgres"
DOCKER="${DOCKER:-docker}"
PG_IMAGE="${PG_IMAGE:-postgres:15-alpine}"
PG_BIN="${PG_BIN:-}"
DB=restoretest
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ost-restore-scratch.XXXXXX")"
CNAME="ost-restore-scratch-$$-$RANDOM"
[[ "$CNAME" != "$LIVE_CONTAINER" ]] || die "refusing to use the live container"

cat_any() { case "$1" in *.gz) gzip -dc -- "$1" ;; *) cat -- "$1" ;; esac; }

# The roles file must never carry password hashes.
if cat_any "$ROLES" | grep -qiE 'PASSWORD|SCRAM-SHA-256\$|md5[0-9a-f]{32}'; then
	die "roles file contains password material; regenerate with --no-role-passwords"
fi

if [[ -n "$PG_BIN" ]]; then
	SOCK="$WORK/sock"; mkdir -p "$SOCK"
	cleanup() { "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf -- "$WORK"; }
	trap cleanup EXIT
	"$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null || die "initdb failed"
	"$PG_BIN/pg_ctl" -D "$WORK/data" -w -l "$WORK/pg.log" \
		-o "-c listen_addresses='' -c unix_socket_directories=$SOCK -p 55439" start >/dev/null || die "local cluster did not start"
	psqlx() { "$PG_BIN/psql" -h "$SOCK" -p 55439 -U postgres -X "$@"; }
	pgrestore() { "$PG_BIN/pg_restore" -h "$SOCK" -p 55439 -U postgres "$@"; }
	pgrestore_file() { "$PG_BIN/pg_restore" "$@"; }
	say "scratch: local $("$PG_BIN/postgres" --version) (socket only)"
else
	cleanup() { $DOCKER rm -f -v "$CNAME" >/dev/null 2>&1 || true; rm -rf -- "$WORK"; }
	trap cleanup EXIT
	$DOCKER run -d --rm --pull never --name "$CNAME" --network none --memory 384m \
		--tmpfs /var/lib/postgresql/data:rw,size=768m --tmpfs /tmp:rw,size=256m \
		-e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=postgres "$PG_IMAGE" >/dev/null || die "could not start $PG_IMAGE"
	for _ in $(seq 1 60); do
		$DOCKER exec "$CNAME" psql -U postgres -d postgres -qAtc 'select 1' >/dev/null 2>&1 && break
		sleep 1
	done
	sleep 2
	psqlx() { $DOCKER exec -i "$CNAME" psql -U postgres -X "$@"; }
	pgrestore() { $DOCKER exec -i "$CNAME" pg_restore -U postgres "$@"; }
	pgrestore_file() { $DOCKER exec -i "$CNAME" pg_restore "$@"; }
	say "scratch: container $CNAME $($DOCKER exec "$CNAME" postgres --version) (network none, tmpfs)"
fi

# 1) roles first. The bootstrap superuser already exists in a fresh cluster; skip only that line.
cat_any "$ROLES" | grep -v '^CREATE ROLE postgres;$' | psqlx -q -d postgres -v ON_ERROR_STOP=1 >/dev/null 2>"$WORK/roles.err" ||
	{ cat "$WORK/roles.err" >&2; die "applying roles failed"; }
say "roles applied: $(psqlx -qAt -d postgres -c "select string_agg(rolname, ',' order by rolname) from pg_roles where rolname !~ '^pg_'")"
psqlx -q -d postgres -c "CREATE DATABASE $DB" >/dev/null

# 2) full restore, stop on the first error
case "$DUMP" in
*.dump)
	pgrestore -d "$DB" --exit-on-error <"$DUMP" 2>"$WORK/restore.err" || { cat "$WORK/restore.err" >&2; die "pg_restore failed"; }
	pgrestore_file -f - <"$DUMP" >"$WORK/plain.sql" 2>/dev/null || die "could not convert dump to text for counting"
	;;
*)
	cat_any "$DUMP" | psqlx -q -d "$DB" -v ON_ERROR_STOP=1 >/dev/null 2>"$WORK/restore.err" || { cat "$WORK/restore.err" >&2; die "psql restore failed"; }
	cat_any "$DUMP" >"$WORK/plain.sql"
	;;
esac
if grep -q 'ERROR' "$WORK/restore.err"; then cat "$WORK/restore.err" >&2; die "restore printed errors"; fi
say "full restore: 0 errors"

copy_counts() { awk '/^COPY /{t=$2; gsub(/"/,"",t); n=0; inb=1; next} inb && /^\\\.$/{print t"|"n; inb=0; next} inb{n++}' "$1" | sort; }
# shellcheck disable=SC2016
COUNT_SQL='SELECT string_agg(format($q$SELECT %L, count(*) FROM %I.%I$q$, n.nspname||$q$.$q$||c.relname, n.nspname, c.relname), $q$ UNION ALL $q$) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ($q$r$q$,$q$p$q$) AND n.nspname NOT IN ($q$pg_catalog$q$,$q$information_schema$q$) AND n.nspname NOT LIKE $q$pg_toast%$q$'
db_counts() { psqlx -qAt -F '|' -d "$DB" -c "$(psqlx -qAt -d "$DB" -c "$COUNT_SQL")" | sort; }

copy_counts "$WORK/plain.sql" >"$WORK/expect.txt"
db_counts >"$WORK/got.txt"
# Tables with zero rows have no COPY block in some dumps; compare non-empty tables exactly and check no table is missing.
if ! diff <(grep -v '|0$' "$WORK/got.txt") <(grep -v '|0$' "$WORK/expect.txt") >"$WORK/diff.txt"; then
	cat "$WORK/diff.txt" >&2; die "restored row counts differ from the dump"
fi
say "tables restored: $(wc -l <"$WORK/got.txt"), rows match the dump for every table"
say "_prisma_migrations: $(psqlx -qAt -d "$DB" -c 'select count(*) from public._prisma_migrations' 2>/dev/null || echo n/a)"

# 3) optional partial analytics test (same steps as fleetmon ost_analytics)
if [[ -n "$ANALYTICS" ]]; then
	mapfile -t TABS < <(cat_any "$ANALYTICS" | grep -oE '^CREATE TABLE public\.[a-z_0-9]+' | sed 's/^CREATE TABLE public\.//' | sort -u)
	[[ ${#TABS[@]} -gt 0 ]] || die "no tables in analytics dump"
	# The restored ost_guard event triggers would block the DROP and auto-create the truncate
	# trigger that the analytics dump also creates. Disable them in SCRATCH only, load, re-enable.
	EVT="$(psqlx -qAt -d "$DB" -c "select string_agg(quote_ident(evtname), ' ') from pg_event_trigger where evtname like 'ost_guard%'")"
	for e in $EVT; do psqlx -q -d "$DB" -c "ALTER EVENT TRIGGER $e DISABLE" >/dev/null; done
	{ for t in "${TABS[@]}"; do printf 'DROP TABLE IF EXISTS public."%s" CASCADE;\n' "$t"; done; cat_any "$ANALYTICS"; } |
		psqlx -q -d "$DB" -v ON_ERROR_STOP=1 >/dev/null 2>"$WORK/an.err" || { cat "$WORK/an.err" >&2; die "analytics restore failed"; }
	for e in $EVT; do psqlx -q -d "$DB" -c "ALTER EVENT TRIGGER $e ENABLE" >/dev/null; done
	cat_any "$ANALYTICS" >"$WORK/an.sql"
	copy_counts "$WORK/an.sql" >"$WORK/an_expect.txt"
	db_counts | grep -F -f <(printf 'public.%s|\n' "${TABS[@]}") >"$WORK/an_got.txt" || true
	diff <(grep -v '|0$' "$WORK/an_got.txt") <(grep -v '|0$' "$WORK/an_expect.txt") >&2 || die "analytics row counts differ from the dump"
	say "analytics partial restore: ${#TABS[@]} tables, 0 errors, rows match the dump"
fi

if [[ -n "$COUNTS_OUT" ]]; then db_counts >"$COUNTS_OUT"; fi
say "PASSED"
