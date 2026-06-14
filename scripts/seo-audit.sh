#!/usr/bin/env bash
# Lightweight SEO audit: curl checks + optional Lighthouse (requires Node/npx).
set -euo pipefail

BASE="${BASE_URL:-https://orthoandspinetools.com}"
PASS=0
FAIL=0
WARN=0

check() {
  local name="$1"
  shift
  if "$@"; then
    echo "  OK  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name"
    FAIL=$((FAIL + 1))
  fi
}

warn() {
  echo "  WARN $1"
  WARN=$((WARN + 1))
}

http_code() { curl -sS -o /dev/null -w "%{http_code}" "$@"; }

echo "SEO audit — $BASE"
echo ""

echo "1. Crawl files"
check "robots.txt" test "$(http_code "$BASE/robots.txt")" = "200"
check "sitemap.xml" test "$(http_code "$BASE/sitemap.xml")" = "200"
check "llms.txt" test "$(http_code "$BASE/llms.txt")" = "200"
check "llms-full.txt" test "$(http_code "$BASE/llms-full.txt")" = "200"

echo ""
echo "2. Meta on key pages (SPA shell)"
for path in "/" "/cases" "/startups" "/popular"; do
  check "title on $path" bash -c "curl -sS '$BASE$path' | grep -qi '<title>'"
done

echo ""
echo "3. OG previews (bot user-agent)"
POST_ID="$(curl -sS "$BASE/api/posts?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['posts'][0]['id'])" 2>/dev/null || true)"
COMMUNITY_SLUG="$(curl -sS "$BASE/api/communities" | python3 -c "import sys,json; d=json.load(sys.stdin); c=d['data']; print(c[0]['slug'] if c else '')" 2>/dev/null || true)"
USERNAME="$(curl -sS "$BASE/api/posts?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['posts'][0]['author']['username'])" 2>/dev/null || true)"

UA="facebookexternalhit/1.1"
if [ -n "$POST_ID" ]; then
  check "post og:title" bash -c "curl -sS -A '$UA' '$BASE/post/$POST_ID' | grep -q 'property=\"og:title\"'"
  check "post og:description" bash -c "curl -sS -A '$UA' '$BASE/post/$POST_ID' | grep -q 'property=\"og:description\"'"
fi
if [ -n "$COMMUNITY_SLUG" ]; then
  check "community og:title" bash -c "curl -sS -A '$UA' '$BASE/community/$COMMUNITY_SLUG' | grep -q 'property=\"og:title\"'"
fi
if [ -n "$USERNAME" ]; then
  check "user og:title" bash -c "curl -sS -A '$UA' '$BASE/user/$USERNAME' | grep -q 'property=\"og:title\"'"
  check "user og:type profile" bash -c "curl -sS -A '$UA' '$BASE/user/$USERNAME' | grep -q 'property=\"og:type\" content=\"profile\"'"
fi

echo ""
echo "4. noIndex on auth pages"
for path in "/login" "/register" "/forgot-password"; do
  if curl -sS "$BASE$path" | grep -qi 'noindex'; then
    check "noindex $path" true
  else
    warn "noindex not in initial HTML for $path (may be client-rendered)"
  fi
done

echo ""
echo "5. Lighthouse (optional)"
if command -v npx >/dev/null 2>&1; then
  OUT_DIR="${TMPDIR:-/tmp}/oast-seo-lighthouse"
  mkdir -p "$OUT_DIR"
  if npx --yes lighthouse "$BASE/" --only-categories=seo --chrome-flags="--headless --no-sandbox" --output=json --output-path="$OUT_DIR/home.json" --quiet 2>/dev/null; then
    SCORE="$(python3 -c "import json; print(int(json.load(open('$OUT_DIR/home.json'))['categories']['seo']['score']*100))" 2>/dev/null || echo "?")"
    if [ "$SCORE" != "?" ] && [ "$SCORE" -ge 90 ]; then
      check "Lighthouse SEO score $SCORE" true
    elif [ "$SCORE" != "?" ]; then
      warn "Lighthouse SEO score $SCORE (target ≥90)"
    else
      warn "Lighthouse ran but score unreadable"
    fi
  else
    warn "Lighthouse skipped (Chrome/Chromium unavailable in this environment)"
  fi
else
  warn "npx not available — skip Lighthouse"
fi

echo ""
echo "6. Google Search Console (manual)"
echo "  → https://search.google.com/search-console"
echo "  → Add property: $BASE"
echo "  → Verify via DNS TXT or HTML file"
echo "  → Submit sitemap: $BASE/sitemap.xml"
echo "  → Rich Results: https://search.google.com/test/rich-results?url=$BASE/"

echo ""
echo "Result: $PASS passed, $FAIL failed, $WARN warnings"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
