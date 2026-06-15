#!/bin/bash
# Install or update the uptime monitor cron job (every 5 minutes).

set -euo pipefail

ROOT="/home/dstrad/orthoandspinetools-main"
CRON_LINE="*/5 * * * * $ROOT/scripts/uptime-monitor-cron.sh >> $ROOT/logs/uptime-monitor-cron.log 2>&1"
MARKER="# orthoandspinetools uptime monitor"

chmod +x "$ROOT/scripts/uptime-monitor.sh" "$ROOT/scripts/uptime-monitor-cron.sh"
mkdir -p "$ROOT/logs"

existing="$(crontab -l 2>/dev/null || true)"
if printf '%s\n' "$existing" | grep -Fq "$MARKER"; then
  updated="$(printf '%s\n' "$existing" | grep -Fv "$ROOT/scripts/uptime-monitor-cron.sh")"
  printf '%s\n%s\n%s\n' "$updated" "$MARKER" "$CRON_LINE" | sed '/^$/N;/^\n$/d' | crontab -
  echo "Updated uptime monitor cron."
else
  {
    printf '%s\n' "$existing"
    printf '%s\n' "$MARKER"
    printf '%s\n' "$CRON_LINE"
  } | sed '/^$/N;/^\n$/d' | crontab -
  echo "Installed uptime monitor cron (every 5 minutes)."
fi

echo "Cron entry:"
crontab -l | grep -F uptime-monitor || true
echo ""
echo "Test once: UPTIME_DRY_RUN=1 $ROOT/scripts/uptime-monitor.sh"
