#!/usr/bin/env bash
# Pre-deploy / pre-migration snapshot for OST (audit item 4). Fails (non-zero) if the snapshot fails,
# so deploy.sh / db-migrate.sh must abort. Local only, root/dstrad-only perms, keeps the newest 10.
# Called from deploy.sh before the build and from scripts/db-migrate.sh before `prisma migrate deploy`.
#   predeploy-db-snapshot.sh [label]
#
# When EUID=0 (sudo/root install), never write into the dstrad-owned ost-predeploy directory.
# Use a root-owned directory, create the dump with mktemp + noclobber, and refuse symlinks.
set -euo pipefail
set -o noclobber
umask 077
DOCKER="${DOCKER:-docker}"
CONTAINER="${OST_PG_CONTAINER:-orthoandspinetools-postgres}"
DB_NAME="${OST_DB_NAME:-orthoandspinetools}"
# ost_backup once roles.sql is applied; postgres works too (local socket) until then.
DB_USER="${OST_SNAPSHOT_DB_USER:-ost_backup}"
KEEP="${OST_PREDEPLOY_KEEP:-10}"
# Fail-closed floor (prod -Fc dump is ~200 KB for a 14 MB DB): a dump below this is treated as broken.
MIN_BYTES="${OST_PREDEPLOY_MIN_BYTES:-20000}"
LABEL="$(printf '%s' "${1:-deploy}" | tr -c 'A-Za-z0-9_.-' '_')"

# Root must not write into a dstrad-owned tree (symlink clobber). Non-root keeps the deploy path.
if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
	DIR="${OST_PREDEPLOY_ROOT_DIR:-/mnt/HC_Volume_106016238/ost-predeploy-root}"
else
	DIR="${OST_PREDEPLOY_DIR:-/mnt/HC_Volume_106016238/ost-predeploy}"
fi

if [[ -L "$DIR" ]]; then
	echo "predeploy snapshot: refusing symlink directory: $DIR" >&2
	exit 1
fi

if [[ "$DB_USER" == ost_backup ]] && [[ "$($DOCKER exec "$CONTAINER" psql -U postgres -d "$DB_NAME" -qAtc "select count(*) from pg_roles where rolname='ost_backup'")" != 1 ]]; then
	echo "predeploy snapshot: role ost_backup not present yet (roles.sql not applied); using postgres" >&2
	DB_USER=postgres
fi
mkdir -p "$DIR"
if [[ -L "$DIR" ]]; then
	echo "predeploy snapshot: refusing symlink directory after mkdir: $DIR" >&2
	exit 1
fi
chmod 700 "$DIR"

# Unique name via mktemp (no predictable predeploy_<second>_*.dump.partial for symlink plants).
PARTIAL="$(mktemp -p "$DIR" "predeploy_${LABEL}_XXXXXX.partial")"
cleanup_partial() { rm -f -- "$PARTIAL"; }
trap cleanup_partial EXIT
if [[ -L "$PARTIAL" ]]; then
	echo "predeploy snapshot: refusing symlink target: $PARTIAL" >&2
	exit 1
fi

# >| writes into the mktemp file we just created (noclobber would block plain > on an existing path).
$DOCKER exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -Z 6 >|"$PARTIAL"
[[ -s "$PARTIAL" ]] || { echo "predeploy snapshot: empty dump" >&2; exit 1; }
n="$($DOCKER exec -i "$CONTAINER" pg_restore -l <"$PARTIAL" | grep -c ' TABLE DATA ' || true)"
((n > 0)) || { echo "predeploy snapshot: unreadable dump" >&2; exit 1; }
# Size floor, table count equal to the live database, and the implants data present.
size="$(stat -c%s "$PARTIAL")"
((size >= MIN_BYTES)) || { echo "predeploy snapshot: dump is $size bytes, below the $MIN_BYTES-byte floor" >&2; exit 1; }
live="$($DOCKER exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -qAtc "select count(*) from pg_tables where schemaname = 'public'" | tr -d '[:space:]')"
dumped="$($DOCKER exec -i "$CONTAINER" pg_restore -l <"$PARTIAL" | grep -c ' TABLE public ' || true)"
if ! [[ "$live" =~ ^[0-9]+$ ]] || ((dumped != live)); then
	echo "predeploy snapshot: dump has $dumped public tables, live database has ${live:-?}" >&2; exit 1
fi
$DOCKER exec -i "$CONTAINER" pg_restore -l <"$PARTIAL" | grep -q ' TABLE DATA public implants ' || { echo "predeploy snapshot: no implants table data in the dump" >&2; exit 1; }

OUT="$DIR/predeploy_$(date -u +%Y%m%dT%H%M%SZ)_${LABEL}.dump"
if [[ -L "$OUT" ]]; then
	echo "predeploy snapshot: refusing symlink target: $OUT" >&2
	exit 1
fi
# mv -n: do not replace an existing name (noclobber for the final path).
if [[ -e "$OUT" ]]; then
	echo "predeploy snapshot: refusing to overwrite existing: $OUT" >&2
	exit 1
fi
mv -n -- "$PARTIAL" "$OUT"
trap - EXIT
chmod 600 "$OUT"
# Keep the newest $KEEP snapshots in this directory only.
mapfile -t old < <(find "$DIR" -maxdepth 1 -type f -name 'predeploy_*.dump' -printf '%T@ %p\n' | sort -rn | awk -v k="$KEEP" 'NR>k{print $2}')
for f in "${old[@]}"; do
	if [[ -L "$f" ]]; then
		echo "predeploy snapshot: refusing to touch symlink during retention: $f" >&2
		continue
	fi
	rm -f -- "$f"
done
echo "predeploy snapshot ok: $OUT ($(stat -c%s "$OUT") bytes, $dumped/$live public tables, TOC readable, implants data present)"
