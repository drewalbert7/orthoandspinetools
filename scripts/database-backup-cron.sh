#!/bin/bash
# Cron entrypoint: daily PostgreSQL backup (logs via crontab redirect).

set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

ROOT="/home/dstrad/orthoandspinetools-main"
cd "$ROOT"
# Offsite copies are made by the root ost-db-backup.timer (encrypted, private bucket). Local dump only here.
export SKIP_R2_BACKUP=1

echo "=== Database backup started: $(date -Iseconds) ==="
"$ROOT/scripts/database-backup-production.sh"
echo "=== Database backup finished: $(date -Iseconds) ==="
