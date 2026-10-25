#!/usr/bin/env bash
# Full restore of an OST Postgres dump into a THROWAWAY scratch cluster, roles first.
#
# Why: since roles.sql (2026-10-18) the OST tables are owned by ost_migrator and granted to ost_app
# and ost_backup. pg_dump (plain or -Fc) does not contain roles, so a restore into a fresh cluster
# stops at the first "role ... does not exist". This script creates the roles from a passwordless
# roles file (pg_dumpall --roles-only --no-role-passwords) BEFORE the restore, then restores with
# ON_ERROR_STOP / --exit-on-error, so owners and GRANTs come back exactly and nothing is skipped.
#
# Never touches prod: it has no host, port or database input. Every query goes to a container it
# starts itself (--network none, tmpfs data, --pull never, no ports, no volumes) or to its own
# initdb cluster (unix socket in a private temp dir, listen_addresses=''). Cleanup removes only that.
#
# Usage: restore-scratch.sh --roles ROLES.sql[.gz] --dump DUMP [options]
#   DUMP: plain .sql / .sql.gz (database-backup-production.sh) or custom-format .dump (pg_dump -Fc)
#   --min-tables N        fail if fewer than N tables are restored (default 39, the OST table count
#                         on 2026-10-25; use a lower number only for fixtures)
#   --expect-counts FILE  exact per-table row counts that must match the restore. Lines are
#                         "schema.table|count" or "schema.table<TAB>count"; lines starting with # are
#                         skipped (the ost-db-backup.sh manifest format works once decrypted)
#   --analytics FILE      also run the partial analytics test (fleetmon ost_analytics)
#   --counts-out FILE     write the restored per-table counts ("schema.table|count")
# Integrity: a plain dump (and the roles file and analytics dump) must end with pg_dump's
# "dump complete" trailer, so an empty or cut-short file fails. A custom dump must have a readable
# TOC with at least --min-tables TABLE DATA entries, and pg_restore --exit-on-error fails on a cut file.
# Env:
#   DOCKER    container CLI (default docker; "sudo docker" or podman also work)
#   PG_IMAGE  image already present locally (default postgres:15-alpine; never pulled)
#   PG_BIN    if set (e.g. /usr/lib/postgresql/15/bin), use a local throwaway cluster instead of a
#             container. For CI and fixtures only: psql runs on this host, so any psql meta-command
#             line in the inputs (other than \restrict / \unrestrict) is refused in this mode.
# Output: table names, row counts and the first "ERROR: ..." phrase only, never row contents.
# Full stderr stays in the private temp dir, which is deleted on exit.
set -euo pipefail
umask 077

WORK=""
CNAME=""
PG_BIN="${PG_BIN:-}"
DOCKER="${DOCKER:-docker}"
cleanup() {
	if [[ -n "$PG_BIN" && -n "$WORK" && -d "$WORK/data" ]]; then
		"$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
	fi
	if [[ -n "$CNAME" ]]; then $DOCKER rm -f -v "$CNAME" >/dev/null 2>&1 || true; fi
	if [[ -n "$WORK" ]]; then rm -rf -- "$WORK"; fi
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

ROLES="" DUMP="" ANALYTICS="" COUNTS_OUT="" EXPECT="" MIN_TABLES=39
while [[ $# -gt 0 ]]; do
	case "$1" in
	--roles) ROLES="$2"; shift 2 ;;
	--dump) DUMP="$2"; shift 2 ;;
	--analytics) ANALYTICS="$2"; shift 2 ;;
	--counts-out) COUNTS_OUT="$2"; shift 2 ;;
	--expect-counts) EXPECT="$2"; shift 2 ;;
	--min-tables) MIN_TABLES="$2"; shift 2 ;;
	*) echo "restore-scratch: unknown option $1" >&2; exit 2 ;;
	esac
