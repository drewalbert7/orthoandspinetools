#!/usr/bin/env bash
# Analytics table dump — durable copy outside deploy/git wipe paths.
# Tables: analytics_page_views + analytics_bot*
#
# Primary:  /mnt/HC_Volume_106016238/orthoandspinetools-backups/analytics/
# Fallback: /var/lib/orthoandspinetools/backups/analytics/ (if writable)
# Last resort: $ROOT/backups/analytics/ (gitignored — avoid relying on this)
#
# Retention: ≥30 days. Also writes *-latest.sql.gz.

set -euo pipefail

ROOT="/home/dstrad/orthoandspinetools-main"
CONTAINER_NAME="orthoandspinetools-postgres"
DB_NAME="orthoandspinetools"
DB_USER="postgres"
RETENTION_DAYS="${ANALYTICS_BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
STAMP_FILE="analytics_${TIMESTAMP}.sql.gz"
LATEST_FILE="analytics-latest.sql.gz"

VOLUME_DIR="/mnt/HC_Volume_106016238/orthoandspinetools-backups/analytics"
VARLIB_DIR="/var/lib/orthoandspinetools/backups/analytics"
REPO_DIR="$ROOT/backups/analytics"

resolve_dir() {
  if [[ -n "${ANALYTICS_BACKUP_DIR:-}" ]]; then
    mkdir -p "$ANALYTICS_BACKUP_DIR"
    echo "$ANALYTICS_BACKUP_DIR"
    return
  fi
  if [[ -d "/mnt/HC_Volume_106016238/orthoandspinetools-backups" ]] || mkdir -p "$VOLUME_DIR" 2>/dev/null; then
    if mkdir -p "$VOLUME_DIR" 2>/dev/null && [[ -w "$VOLUME_DIR" ]]; then
      echo "$VOLUME_DIR"
      return
    fi
  fi
  if mkdir -p "$VARLIB_DIR" 2>/dev/null && [[ -w "$VARLIB_DIR" ]]; then
    echo "$VARLIB_DIR"
    return
  fi
  mkdir -p "$REPO_DIR"
  echo "$REPO_DIR"
}

TABLES=(
  analytics_page_views
  analytics_bots
  analytics_bot_paths
  analytics_bot_daily
  analytics_bot_daily_family
  analytics_bot_recent
  analytics_bot_state
)

BACKUP_DIR="$(resolve_dir)"
OUT="$BACKUP_DIR/$STAMP_FILE"
TMP="$BACKUP_DIR/.analytics_${TIMESTAMP}.sql.gz.tmp"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "ERROR: $CONTAINER_NAME is not running" >&2
  exit 1
fi

TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=(-t "$t")
done

echo "=== Analytics backup $(date -Iseconds) ==="
echo "dir=$BACKUP_DIR"
echo "file=$STAMP_FILE"

# Dump only analytics tables (data + schema for those tables)
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-privileges \
  "${TABLE_ARGS[@]}" \
  | gzip -c > "$TMP"

mv -f "$TMP" "$OUT"
cp -f "$OUT" "$BACKUP_DIR/$LATEST_FILE"

# Headline fingerprint for the log (counts, not PII)
COUNTS="$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -At -c "
SELECT 'page_views=' || (SELECT COUNT(*) FROM analytics_page_views) ||
       ' bots=' || (SELECT COUNT(*) FROM analytics_bots) ||
       ' bot_daily=' || (SELECT COUNT(*) FROM analytics_bot_daily) ||
       ' bot_state=' || (SELECT COUNT(*) FROM analytics_bot_state);
")"
SHA="$(sha256sum "$OUT" | awk '{print $1}')"
SIZE="$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
MTIME="$(stat -c%y "$OUT" 2>/dev/null || stat -f%Sm "$OUT")"

echo "size=$SIZE mtime=$MTIME"
echo "sha256=$SHA"
echo "counts=$COUNTS"

# Retention
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'analytics_*.sql.gz' -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

echo "=== Analytics backup done ==="
echo "$OUT"
