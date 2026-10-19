#!/bin/bash
# M4: JWT_SECRET must fail closed in compose and backend (no placeholder fallbacks).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAILS=0
pass() { echo "  PASS: $*"; }
fail() { echo "  FAIL: $*"; FAILS=$((FAILS + 1)); }

echo "== 1: compose uses \${JWT_SECRET:?...} (no placeholder default) =="
for f in docker-compose.prod.yml docker-compose.yml docker-compose.ssl.yml; do
  if grep -qE 'JWT_SECRET: \$\{JWT_SECRET:\?JWT_SECRET must be set in \.env\}' "$REPO_ROOT/$f"; then
    pass "$f fail-closed"
  else
    fail "$f missing JWT_SECRET :? fail-closed"
  fi
  if grep -E 'JWT_SECRET:' "$REPO_ROOT/$f" | grep -E ':-|your-super-secret|changeme|fallback'; then
    fail "$f still has a JWT placeholder/default"
  else
    pass "$f no JWT placeholder"
  fi
done

echo ""
echo "== 2: backend has no fallback-secret / changeme JWT fallbacks =="
if grep -RInE "JWT_SECRET \|\| ['\"]fallback-secret['\"]|JWT_SECRET \|\| ['\"]changeme['\"]" "$REPO_ROOT/backend/src" 2>/dev/null; then
  fail "backend still has JWT_SECRET placeholder fallbacks"
else
  pass "no JWT_SECRET || fallback-secret/changeme in backend/src"
fi
grep -q "validateJwtSecretAtStartup" "$REPO_ROOT/backend/src/index.ts" && pass "index.ts calls validateJwtSecretAtStartup" || fail "missing startup check"
grep -q "getJwtSecret" "$REPO_ROOT/backend/src/routes/auth.ts" && pass "auth.ts uses getJwtSecret" || fail "auth.ts missing getJwtSecret"
grep -q "length < 32\|MIN_JWT_SECRET_LENGTH = 32\|at least 32" "$REPO_ROOT/backend/src/lib/jwtSecret.ts" && pass "jwtSecret enforces min length 32" || fail "missing min length 32"

echo ""
if [ "$FAILS" -eq 0 ]; then echo "ALL JWT SECRET FAIL-CLOSED TESTS PASSED"; else echo "$FAILS ASSERTION(S) FAILED"; exit 1; fi