done
say() { printf 'restore-scratch: %s\n' "$*"; }
die() { printf 'restore-scratch: FAILED: %s\n' "$*" >&2; exit 1; }
# First error phrase only: stops at the first colon after ERROR, so no DETAIL/CONTEXT and no values.
errline() {
	local e
	e="$(grep -oE 'ERROR: +[^:]{0,80}' "$1" | head -1 || true)"
	[[ -n "$e" ]] || e="$(grep -oE 'error: +[^:]{0,80}' "$1" | head -1 || true)"
	printf '%s' "${e:-no ERROR line (see exit code)}"
}
[[ -r "$ROLES" ]] || die "--roles file required (pg_dumpall --roles-only --no-role-passwords)"
[[ -r "$DUMP" ]] || die "--dump file required"
[[ -z "$ANALYTICS" || -r "$ANALYTICS" ]] || die "cannot read $ANALYTICS"
[[ -z "$EXPECT" || -r "$EXPECT" ]] || die "cannot read $EXPECT"
[[ "$MIN_TABLES" =~ ^[0-9]+$ ]] || die "--min-tables must be a number"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ost-restore-scratch.XXXXXX")"
DB=restoretest

cat_any() { case "$1" in *.gz) gzip -dc -- "$1" ;; *) cat -- "$1" ;; esac; }
is_custom() { [[ "$(head -c 5 -- "$1" | tr -d '\0')" == PGDMP ]]; }

# Text inputs are decompressed once into WORK (gzip errors on a cut .gz fail here).
cat_any "$ROLES" >"$WORK/roles.sql" 2>/dev/null || die "roles file is not readable or not valid gzip"
if ! is_custom "$DUMP"; then
	cat_any "$DUMP" >"$WORK/plain.sql" 2>/dev/null || die "dump is not readable or not valid gzip (truncated?)"
fi
if [[ -n "$ANALYTICS" ]]; then
	cat_any "$ANALYTICS" >"$WORK/an.sql" 2>/dev/null || die "analytics dump is not readable or not valid gzip (truncated?)"
fi

# pg_dump writes the trailer last; after it only "--", blank lines and \unrestrict may follow.
has_trailer() { # file trailer-text
	awk -v T="$2" '
		$0 == T { seen = 1; bad = 0; next }
		seen && !($0 == "--" || $0 == "" || $0 ~ /^\\unrestrict [A-Za-z0-9]+$/) { bad = 1 }
		END { exit !(seen && !bad) }' "$1"
}
# psql meta-commands outside COPY data (COPY rows end at a line "\."). Only \restrict/\unrestrict allowed.
has_meta() {
	awk '
		incopy { if ($0 == "\\.") incopy = 0; next }
		/^COPY .* FROM stdin;$/ { incopy = 1; next }
		/^\\/ && $0 !~ /^\\(un)?restrict [A-Za-z0-9]+$/ { found = 1 }
		END { exit !found }' "$1"
}

# Roles file: no password material, complete, and no meta-commands (checked in both modes).
if grep -qiE 'PASSWORD|SCRAM-SHA-256\$|md5[0-9a-f]{32}' "$WORK/roles.sql"; then
	die "roles file contains password material; regenerate with --no-role-passwords"
fi
grep -q '^CREATE ROLE ' "$WORK/roles.sql" || die "roles file has no CREATE ROLE"
has_trailer "$WORK/roles.sql" '-- PostgreSQL database cluster dump complete' || die "roles file is incomplete (no cluster dump complete trailer)"
if has_meta "$WORK/roles.sql"; then die "roles file contains psql meta-commands; refused"; fi

if [[ -f "$WORK/plain.sql" ]]; then
	has_trailer "$WORK/plain.sql" '-- PostgreSQL database dump complete' || die "dump is empty or incomplete (no dump complete trailer)"
	if [[ -n "$PG_BIN" ]] && has_meta "$WORK/plain.sql"; then die "dump contains psql meta-commands; refused in PG_BIN mode"; fi
fi
if [[ -n "$ANALYTICS" ]]; then
	has_trailer "$WORK/an.sql" '-- PostgreSQL database dump complete' || die "analytics dump is empty or incomplete (no dump complete trailer)"
	if [[ -n "$PG_BIN" ]] && has_meta "$WORK/an.sql"; then die "analytics dump contains psql meta-commands; refused in PG_BIN mode"; fi
fi

if [[ -n "$PG_BIN" ]]; then
	SOCK="$WORK/sock"; mkdir -p "$SOCK"
	"$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null 2>"$WORK/initdb.err" || die "initdb failed"
	"$PG_BIN/pg_ctl" -D "$WORK/data" -w -l "$WORK/pg.log" \
		-o "-c listen_addresses='' -c unix_socket_directories=$SOCK -p 55439" start >/dev/null || die "local cluster did not start"
	psqlx() { "$PG_BIN/psql" -h "$SOCK" -p 55439 -U postgres -X "$@"; }
	pgrestore() { "$PG_BIN/pg_restore" -h "$SOCK" -p 55439 -U postgres "$@"; }
	pgrestore_file() { "$PG_BIN/pg_restore" "$@"; }
	say "scratch: local $("$PG_BIN/postgres" --version) (socket only)"
