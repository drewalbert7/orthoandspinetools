#!/bin/bash
# Cron entrypoint: renew TLS certs and reload nginx (logs via crontab redirect).

set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

ROOT="/home/dstrad/orthoandspinetools-main"
cd "$ROOT"

echo "=== SSL renewal started: $(date -Iseconds) ==="
"$ROOT/update-ssl-certs.sh"
echo "=== SSL renewal finished: $(date -Iseconds) ==="
