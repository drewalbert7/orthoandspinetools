#!/bin/bash
# Install / rotate OPENFDA_API_KEY in .env and recreate the backend container.
# Usage: ./scripts/set-openfda-key.sh YOUR_API_KEY
# Get a free key: https://api.data.gov/signup/

set -euo pipefail

ROOT="/home/dstrad/orthoandspinetools-main"
ENV_FILE="$ROOT/.env"
KEY="${1:-}"

if [[ -z "$KEY" ]]; then
  echo "Usage: $0 <openfda-api-key>" >&2
  echo "Sign up: https://api.data.gov/signup/" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

# Strip whitespace / quotes
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]' | tr -d '"' | tr -d "'")"

if [[ ${#KEY} -lt 20 ]]; then
  echo "Key looks too short (${#KEY} chars). Paste the full api.data.gov key." >&2
  exit 1
fi

# Quick live check against openFDA
HTTP="$(curl -sS -o /tmp/openfda-key-check.json -w '%{http_code}' \
  "https://api.fda.gov/device/event.json?api_key=${KEY}&limit=1" || true)"
if [[ "$HTTP" != "200" ]]; then
  echo "openFDA rejected the key (HTTP $HTTP). Response:" >&2
  head -c 400 /tmp/openfda-key-check.json >&2 || true
  echo >&2
  exit 1
fi
echo "openFDA accepted key (HTTP 200)."

if grep -q '^OPENFDA_API_KEY=' "$ENV_FILE"; then
  # portable in-place replace
  tmp="$(mktemp)"
  awk -v k="$KEY" 'BEGIN{done=0} /^OPENFDA_API_KEY=/{print "OPENFDA_API_KEY=" k; done=1; next} {print} END{if(!done) print "OPENFDA_API_KEY=" k}' \
    "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
else
  printf '\nOPENFDA_API_KEY=%s\n' "$KEY" >>"$ENV_FILE"
fi

cd "$ROOT"
docker compose -f docker-compose.prod.yml up -d backend
sleep 4

HAS="$(curl -sS 'https://orthoandspinetools.com/api/maude/status' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['hasApiKey'])")"
echo "Backend reports hasApiKey=$HAS"
if [[ "$HAS" != "True" && "$HAS" != "true" ]]; then
  echo "Backend did not pick up the key — try: docker compose -f docker-compose.prod.yml up -d --force-recreate backend" >&2
  exit 1
fi

echo "Done. Daily warm will use the keyed quota (120k/day)."