else
	PG_IMAGE="${PG_IMAGE:-postgres:15-alpine}"
	CNAME="ost-restore-scratch-$$-$RANDOM"
	$DOCKER run -d --rm --pull never --name "$CNAME" --network none --memory 384m \
		--tmpfs /var/lib/postgresql/data:rw,size=768m --tmpfs /tmp:rw,size=256m \
		-e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=postgres "$PG_IMAGE" >/dev/null 2>"$WORK/run.err" ||
		die "could not start $PG_IMAGE (it must already be present locally)"
	ready=false
	for _ in $(seq 1 60); do
		if $DOCKER exec "$CNAME" psql -U postgres -d postgres -qAtc 'select 1' >/dev/null 2>&1; then ready=true; break; fi
		sleep 1
	done
	$ready || die "throwaway postgres did not start"
	sleep 2
	psqlx() { $DOCKER exec -i "$CNAME" psql -U postgres -X "$@"; }
	pgrestore() { $DOCKER exec -i "$CNAME" pg_restore -U postgres "$@"; }
	pgrestore_file() { $DOCKER exec -i "$CNAME" pg_restore "$@"; }
	say "scratch: container $CNAME $($DOCKER exec "$CNAME" postgres --version) (network none, tmpfs)"
fi

# 1) roles first. The bootstrap superuser already exists in a fresh cluster; skip only that line.
grep -vx 'CREATE ROLE postgres;' "$WORK/roles.sql" | psqlx -q -d postgres -v ON_ERROR_STOP=1 >/dev/null 2>"$WORK/roles.err" ||
	die "applying roles failed: $(errline "$WORK/roles.err")"
say "roles applied: $(psqlx -qAt -d postgres -c "select string_agg(rolname, ',' order by rolname) from pg_roles where rolname !~ '^pg_'")"
psqlx -q -d postgres -c "CREATE DATABASE $DB" >/dev/null 2>"$WORK/createdb.err" || die "create scratch db failed: $(errline "$WORK/createdb.err")"

# 2) full restore, stop on the first error
if is_custom "$DUMP"; then
	pgrestore_file -l <"$DUMP" >"$WORK/toc.txt" 2>"$WORK/toc.err" || die "custom dump TOC is unreadable: $(errline "$WORK/toc.err")"
	toc_data="$(grep -c ' TABLE DATA ' "$WORK/toc.txt" || true)"
	((toc_data >= MIN_TABLES)) || die "custom dump lists $toc_data TABLE DATA entries, expected at least $MIN_TABLES"
	pgrestore -d "$DB" --exit-on-error <"$DUMP" 2>"$WORK/restore.err" || die "pg_restore failed: $(errline "$WORK/restore.err")"
	pgrestore_file -f - <"$DUMP" >"$WORK/plain.sql" 2>"$WORK/conv.err" || die "could not convert dump to text for counting: $(errline "$WORK/conv.err")"
else
	psqlx -q -d "$DB" -v ON_ERROR_STOP=1 <"$WORK/plain.sql" >/dev/null 2>"$WORK/restore.err" || die "psql restore failed: $(errline "$WORK/restore.err")"
fi
if grep -q 'ERROR' "$WORK/restore.err"; then die "restore printed errors: $(errline "$WORK/restore.err")"; fi
say "full restore: 0 errors"

copy_counts() { awk '/^COPY /{t=$2; gsub(/"/,"",t); n=0; inb=1; next} inb && /^\\\.$/{print t"|"n; inb=0; next} inb{n++}' "$1" | sort; }
# shellcheck disable=SC2016
COUNT_SQL='SELECT string_agg(format($q$SELECT %L, count(*) FROM %I.%I$q$, n.nspname||$q$.$q$||c.relname, n.nspname, c.relname), $q$ UNION ALL $q$) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ($q$r$q$,$q$p$q$) AND n.nspname NOT IN ($q$pg_catalog$q$,$q$information_schema$q$) AND n.nspname NOT LIKE $q$pg_toast%$q$'
db_counts() {
	local q
	q="$(psqlx -qAt -d "$DB" -c "$COUNT_SQL")"
	[[ -n "$q" ]] || return 0
	psqlx -qAt -F '|' -d "$DB" -c "$q" | sort
}

