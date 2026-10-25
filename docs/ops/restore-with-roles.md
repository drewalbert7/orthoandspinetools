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
5. Reject empty or cut dumps before trusting any count: plain dumps must end with the
   `-- PostgreSQL database dump complete` trailer (roles: `cluster dump complete`), gzip must read
   cleanly, a custom dump's TOC must be readable and list at least `--min-tables` TABLE DATA entries.
6. Compare row counts per table with the dump's own COPY sections (exact; this only proves the
   restore matches the file). To catch a dump that is complete but stale or short, the script also
   requires at least `--min-tables` tables (default 39) and, with `--expect-counts FILE`
   (`schema.table|rows` per line), an exact match against counts taken separately, for example a
   read-only `SELECT count(*)` on prod at dump time. The script itself never connects to prod.

`scripts/db/restore-scratch.sh` does all of this (docker `--network none`, tmpfs, `--pull never`, no
ports, no volumes; or `PG_BIN=` for a local socket-only cluster, where any psql meta-command line
other than `\restrict`/`\unrestrict` in the dump or roles file is refused). On failure it prints only
the `ERROR:` phrase, never raw psql output or row data. `scripts/database-backup-production.sh`
now also writes `roles/roles_<stamp>.sql.gz` (chmod 600, no passwords) next to each daily dump. It is in
a `roles/` subdir so it never matches the `backup_*.sql.gz` glob. If the roles dump fails, the data dump
is still uploaded to R2 first and the job then exits nonzero.

## Follow-ups for Security Officer (SEC owns these files; nothing here is applied)
- fleetmon `restore_pg_docker`: SEC has a ready diff (apply the newest `roles/roles_*.sql.gz` at or
  before the dump, or `<BASE>.roles.sql.gpg` for R2, before the load; disable `ost_guard%` event
  triggers in the throwaway for the analytics partial test). Until it is applied the Sunday test keeps
  failing.
- `ost-db-backup.sh` exists only on the PR #15 branch (`scripts/backup/ost-db-backup.sh`, installed
  from 7a7aac6); it is not on main or in this PR, so it is not changed here. Needed there: upload a
  gpg-encrypted `<BASE>.roles.sql.gpg` (same recipient as the dump, from
  `pg_dumpall --roles-only --no-role-passwords`) next to each dump and list it in `SHA256SUMS`.
- Until then, `scripts/db/roles.sql` (PR #15) with passwords removed is an equivalent roles source.
