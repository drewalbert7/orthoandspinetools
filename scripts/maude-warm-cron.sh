#!/bin/bash
# Daily: refresh MAUDE / openFDA trend caches (secret from .env, not crontab).

set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

ROOT="/home/dstrad/orthoandspinetools-main"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ENV_FILE"
set +a

SECRET="${MAUDE_CRON_SECRET:-${EMAIL_DIGEST_CRON_SECRET:-}}"
if [[ -z "$SECRET" ]]; then
  echo "MAUDE_CRON_SECRET (or EMAIL_DIGEST_CRON_SECRET) not set in .env" >&2
  exit 1
fi

curl -fsS -X POST 'https://orthoandspinetools.com/api/maude/warm' \
  -H "x-maude-secret: ${SECRET}" \
  -H 'Content-Type: application/json'
echo
