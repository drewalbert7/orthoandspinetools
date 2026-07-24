#!/bin/bash
# Cron entrypoint: email digest (secret loaded from .env, not crontab).

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

if [[ -z "${EMAIL_DIGEST_CRON_SECRET:-}" ]]; then
  echo "EMAIL_DIGEST_CRON_SECRET not set in .env" >&2
  exit 1
fi

curl -fsS -X POST 'https://orthoandspinetools.com/api/notifications/digest/cron' \
  -H "x-digest-secret: ${EMAIL_DIGEST_CRON_SECRET}"
