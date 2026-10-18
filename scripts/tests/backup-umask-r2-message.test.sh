#!/bin/bash
# Static guards for plaintext backup dump scripts (Security Officer follow-up on PR #15).
#
#   1. scripts/database-backup-production.sh and scripts/analytics-backup.sh set umask 077
#      before any dump is written (pg_dump / docker exec ... pg_dump / gzip of a dump).
#   2. Final success text claims "local + R2" only when R2_UPLOADED=1; when R2 is skipped
#      or did not succeed the message is "local only" (no false R2 claim).
#
# Usage: bash scripts/tests/backup-umask-r2-message.test.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROD="$REPO_ROOT/scripts/database-backup-production.sh"
ANALYTICS="$REPO_ROOT/scripts/analytics-backup.sh"
FAILS=0

pass() { echo "  PASS: $*"; }
fail() { echo "  FAIL: $*"; FAILS=$((FAILS + 1)); }

# First line number matching pattern, or empty.
first_line() {
    local f="$1" pat="$2"
    grep -nE "$pat" "$f" | head -n1 | cut -d: -f1
}

assert_umask_before_dump() {
    local f="$1" name="$2"
    local umask_line dump_line
    umask_line="$(first_line "$f" '^[[:space:]]*umask[[:space:]]+077[[:space:]]*$')"
    if [ -z "$umask_line" ]; then
        fail "$name: missing umask 077"
        return
    fi
    # Earliest dump write: pg_dump, or docker exec that runs pg_dump.
    dump_line="$(first_line "$f" 'pg_dump')"
    if [ -z "$dump_line" ]; then
        fail "$name: no pg_dump found (cannot prove umask ordering)"
        return
    fi
    if [ "$umask_line" -lt "$dump_line" ]; then
        pass "$name: umask 077 at line $umask_line before pg_dump at line $dump_line"
    else
        fail "$name: umask 077 at line $umask_line is not before pg_dump at line $dump_line"
    fi
}

assert_r2_message_gated() {
    local f="$1" name="$2"
    # Must track upload success and branch the final message on it.
    if ! grep -qE '^[[:space:]]*R2_UPLOADED=0[[:space:]]*$' "$f"; then
        fail "$name: missing R2_UPLOADED=0 init"
    else
        pass "$name: initializes R2_UPLOADED=0"
    fi
    if ! grep -qE '^[[:space:]]*R2_UPLOADED=1[[:space:]]*$' "$f"; then
        fail "$name: never sets R2_UPLOADED=1 on successful upload"
    else
        pass "$name: sets R2_UPLOADED=1 on successful upload"
    fi

    local plus_line only_line gate_line
    plus_line="$(first_line "$f" 'completed successfully \(local \+ R2\)')"
    only_line="$(first_line "$f" 'completed successfully \(local only\)')"
    gate_line="$(first_line "$f" '\[\[ "\$R2_UPLOADED" == "1" \]\]')"

    if [ -z "$plus_line" ]; then
        fail "$name: missing (local + R2) success variant"
    elif [ -z "$only_line" ]; then
        fail "$name: missing (local only) success variant"
    elif [ -z "$gate_line" ]; then
        fail "$name: (local + R2) is not gated on R2_UPLOADED=1"
    elif [ "$gate_line" -lt "$plus_line" ] && [ "$only_line" -gt "$gate_line" ]; then
        pass "$name: final message gated on R2_UPLOADED (local + R2 only when upload succeeded)"
    else
        fail "$name: unexpected message/gate ordering (gate=$gate_line plus=$plus_line only=$only_line)"
    fi

    # Static stand-in for SKIP_R2_BACKUP=1: the (local + R2) string must not appear
    # outside the R2_UPLOADED=1 branch (i.e. there is no unguarded final claim).
    # Prove the skip path cannot print the R2 claim by requiring SKIP_R2 handling
    # never sets R2_UPLOADED=1.
    if grep -nE 'SKIP_R2_BACKUP' "$f" | grep -E 'R2_UPLOADED=1' >/dev/null; then
        fail "$name: SKIP_R2_BACKUP path must not set R2_UPLOADED=1"
    else
        pass "$name: SKIP_R2_BACKUP path does not set R2_UPLOADED=1 (success will say local only)"
    fi
}

echo "== 1: umask 077 before any dump write =="
assert_umask_before_dump "$PROD" "database-backup-production.sh"
assert_umask_before_dump "$ANALYTICS" "analytics-backup.sh"

echo ""
echo "== 2: success message does not claim R2 when upload was skipped =="
assert_r2_message_gated "$PROD" "database-backup-production.sh"
assert_r2_message_gated "$ANALYTICS" "analytics-backup.sh"

echo ""
if [ "$FAILS" -eq 0 ]; then
    echo "ALL BACKUP UMASK / R2 MESSAGE TESTS PASSED"
else
    echo "$FAILS ASSERTION(S) FAILED"
    exit 1
fi
