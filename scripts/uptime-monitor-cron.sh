#!/bin/bash
# Cron entrypoint: uptime checks every 5 minutes (install via install-uptime-monitor-cron.sh).

set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

ROOT="/home/dstrad/orthoandspinetools-main"
cd "$ROOT"

"$ROOT/scripts/uptime-monitor.sh"
