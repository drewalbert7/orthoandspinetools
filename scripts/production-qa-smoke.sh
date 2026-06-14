#!/usr/bin/env bash
# Production QA smoke tests (anonymous + public API). Run after deploy.
# Logged-in flows (create post, notifications, admin delete) still need manual browser QA.
set -euo pipefail

BASE="${BASE_URL:-https://orthoandspinetools.com}"
PASS=0
FAIL=0

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

http_code() { curl -sS -o /dev/null -w "%{http_code}" "$@"; }

echo "Production QA smoke — $BASE"
echo ""

echo "1. Availability"
check "health API" test "$(http_code "$BASE/api/health")" = "200"
check "home page" test "$(http_code "$BASE/")" = "200"
check "cases page" test "$(http_code "$BASE/cases")" = "200"
check "startups page" test "$(http_code "$BASE/startups")" = "200"
check "login page" test "$(http_code "$BASE/login")" = "200"

echo ""
echo "2. Data APIs"
check "posts API" bash -c "curl -sS '$BASE/api/posts?limit=3' | grep -q '\"success\":true'"
check "communities API" bash -c "curl -sS '$BASE/api/communities' | grep -q '\"success\":true'"
check "case-tagged posts" bash -c "curl -sS '$BASE/api/posts?tagName=Case&limit=5' | grep -q '\"posts\"'"

echo ""
echo "3. SEO"
check "robots.txt" test "$(http_code "$BASE/robots.txt")" = "200"
check "llms.txt" test "$(http_code "$BASE/llms.txt")" = "200"
check "llms-full.txt" test "$(http_code "$BASE/llms-full.txt")" = "200"
check "llms-full has communities" bash -c "curl -sS '$BASE/llms-full.txt' | grep -q '/community/'"
check "sitemap.xml" test "$(http_code "$BASE/sitemap.xml")" = "200"
check "sitemap has posts" bash -c "curl -sS '$BASE/sitemap.xml' | grep -q '/post/'"
check "sitemap has communities" bash -c "curl -sS '$BASE/sitemap.xml' | grep -q '/community/'"
check "sitemap has user profiles" bash -c "curl -sS '$BASE/sitemap.xml' | grep -q '/user/'"

POST_ID="$(curl -sS "$BASE/api/posts?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['posts'][0]['id'])" 2>/dev/null || true)"
COMMUNITY_SLUG="$(curl -sS "$BASE/api/communities" | python3 -c "import sys,json; d=json.load(sys.stdin); c=d['data']; print(c[0]['slug'] if c else '')" 2>/dev/null || true)"
USERNAME="$(curl -sS "$BASE/api/posts?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['posts'][0]['author']['username'])" 2>/dev/null || true)"

if [ -n "$POST_ID" ]; then
  check "OG preview post" bash -c "curl -sS -A 'facebookexternalhit/1.1' '$BASE/post/$POST_ID' | grep -q 'og:title'"
else
  echo "  SKIP OG preview post (no posts)"
fi

if [ -n "$COMMUNITY_SLUG" ]; then
  check "OG preview community" bash -c "curl -sS -A 'facebookexternalhit/1.1' '$BASE/community/$COMMUNITY_SLUG' | grep -q 'og:title'"
  check "OG API community" bash -c "curl -sS '$BASE/api/og/community/$COMMUNITY_SLUG' | grep -q 'og:title'"
else
  echo "  SKIP OG preview community (no communities)"
fi

if [ -n "$USERNAME" ]; then
  check "OG preview user" bash -c "curl -sS -A 'facebookexternalhit/1.1' '$BASE/user/$USERNAME' | grep -q 'og:title'"
  check "OG API user" bash -c "curl -sS '$BASE/api/og/user/$USERNAME' | grep -q 'og:title'"
else
  echo "  SKIP OG preview user (no users)"
fi

check "OG preview home" bash -c "curl -sS -A 'Twitterbot/1.0' '$BASE/' | grep -q 'og:title'"
check "OG preview cases" bash -c "curl -sS -A 'Twitterbot/1.0' '$BASE/cases' | grep -q 'og:title'"
if [ -n "$POST_ID" ]; then
  check "OG iMessage-style post" bash -c "curl -sS -A 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' '$BASE/post/$POST_ID' | grep -q 'og:title'"
fi

echo ""
echo "4. Auth endpoints (expected status codes)"
check "login rejects empty body (400)" test "$(http_code -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "{}")" = "400"
check "notifications require auth (401)" test "$(http_code "$BASE/api/notifications/unread-count")" = "401"
check "forgot-password accepts request (200)" test "$(http_code -X POST "$BASE/api/auth/forgot-password" -H "Content-Type: application/json" -d '{"email":"qa-smoke@example.com"}')" = "200"

echo ""
echo "5. SSL"
check "HTTPS responds" curl -sS -o /dev/null --fail "$BASE/api/health"

echo ""
echo "Result: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
