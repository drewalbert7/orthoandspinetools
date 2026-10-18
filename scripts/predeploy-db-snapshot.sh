#!/usr/bin/env bash
# Pre-deploy / pre-migration snapshot for OST (audit item 4). Fails (non-zero) if the snapshot fails,
# so deploy.sh / db-migrate.sh must abort. Local only, root/dstrad-only perms, keeps the newest 10.
# Called from deploy.sh before the build and from scripts/db-migrate.sh before `prisma migrate deploy`.
#   predeploy-db-snapshot.sh [label]
set -euo pipefail
umask 077
DOCKER="${DOCKER:-docker}"
CONTAINER="${OST_PG_CONTAINER:-orthoandspinetools-postgres}"
DB_NAME="${OST_DB_NAME:-orthoandspinetools}"
# ost_backup once roles.sql is applied; postgres works too (local socket) until then.
DB_USER="${OST_SNAPSHOT_DB_USER:-ost_backup}"
# deploy.sh runs as dstrad, so this dir must be dstrad-owned (700), separate from the root-only backup dir.
DIR="${OST_PREDEPLOY_DIR:-/mnt/HC_Volume_106016238/ost-predeploy}"
KEEP="${OST_PREDEPLOY_KEEP:-10}"
LABEL="$(printf '%s' "${1:-deploy}" | tr -c 'A-Za-z0-9_.-' '_')"

if [[ "$DB_USER" == ost_backup ]] && [[ "$($DOCKER exec "$CONTAINER" psql -U postgres -d "$DB_NAME" -qAtc "select count(*) from pg_roles where rolname='ost_backup'")" != 1 ]]; then
	echo "predeploy snapshot: role ost_backup not present yet (roles.sql not applied); using postgres" >&2
	DB_USER=postgres
fi
mkdir -p "$DIR"
chmod 700 "$DIR"
OUT="$DIR/predeploy_$(date -u +%Y%m%dT%H%M%SZ)_${LABEL}.dump"
$DOCKER exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -Z 6 >"$OUT.partial"
[[ -s "$OUT.partial" ]] || { rm -f -- "$OUT.partial"; echo "predeploy snapshot: empty dump" >&2; exit 1; }
n="$($DOCKER exec -i "$CONTAINER" pg_restore -l <"$OUT.partial" | grep -c ' TABLE DATA ' || true)"
((n > 0)) || { rm -f -- "$OUT.partial"; echo "predeploy snapshot: unreadable dump" >&2; exit 1; }
mv -f "$OUT.partial" "$OUT"
chmod 600 "$OUT"
# Keep the newest $KEEP snapshots in this directory only.
mapfile -t old < <(find "$DIR" -maxdepth 1 -type f -name 'predeploy_*.dump' -printf '%T@ %p\n' | sort -rn | awk -v k="$KEEP" 'NR>k{print $2}')
for f in "${old[@]}"; do rm -f -- "$f"; done
echo "predeploy snapshot ok: $OUT ($(stat -c%s "$OUT") bytes)"
