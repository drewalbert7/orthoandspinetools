#!/bin/bash
# Install daily MAUDE openFDA cache warm (06:30 UTC — after typical weekend FDA refreshes).

set -euo pipefail

ROOT="/home/dstrad/orthoandspinetools-main"
CRON_LINE="30 6 * * * $ROOT/scripts/maude-warm-cron.sh >> $ROOT/logs/maude-warm-cron.log 2>&1"
MARKER="# orthoandspinetools maude warm"

chmod +x "$ROOT/scripts/maude-warm-cron.sh"
mkdir -p "$ROOT/logs"

existing="$(crontab -l 2>/dev/null || true)"
if printf '%s\n' "$existing" | grep -Fq "$MARKER"; then
  updated="$(printf '%s\n' "$existing" | grep -Fv "$ROOT/scripts/maude-warm-cron.sh")"
  printf '%s\n%s\n%s\n' "$updated" "$MARKER" "$CRON_LINE" | sed '/^$/N;/^\n$/d' | crontab -
  echo "Updated MAUDE warm cron."
else
  {
    printf '%s\n' "$existing"
    printf '%s\n' "$MARKER"
    printf '%s\n' "$CRON_LINE"
  } | sed '/^$/N;/^\n$/d' | crontab -
  echo "Installed MAUDE warm cron (daily 06:30 UTC)."
fi

echo "Cron entry:"
crontab -l | grep -F maude-warm || true
echo ""
echo "Test once: $ROOT/scripts/maude-warm-cron.sh"
