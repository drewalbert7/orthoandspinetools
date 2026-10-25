# OST restore: roles first (fix for the 2026-10-25 Sunday restore test failure)

## What failed
fleetmon `restore` (Sun 04:30 ET, on the OST host) loads the newest
`/mnt/HC_Volume_106016238/orthoandspinetools-backups/backup_*.sql.gz` into a throwaway
`postgres:15-alpine` container with `psql -v ON_ERROR_STOP=1`.

- `ost_postgres`: `restore of backup_20261025_020002.sql.gz FAILED: ERROR:  role "ost_migrator" does not exist`
  (without ON_ERROR_STOP the same dump gives 119 errors: 75 x ost_app, 43 x ost_migrator, 1 x ost_backup).
- `ost_analytics`: `could not restore the base dump for the partial-dump test` (it loads the same base dump first).

## Why (evidence)
- `roles.sql` was applied on 2026-10-18 about 7 PM ET (23:00 UTC). Since then 39 tables are
  `OWNER TO ost_migrator` and carry `GRANT ... TO ost_app` / `ost_backup`. pg_dump (plain and -Fc)
  never includes roles, so a fresh cluster has none of them.
- The 10/18 test (08:34 UTC) restored `backup_20261018_020001.sql.gz`, made before roles.sql: every
  owner is `postgres`, no `ost_*` grants, no `ost_guard` schema. It still restores with the old
  procedure. `backup_20261019_003542.sql.gz` (first dump after roles.sql) fails the old procedure
  with the same error. So the 10/18 pass was before the change, not proof the procedure worked later.
- Second issue in the partial analytics test: the base dump now restores the `ost_guard` event
  triggers. In scratch they (a) block the test's `DROP TABLE ... CASCADE` ("ost_guard: dropping table
  ... blocked") and (b) auto-create `ost_guard_no_truncate` on `CREATE TABLE`, which then collides
  with the same trigger inside the analytics dump. The analytics dump itself is fine (`--no-owner
  --no-privileges`, no role references).

## Fixed procedure (scratch only, never prod)
1. Roles: `pg_dumpall --roles-only --no-role-passwords` from the live container (no hashes).
2. New empty cluster (same major, 15). Apply the roles file, skipping `CREATE ROLE postgres;`.
3. Restore with ON_ERROR_STOP (plain) or `pg_restore --exit-on-error` (custom). Owners and GRANTs
   come back exactly; `--no-owner --no-acl` is not needed and would hide permission drift.
4. Partial analytics test: in the scratch DB only, `ALTER EVENT TRIGGER ost_guard_* DISABLE`, drop the
   analytics tables, load the analytics dump, re-enable.
5. Compare row counts per table with the dump's COPY sections (exact) and with live prod (read-only).

`scripts/db/restore-scratch.sh` does all of this (docker `--network none`, tmpfs, `--pull never`, no
ports, no volumes; or `PG_BIN=` for a local socket-only cluster). `scripts/database-backup-production.sh`
now also writes `roles/roles_<stamp>.sql.gz` (chmod 600, no passwords) next to each daily dump. It is in
a `roles/` subdir so it never matches the `backup_*.sql.gz` glob.

## Proposed follow-ups for Security Officer (not applied; SEC owns these files)
- fleetmon `restore_pg_docker`: before `load(base)` / `load(src)`, if a roles file exists
  (`<backup dir>/roles/roles_*.sql.gz`, newest at or before the dump), pipe it (minus
  `CREATE ROLE postgres;`) into the throwaway `postgres` DB with ON_ERROR_STOP. For `base_glob`,
  disable `ost_guard%` event triggers in the throwaway before the DROP and re-enable after the load.
- `ost-db-backup.sh` (PR #15 branch, installed from 7a7aac6): also upload a gpg-encrypted
  `<BASE>.roles.sql.gpg` from `pg_dumpall --roles-only --no-role-passwords` (needs a role that can
  read pg_authid metadata, or run pg_dumpall as `postgres` inside the container), and have
  `restore-test-box.sh` apply it first instead of `--no-owner --no-acl`.
- Until then, `scripts/db/roles.sql` (PR #15) with passwords removed is an equivalent roles source.
