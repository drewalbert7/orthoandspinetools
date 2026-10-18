#!/bin/bash
# Proves .env files never reach a docker build context (backend and frontend).
#   1. Static: every compose build context has a .dockerignore that excludes .env and .env.*.
#   2. Real build: plant dummy .env, .env.production and nested src/.env files in each context, build a
#      throwaway image that copies the WHOLE context (COPY . /ctx, same as the app Dockerfiles), and fail
#      if any .env file is inside. Planted files are removed on exit; nothing real is read.
# Usage: bash scripts/tests/dockerignore-env.test.sh   (needs docker; DOCKER="sudo docker" on the box)
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOCKER="${DOCKER:-docker}"
FAILS=0
pass() { echo "  PASS: $*"; }
fail() { echo "  FAIL: $*"; FAILS=$((FAILS + 1)); }

mapfile -t CONTEXTS < <(grep -hE '^[[:space:]]+context:' "$REPO_ROOT"/docker-compose*.yml | awk '{print $2}' | sed 's#^\./##' | sort -u)
[ "${#CONTEXTS[@]}" -gt 0 ] || { echo "no build contexts found"; exit 1; }

echo "== 1: .dockerignore in every build context (${CONTEXTS[*]}) =="
for c in "${CONTEXTS[@]}"; do
    f="$REPO_ROOT/$c/.dockerignore"
    if [ -f "$f" ] && grep -qxF '.env' "$f" && grep -qxF '.env.*' "$f"; then pass "$c/.dockerignore excludes .env and .env.*"; else fail "$c/.dockerignore missing or does not exclude .env/.env.*"; fi
done

echo ""
echo "== 2: real build context with planted env files =="
PLANTED=()
cleanup() { for p in "${PLANTED[@]}"; do rm -f -- "$p"; done; for c in "${CONTEXTS[@]}"; do rmdir "$REPO_ROOT/$c/.envtest-nested" 2>/dev/null || true; done; }
trap cleanup EXIT
for c in "${CONTEXTS[@]}"; do
    ctx="$REPO_ROOT/$c"
    mkdir -p "$ctx/.envtest-nested"
    for p in "$ctx/.env" "$ctx/.env.production" "$ctx/.envtest-nested/.env"; do
        if [ -e "$p" ]; then continue; fi   # never overwrite a real file
        echo "DUMMY_ONLY=planted-by-test" > "$p"; PLANTED+=("$p")
    done
    tag="ost-dockerignore-test:$(echo "$c" | tr -c 'a-z0-9' '-')$$"
    if printf 'FROM busybox:1.36\nCOPY . /ctx\nRUN found="$(find /ctx -name ".env" -o -name ".env.*" | grep -v "^/ctx/node_modules/" || true)"; if [ -n "$found" ]; then echo "env files in context: $found"; exit 1; fi; echo "no env files in context"\n' \
        | $DOCKER build -q --no-cache -t "$tag" -f - "$ctx" > /tmp/dockerignore-test.$$ 2>&1; then
        pass "$c: build context contains no .env files"
    else
        fail "$c: .env files reached the build context"; sed 's/^/    | /' /tmp/dockerignore-test.$$
    fi
    $DOCKER image rm -f "$tag" > /dev/null 2>&1 || true
    rm -f /tmp/dockerignore-test.$$
done

echo ""
if [ "$FAILS" -eq 0 ]; then echo "ALL DOCKERIGNORE ENV TESTS PASSED"; else echo "$FAILS ASSERTION(S) FAILED"; exit 1; fi
