#!/usr/bin/env bash
# Tests for scripts/db-guard/db-guard.py (DB safety audit items 3 and 7).
# Plants each destructive operation in a throwaway git repo and checks that the guard fails with
# the right rule id; checks the allowlist and comment handling; checks the real repo is clean.
#   bash scripts/tests/db-guard.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GUARD="$REPO/scripts/db-guard/db-guard.py"
PASS=0
FAIL=0
ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT

# plant <name> <relative path> <content> <expected rule id or "clean">
plant() {
	local name="$1" rel="$2" content="$3" want="$4" dir out rc
	dir="$TMP/$name"
	mkdir -p "$dir/$(dirname "$rel")"
	printf '%s\n' "$content" >"$dir/$rel"
	git -C "$dir" init -q
	git -C "$dir" add -A
	set +e
	out="$(cd "$dir" && python3 "$GUARD" 2>&1)"
	rc=$?
	set -e
	if [[ "$want" == clean ]]; then
		if [[ $rc -eq 0 ]]; then ok "$name: clean"; else bad "$name: expected clean, got rc=$rc: $out"; fi
	else
		if [[ $rc -eq 1 && "$out" == *": $want: "* ]]; then ok "$name: blocked ($want)"; else bad "$name: expected $want, got rc=$rc: $out"; fi
	fi
}

echo "== real repository is clean"
if (cd "$REPO" && python3 "$GUARD" >/dev/null); then ok "repo scan passes"; else bad "repo scan has findings"; fi

echo "== each destructive operation is blocked"
plant drop-db scripts/x.sh 'psql -c "DROP DATABASE orthoandspinetools"' drop-database
plant dropdb scripts/x.sh 'dropdb -U postgres orthoandspinetools' drop-database
plant drop-schema backend/prisma/migrations/20990101000000_x/migration.sql 'DROP SCHEMA public CASCADE;' drop-schema
plant truncate-sql backend/prisma/migrations/20990101000000_x/migration.sql 'truncate users;' truncate
plant truncate-code scripts/x.sh 'psql -c "TRUNCATE TABLE users"' truncate
plant migrate-reset scripts/x.sh 'npx prisma migrate reset --force' prisma-reset
plant force-reset deploy.sh 'npx prisma db push --force-reset' data-loss-flag
plant accept-data-loss .github/workflows/ci.yml '      run: npx prisma db push --accept-data-loss' data-loss-flag
plant down-v docker-compose.prod.yml '# x
command: docker compose -f docker-compose.prod.yml down -v' compose-down-v
plant volume-rm scripts/x.sh 'docker volume rm orthoandspinetools-main_postgres_data' volume-rm-prune
plant volume-prune scripts/x.sh 'docker volume prune -f' volume-rm-prune
plant system-prune ops/x.sh 'docker system prune -af' system-prune
plant rm-pgdata scripts/x.sh 'sudo rm -rf /var/lib/docker/volumes/orthoandspinetools-main_postgres_data' rm-pgdata
plant rm-pgdata2 scripts/x.sh 'rm -fr ./postgres_data' rm-pgdata
plant npm-script backend/package.json '{"scripts":{"db:reset":"prisma migrate reset"}}' prisma-reset

echo "== allowed: comments, file truncation, other dirs"
plant comment scripts/x.sh '# never run docker volume prune or DROP DATABASE here' clean
plant sql-comment backend/prisma/migrations/20990101000000_x/migration.sql '-- no TRUNCATE in this migration
SELECT 1;' clean
plant file-truncate scripts/x.sh 'truncate -s 0 nginx/logs/access.log' clean
plant out-of-scope frontend/src/x.tsx '<span className="truncate">DROP DATABASE</span>' clean
plant builder-prune deploy.sh 'docker builder prune -f' clean

echo "== allowlist is path and rule specific"
plant wrapper-ok scripts/docker-safety-wrapper.sh '    command docker volume rm "$@"' clean
plant wrapper-other-rule scripts/docker-safety-wrapper.sh 'psql -c "DROP DATABASE x"' drop-database
plant workflow-other .github/workflows/other.yml '      run: npx prisma db push --accept-data-loss' data-loss-flag

echo "== a malformed allowlist line fails closed"
cp "$REPO/scripts/db-guard/allowlist.txt" "$TMP/allow-bad.txt"
printf 'scripts/x.sh | volume-rm-prune\n' >>"$TMP/allow-bad.txt"
set +e
(cd "$REPO" && DB_GUARD_ALLOWLIST="$TMP/allow-bad.txt" python3 "$GUARD" >/dev/null 2>&1)
rc=$?
set -e
if [[ $rc -eq 2 ]]; then ok "malformed allowlist exits 2"; else bad "malformed allowlist rc=$rc"; fi

echo ""
echo "db-guard tests: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
