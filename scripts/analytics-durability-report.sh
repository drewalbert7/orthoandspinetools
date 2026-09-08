#!/usr/bin/env bash
# Post-change analytics durability report (run after analytics/deploy/nginx/systemd work).

set -euo pipefail

ROOT="/home/dstrad/orthoandspinetools-main"
CONTAINER_NAME="orthoandspinetools-postgres"
DB_NAME="orthoandspinetools"
DB_USER="postgres"
VOLUME_DIR="/mnt/HC_Volume_106016238/orthoandspinetools-backups/analytics"
VARLIB_DIR="/var/lib/orthoandspinetools/backups/analytics"

echo "=== Analytics durability report $(date -Iseconds) ==="
echo ""
echo "## Persistence"
echo "Store: Docker volume orthoandspinetools-main_postgres_data"
docker volume inspect orthoandspinetools-main_postgres_data --format 'Mountpoint: {{.Mountpoint}}' 2>/dev/null || echo "Mountpoint: (unavailable)"
echo "Outside git repo: yes (never under dist/, public/, or rsync --delete targets)"
echo "Bot cursor: analytics_bot_state.key=log_cursor (backfilled_at gates one-shot backfill)"
echo ""

echo "## Backup paths"
for d in "$VOLUME_DIR" "$VARLIB_DIR" "$ROOT/backups/analytics"; do
  if [[ -d "$d" ]]; then
    latest="$(ls -1t "$d"/analytics-latest.sql.gz "$d"/analytics_*.sql.gz 2>/dev/null | head -1 || true)"
    if [[ -n "$latest" && -f "$latest" ]]; then
      echo "OK $d"
      echo "  latest=$latest"
      echo "  size=$(stat -c%s "$latest" 2>/dev/null || echo '?') sha256=$(sha256sum "$latest" | awk '{print $1}')"
    else
      echo "EMPTY $d"
    fi
  else
    echo "MISSING $d"
  fi
done
echo ""

echo "## Table counts"
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 'analytics_page_views' AS t, COUNT(*)::int AS n FROM analytics_page_views
UNION ALL SELECT 'analytics_bots', COUNT(*)::int FROM analytics_bots
UNION ALL SELECT 'analytics_bot_daily', COUNT(*)::int FROM analytics_bot_daily
UNION ALL SELECT 'analytics_bot_state', COUNT(*)::int FROM analytics_bot_state;
" 2>/dev/null || echo "(postgres unavailable)"

echo "## Headlines (UTC days)"
docker compose -f "$ROOT/docker-compose.prod.yml" exec -T backend \
  node -e "
const { buildTrafficAnalytics } = require('./dist/lib/adminAnalytics');
buildTrafficAnalytics().then(t => {
  console.log(JSON.stringify({
    viewsToday: t.pageViewsToday,
    views7d: t.pageViewsWeek,
    botsHitsToday: t.bots && t.bots.hitsToday,
    botsHits7d: t.bots && t.bots.hits7d,
    botsSource: t.bots && t.bots.source,
    trackingSince: t.trackingSince
  }, null, 2));
  process.exit(0);
}).catch(e => { console.error(String(e)); process.exit(1); });
" 2>/dev/null || echo "(backend headline query failed)"

echo ""
echo "## Cron"
crontab -l 2>/dev/null | grep -F analytics-backup || echo "(analytics backup cron not installed — run scripts/install-analytics-backup-cron.sh)"
echo "=== end report ==="
