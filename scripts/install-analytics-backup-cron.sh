#!/usr/bin/env bash
# Install daily analytics table backup cron (02:15 — after full DB backup at 02:00).

set -euo pipefail

ROOT="/home/dstrad/orthoandspinetools-main"
SCRIPT="$ROOT/scripts/analytics-backup.sh"
LOG_DIR="$ROOT/logs"
CRON_LINE="15 2 * * * $SCRIPT >> $LOG_DIR/analytics-backup-cron.log 2>&1"
MARKER="orthoandspinetools analytics backup"

chmod +x "$SCRIPT"
mkdir -p "$LOG_DIR"

EXISTING="$(crontab -l 2>/dev/null || true)"
if echo "$EXISTING" | grep -Fq "$SCRIPT"; then
  echo "Cron already installed for $SCRIPT"
  crontab -l | grep -F "$SCRIPT" || true
  exit 0
fi

{
  echo "$EXISTING"
  echo "# $MARKER"
  echo "$CRON_LINE"
} | crontab -

echo "Installed:"
echo "$CRON_LINE"
crontab -l | grep -F "$SCRIPT" || true
