#!/usr/bin/env bash
# The ONLY supported way to run Prisma migrations on OST production (audit items 1 + 4).
# 1. pre-migration snapshot (abort if it fails)  2. `prisma migrate deploy` as ost_migrator
# in a one-off backend container. The app keeps running as ost_app (DML only).
#
# MIGRATOR_DATABASE_URL lives in /etc/ost-backup/migrator.env (root:root 600), NOT in .env:
# everything in .env is injected into the backend + bot-analytics containers via env_file.
#   sudo scripts/db-migrate.sh            # status + deploy
#   sudo scripts/db-migrate.sh --status   # status only
set -euo pipefail
umask 077
ROOT="${OST_ROOT:-/home/dstrad/orthoandspinetools-main}"
COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-docker-compose.prod.yml}"
MIGRATOR_ENV="${OST_MIGRATOR_ENV:-/etc/ost-backup/migrator.env}"
cd "$ROOT"
[[ -r "$MIGRATOR_ENV" ]] || { echo "db-migrate: $MIGRATOR_ENV missing (needs MIGRATOR_DATABASE_URL)" >&2; exit 1; }
# shellcheck disable=SC1090
source "$MIGRATOR_ENV"
: "${MIGRATOR_DATABASE_URL:?MIGRATOR_DATABASE_URL not set in $MIGRATOR_ENV}"
case "$MIGRATOR_DATABASE_URL" in postgresql://ost_migrator:* | postgres://ost_migrator:*) ;;
	*) echo "db-migrate: MIGRATOR_DATABASE_URL must use the ost_migrator role" >&2; exit 1 ;; esac

run_prisma() { # value passed by name (-e DATABASE_URL), never on the command line
	DATABASE_URL="$MIGRATOR_DATABASE_URL" docker compose -f "$COMPOSE_FILE" run --rm --no-deps -T \
		-e DATABASE_URL backend npx prisma "$@"
}
run_prisma migrate status || true
[[ "${1:-}" == "--status" ]] && exit 0
"$ROOT/scripts/predeploy-db-snapshot.sh" pre-migrate
run_prisma migrate deploy
run_prisma migrate status