db_counts >"$WORK/got.txt"
got_tables="$(grep -c . "$WORK/got.txt" || true)"
((got_tables >= MIN_TABLES)) || die "restored $got_tables tables, expected at least $MIN_TABLES (empty or truncated dump?)"
# Self-consistency: rows restored == rows in the dump's COPY data (non-empty tables).
copy_counts "$WORK/plain.sql" >"$WORK/expect.txt"
if ! diff <(grep -v '|0$' "$WORK/got.txt") <(grep -v '|0$' "$WORK/expect.txt") >"$WORK/diff.txt"; then
	die "restored row counts differ from the dump's COPY data ($(grep -c '^[<>]' "$WORK/diff.txt") lines differ)"
fi
say "tables restored: $got_tables (min $MIN_TABLES), rows match the dump's COPY data"
# Independent check: exact counts from a manifest or another source, not from the dump itself.
if [[ -n "$EXPECT" ]]; then
	awk '!/^#/ && NF { gsub(/\t/, "|"); print }' "$EXPECT" | sort >"$WORK/want.txt"
	[[ -s "$WORK/want.txt" ]] || die "--expect-counts file has no rows"
	bad=0
	while IFS='|' read -r t n; do
		g="$(awk -F'|' -v T="$t" '$1 == T {print $2}' "$WORK/got.txt")"
		if [[ "$g" != "$n" ]]; then
			printf 'restore-scratch: count mismatch %s: restored %s expected %s\n' "$t" "${g:-MISSING}" "$n" >&2
			bad=1
		fi
	done <"$WORK/want.txt"
	((bad == 0)) || die "restored counts differ from --expect-counts"
	say "expect-counts: all $(grep -c . "$WORK/want.txt") tables match exactly"
fi
say "_prisma_migrations: $(psqlx -qAt -d "$DB" -c 'select count(*) from public._prisma_migrations' 2>/dev/null || echo n/a)"

# 3) optional partial analytics test (same steps as fleetmon ost_analytics)
if [[ -n "$ANALYTICS" ]]; then
	mapfile -t TABS < <(grep -oE '^CREATE TABLE public\.[a-z_0-9]+' "$WORK/an.sql" | sed 's/^CREATE TABLE public\.//' | sort -u)
	[[ ${#TABS[@]} -gt 0 ]] || die "no tables in analytics dump"
	# The restored ost_guard event triggers would block the DROP and auto-create the truncate
	# trigger that the analytics dump also creates. Disable them in SCRATCH only, load, re-enable.
	EVT="$(psqlx -qAt -d "$DB" -c "select string_agg(quote_ident(evtname), ' ') from pg_event_trigger where evtname like 'ost_guard%'")"
	for e in $EVT; do
		psqlx -q -d "$DB" -v ON_ERROR_STOP=1 -c "ALTER EVENT TRIGGER $e DISABLE" >/dev/null 2>"$WORK/evt.err" ||
			die "could not disable scratch event trigger: $(errline "$WORK/evt.err")"
	done
	{ for t in "${TABS[@]}"; do printf 'DROP TABLE IF EXISTS public."%s" CASCADE;\n' "$t"; done; cat "$WORK/an.sql"; } |
		psqlx -q -d "$DB" -v ON_ERROR_STOP=1 >/dev/null 2>"$WORK/an.err" || die "analytics restore failed: $(errline "$WORK/an.err")"
	for e in $EVT; do psqlx -q -d "$DB" -c "ALTER EVENT TRIGGER $e ENABLE" >/dev/null 2>&1 || true; done
	copy_counts "$WORK/an.sql" >"$WORK/an_expect.txt"
	db_counts | grep -F -f <(printf 'public.%s|\n' "${TABS[@]}") >"$WORK/an_got.txt" || true
	diff <(grep -v '|0$' "$WORK/an_got.txt") <(grep -v '|0$' "$WORK/an_expect.txt") >/dev/null ||
		die "analytics row counts differ from the dump"
	say "analytics partial restore: ${#TABS[@]} tables, 0 errors, rows match the dump (event triggers disabled: ${EVT:-none})"
fi

if [[ -n "$COUNTS_OUT" ]]; then cp -- "$WORK/got.txt" "$COUNTS_OUT"; fi
say "PASSED"
