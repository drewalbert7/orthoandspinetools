#!/bin/bash
# Cron entrypoint: daily PostgreSQL backup (logs via crontab redirect).

set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

ROOT="/home/dstrad/orthoandspinetools-main"
cd "$ROOT"

echo "=== Database backup started: $(date -Iseconds) ==="
"$ROOT/scripts/database-backup-production.sh"
echo "=== Database backup finished: $(date -Iseconds) ==="
