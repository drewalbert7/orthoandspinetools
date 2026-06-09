#!/usr/bin/env bash
# Report Docker/root disk usage and optionally run SAFE cleanup.
# Never runs: docker compose down -v, docker volume rm on named prod volumes, or system prune -a --volumes
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
PROD_VOLUME="${PROD_VOLUME:-orthoandspinetools-main_postgres_data}"
WARN_PCT="${WARN_PCT:-85}"
ACTION="${1:-report}"

report() {
  echo "=== Disk usage ==="
  df -h / | tail -1
  echo ""
  echo "=== Docker summary ==="
  docker system df 2>/dev/null || true
  echo ""
  echo "=== Production postgres volume (do not delete) ==="
  docker volume inspect "$PROD_VOLUME" --format 'Name: {{.Name}}  Mountpoint: {{.Mountpoint}}' 2>/dev/null \
    || echo "WARNING: $PROD_VOLUME not found"
  docker ps --filter "name=orthoandspinetools-postgres" --format 'Container: {{.Names}}  Status: {{.Status}}' 2>/dev/null || true
  echo ""
  echo "=== Unused volumes (docker volume prune candidates) ==="
  docker system df -v 2>/dev/null | awk '/^VOLUME NAME/ {v=1; next} v && $2==0 {print "  "$1"  "$4}' || echo "  (run: docker system df -v)"
  echo ""
  echo "=== Dangling images ==="
  docker images -f "dangling=true" --format '  {{.ID}}  {{.Size}}' 2>/dev/null || echo "  none"
  echo ""
  echo "=== Large project paths ==="
  du -sh "${HOME}/orthoandspinetools-main/nginx/logs" 2>/dev/null || true
  du -sh "${HOME}/orthoandspinetools-main/backend/node_modules" "${HOME}/orthoandspinetools-main/frontend/node_modules" 2>/dev/null || true
}

used_pct() {
  df / | tail -1 | awk '{gsub(/%/,"",$5); print $5}'
}

safe_cleanup() {
  echo "Running SAFE Docker cleanup..."
  echo ""

  echo "1. Dangling images..."
  docker image prune -f

  echo ""
  echo "2. Build cache (frees space; next build will be slower)..."
  docker builder prune -af

  echo ""
  echo "3. Unused volumes (skips volumes still referenced by any container)..."
  echo "   Protected named volume: $PROD_VOLUME"
  docker volume prune -f

  echo ""
  echo "4. Nginx access log rotation (truncate if >50MB)..."
  NGINX_LOG="${HOME}/orthoandspinetools-main/nginx/logs/access.log"
  if [ -f "$NGINX_LOG" ]; then
    size=$(stat -c%s "$NGINX_LOG" 2>/dev/null || echo 0)
    if [ "$size" -gt 52428800 ]; then
      : > "$NGINX_LOG"
      echo "   Truncated $NGINX_LOG (was $(( size / 1024 / 1024 ))MB)"
    else
      echo "   OK ($(( size / 1024 / 1024 ))MB)"
    fi
  fi

  echo ""
  echo "=== After cleanup ==="
  df -h / | tail -1
  docker system df 2>/dev/null || true
}

case "$ACTION" in
  report)
    report
    pct=$(used_pct)
    if [ "$pct" -ge "$WARN_PCT" ]; then
      echo ""
      echo "WARNING: root disk at ${pct}% (threshold ${WARN_PCT}%). Run: $0 cleanup"
      exit 1
    fi
    ;;
  cleanup)
    report
    echo ""
    safe_cleanup
    ;;
  *)
    echo "Usage: $0 [report|cleanup]"
    echo "  report  — show usage (default); exits 1 if disk >= ${WARN_PCT}%"
    echo "  cleanup — safe prune images, build cache, unused volumes, large nginx log"
    exit 1
    ;;
esac
