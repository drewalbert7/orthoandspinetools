#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-https://orthoandspinetools.com}"
echo "Checking ${BASE} ..."

curl -sfS "${BASE}/api/health" | head -c 400
echo ""
echo "OK: /api/health"

curl -sfS "${BASE}/api/posts?limit=1" >/dev/null
echo "OK: GET /api/posts"

curl -sfS "${BASE}/api/communities" >/dev/null
echo "OK: GET /api/communities"

curl -sfS -o /dev/null "${BASE}/robots.txt"
echo "OK: /robots.txt"

curl -sfS -o /dev/null "${BASE}/llms.txt"
echo "OK: /llms.txt"

echo "All checks passed."
