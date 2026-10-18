#!/bin/bash
# shellcheck shell=bash
# Database steps for deploy.sh (DB safety audit 2026-10-17, items 1 and 4). Sourced, not executed.
#
#   ddb_predeploy_dump   fail-closed pg_dump right before migrations. The deploy aborts (nothing is
#                        switched) unless the dump passes ALL checks: gzip -t, size >= minimum,
#                        CREATE TABLE count >= minimum AND equal to the live public table count,
#                        and an implants COPY section. Writes <dump>.sha256 next to it.
#   ddb_migrate          prisma migrate deploy as the ost_migrator role, in a one-off container of
#                        the NEWLY BUILT backend image, BEFORE the app containers are switched.
#                        MIGRATE_DATABASE_URL comes from .env.migrate (mode 600), never from .env:
#                        everything in .env is injected into the app containers via env_file.
# The connection string is passed by name (-e DATABASE_URL) and never printed.
# Dumps are never deleted here; failed dumps stay as *.partial for inspection.

DEPLOY_PG_CONTAINER="${DEPLOY_PG_CONTAINER:-orthoandspinetools-postgres}"
DEPLOY_DB_NAME="${DEPLOY_DB_NAME:-orthoandspinetools}"
# postgres until roles.sql is applied; then ost_backup (read-only). Local socket inside the container.
DEPLOY_DUMP_DB_USER="${DEPLOY_DUMP_DB_USER:-postgres}"
DEPLOY_DUMP_DIR="${DEPLOY_DUMP_DIR:-.deploy-backups/db}"
DEPLOY_DUMP_MIN_BYTES="${DEPLOY_DUMP_MIN_BYTES:-102400}"
DEPLOY_DUMP_MIN_TABLES="${DEPLOY_DUMP_MIN_TABLES:-30}"
DEPLOY_MIGRATE_ENV_FILE="${DEPLOY_MIGRATE_ENV_FILE:-.env.migrate}"
DEPLOY_MIGRATOR_ROLE="${DEPLOY_MIGRATOR_ROLE:-ost_migrator}"

# Path of the last verified dump (set by ddb_predeploy_dump).
DDB_LAST_DUMP=""

ddb_fail() { echo "deploy: $*" >&2; return 1; }

ddb_predeploy_dump() {
    local ts out size tables live
    ts="$(date -u +%Y%m%dT%H%M%SZ)"
    ( umask 077; mkdir -p "$DEPLOY_DUMP_DIR" ) || { ddb_fail "cannot create $DEPLOY_DUMP_DIR"; return 1; }
    chmod 700 "$DEPLOY_DUMP_DIR" 2>/dev/null || true
    out="$DEPLOY_DUMP_DIR/predeploy_${ts}.sql.gz"
    echo "🗄️  Pre-deploy database dump: $out"
    if ! ( set -o pipefail; umask 077
           docker exec "$DEPLOY_PG_CONTAINER" pg_dump -U "$DEPLOY_DUMP_DB_USER" -d "$DEPLOY_DB_NAME" --no-password \
             | gzip -6 > "$out.partial" ); then
        ddb_fail "pg_dump failed; left $out.partial for inspection. Nothing was switched."; return 1
    fi
    if ! gzip -t "$out.partial" 2>/dev/null; then
        ddb_fail "dump failed gzip -t; left $out.partial. Nothing was switched."; return 1
    fi
    size="$(stat -c%s "$out.partial" 2>/dev/null || echo 0)"
    if ! [[ "$size" =~ ^[0-9]+$ ]] || [ "$size" -lt "$DEPLOY_DUMP_MIN_BYTES" ]; then
        ddb_fail "dump is ${size} bytes, below the ${DEPLOY_DUMP_MIN_BYTES}-byte minimum; left $out.partial. Nothing was switched."; return 1
    fi
    tables="$(gzip -dc "$out.partial" | grep -c '^CREATE TABLE ' || true)"
    live="$(docker exec "$DEPLOY_PG_CONTAINER" psql -U "$DEPLOY_DUMP_DB_USER" -d "$DEPLOY_DB_NAME" -qAtc \
        "select count(*) from pg_tables where schemaname = 'public'" 2>/dev/null | tr -d '[:space:]' || true)"
    if ! [[ "$live" =~ ^[0-9]+$ ]]; then
        ddb_fail "could not read the live table count; left $out.partial. Nothing was switched."; return 1
    fi
    if [ "$tables" -lt "$DEPLOY_DUMP_MIN_TABLES" ] || [ "$tables" != "$live" ]; then
        ddb_fail "dump has $tables CREATE TABLE statements; live database has $live (minimum $DEPLOY_DUMP_MIN_TABLES). Left $out.partial. Nothing was switched."; return 1
    fi
    if ! gzip -dc "$out.partial" | grep -q '^COPY public\.implants '; then
        ddb_fail "dump has no implants COPY section; left $out.partial. Nothing was switched."; return 1
    fi
    mv -f "$out.partial" "$out"
    chmod 600 "$out"
    ( umask 077; sha256sum "$out" > "$out.sha256" )
    DDB_LAST_DUMP="$out"
    echo "   ✅ dump verified: ${size} bytes, gzip OK, ${tables} tables (live ${live}), implants COPY present"
    echo "   sha256 $(cut -d' ' -f1 "$out.sha256")"
}

# Reads MIGRATE_DATABASE_URL from the migrate env file without sourcing it.
ddb_migrate_url() {
    local f="$DEPLOY_MIGRATE_ENV_FILE" mode owner url
    [ -f "$f" ] || { ddb_fail "$f not found (needs MIGRATE_DATABASE_URL for the $DEPLOY_MIGRATOR_ROLE role; see docs/db-safety/apply-runbook.md). Use --no-migrate only if this release has no new migration."; return 1; }
    mode="$(stat -c%a "$f")"
    owner="$(stat -c%u "$f")"
    [ "$mode" = 600 ] || [ "$mode" = 400 ] || { ddb_fail "$f must be mode 600 (is $mode)"; return 1; }
    [ "$owner" = "$(id -u)" ] || { ddb_fail "$f must be owned by the deploying user"; return 1; }
    url="$(grep -E '^MIGRATE_DATABASE_URL=' "$f" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
    [ -n "$url" ] || { ddb_fail "MIGRATE_DATABASE_URL is empty in $f"; return 1; }
    case "$url" in
        postgresql://"$DEPLOY_MIGRATOR_ROLE":* | postgres://"$DEPLOY_MIGRATOR_ROLE":*) ;;
        *) ddb_fail "MIGRATE_DATABASE_URL must use the $DEPLOY_MIGRATOR_ROLE role (never postgres or ost_app)"; return 1 ;;
    esac
    printf '%s' "$url"
}

ddb_migrate() {
    local url
    url="$(ddb_migrate_url)" || return 1
    echo "🧬 prisma migrate deploy as $DEPLOY_MIGRATOR_ROLE (new backend image, before the switch)..."
    if ! DATABASE_URL="$url" docker compose -f "$COMPOSE_FILE" run --rm --no-deps -T -e DATABASE_URL \
            backend npx prisma migrate deploy; then
        ddb_fail "prisma migrate deploy failed. Nothing was switched; the old containers keep running. Verified dump: ${DDB_LAST_DUMP:-none}"
        return 1
    fi
    if ! DATABASE_URL="$url" docker compose -f "$COMPOSE_FILE" run --rm --no-deps -T -e DATABASE_URL \
            backend npx prisma migrate status; then
        ddb_fail "prisma migrate status is not clean after deploy. Nothing was switched."
        return 1
    fi
    echo "   ✅ migrations applied and status clean"
}
