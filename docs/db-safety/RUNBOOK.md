# OST database safety: apply runbook

Source: the Security Officer's OST DB-hardening kit (2026-10-17). This PR is the repo side of that kit,
plus three extras: migrations before the container switch in `deploy.sh`, a disk guard that counts the
shared build cache (5G free AND below 90% used), and a repo restore test. **Nothing here has been applied to
production.** Every step marked **[RESTART]** needs Drew's OK via CEO and a change window. Every step needs
the OST Operator on the host; Security reviews.

Hard rules while applying: never drop, reset or truncate a database, never prune or remove a docker volume,
never delete a backup or a `pre-deploy-*` image tag. If any step fails, stop and report; do not improvise.

## 0. Before anything
- Deploy and verify PR #14 first (this PR is based on it).
- Confirm the R2 legs are off: dstrad's crontab has `SKIP_R2_BACKUP=1`, and this PR makes it the default in
  `database-backup-cron.sh` and `analytics-backup.sh`. Do not run `scripts/backup-to-r2.js`.
- Take a fresh dump and confirm it: `scripts/database-backup-production.sh` (now writes 600 files in a 700 dir),
  then run the restore test (step 9) against it.

## 1. R2 (Cloudflare dashboard, Security + Drew)
See `r2-immutability-and-lifecycle.md`: create the private backup bucket (recommended: dedicated `ost-backups`),
the bucket-scoped writer token, the lifecycle and bucket-lock rules, and a separate read-only token for the box.

## 2. Host prep (root, no service impact)
1. Install a **pinned** rclone (official release, verify the published checksum). OST has no rclone today.
2. `/etc/ost-backup/` (root 700) with `gnupg/` holding **only** the fleet backup public key (check the fingerprint
   against the Security Officer's record), `rclone.conf` (from `ops/ost-backup/rclone.conf.example`),
   `ost-db-backup.env` (from `ops/ost-backup/ost-db-backup.env.example`), `migrator.env` (600). The scripts refuse
   to run if a secret key is present in that keyring.
3. Directories on the HC volume: `ost-db-backups` (root 700), `ost-predeploy` (dstrad 700),
   `ost-wal-spool/{incoming,ready,shipped}` (uid/gid 70, 700), `ost-wal-outbox` and `ost-base-stage` (root 700).
4. Root-owned copies (never sudo a file dstrad can edit), from the reviewed merge SHA:
   ```
   install -o root -g root -m 0755 scripts/db-migrate.sh            /usr/local/sbin/ost-db-migrate
   install -o root -g root -m 0755 scripts/predeploy-db-snapshot.sh /usr/local/sbin/ost-predeploy-db-snapshot
   install -o root -g root -m 0755 scripts/backup/ost-db-backup.sh  /usr/local/sbin/ost-db-backup
   install -o root -g root -m 0755 scripts/backup/ost-basebackup.sh /usr/local/sbin/ost-basebackup
   install -o root -g root -m 0755 scripts/backup/ost-wal-ship.sh   /usr/local/sbin/ost-wal-ship
   ```
5. Sudoers for the deploy-time migration (new with this PR, `visudo -cf` first):
   `/etc/sudoers.d/ost-migrate`: `dstrad ALL=(root) NOPASSWD: /usr/local/sbin/ost-db-migrate`
   Without it `deploy.sh` stops before the switch with "Migration step failed" (fail-closed).

## 3. Roles (no restart)
1. Generate three passwords with `openssl rand -hex 24` (URL-safe, at least 24 chars, all different). Keep all
   three in a root-only 600 file.
2. Put `OST_APP_DB_PASSWORD=<app pw>` in `.env`. Put
   `MIGRATOR_DATABASE_URL=postgresql://ost_migrator:<pw>@postgres:5432/orthoandspinetools` in
   `/etc/ost-backup/migrator.env` (NOT `.env`: everything in `.env` reaches the app containers via `env_file`).
3. Apply and verify:
   ```
   docker exec -i -e OST_APP_DB_PASSWORD -e OST_MIGRATOR_DB_PASSWORD -e OST_BACKUP_DB_PASSWORD \
     orthoandspinetools-postgres psql -U postgres -d orthoandspinetools -v ON_ERROR_STOP=1 -f - < scripts/db/roles.sql
   docker exec -i orthoandspinetools-postgres psql -U postgres -d orthoandspinetools -v ON_ERROR_STOP=1 -f - < scripts/db/verify.sql
   ```
   Expect "ALL PASS". The app still runs as postgres here and keeps working. From now on DROP/TRUNCATE are
   blocked for everyone without the break-glass (`ost_guard`).

## 4. PITR on (optional, same window as step 5)
Add `PG_ARCHIVE_MODE=on` and `OST_WAL_SPOOL_HOST=/mnt/HC_Volume_106016238/ost-wal-spool` to `.env`, so the single
postgres recreate in step 5 turns archiving on. Enable `ost-wal-ship.timer` **before** step 5.

## 5. Merge and deploy **[RESTART]**
- CI's db-guard needs the `destructive-ok` label once (Drew/CEO only), because this PR edits the CI-only
  `prisma db push` line (it now runs as the superuser, since the app role cannot run DDL).
- `docker volume inspect orthoandspinetools-main_postgres_data` must succeed: the volume is now `external`, so
  compose will not create it (and `down -v` can no longer remove it). It already exists on prod.
- `./deploy.sh --dry-run`, then `./deploy.sh`. Order: phi-guard, disk guard, image tags, **verified snapshot**
  (abort before build), build, **`sudo -n /usr/local/sbin/ost-db-migrate`** (snapshot again, `prisma migrate deploy`
  as ost_migrator, `migrate status`; abort with no switch on failure), switch, checks, rollback on failure.
- Compose **recreates postgres** on this first deploy (command and mounts changed): about 5 to 15 s of DB restart;
  backend and bot-analytics come back as `ost_app`. Alternative: run
  `docker compose -f docker-compose.prod.yml up -d --no-deps postgres` deliberately inside the window first.
- Then append `scripts/db/pg_hba-additions.conf` to the container's pg_hba.conf and `select pg_reload_conf()`
  (reload only, no restart).

## 6. Timers (root)
Install `ops/systemd/*.service|*.timer`, enable `ost-db-backup.timer` and `ost-basebackup.timer` (and
`ost-wal-ship.timer` if step 4 ran). Run each once by hand. After one good week of encrypted backups, remove the
dstrad `database-backup-cron.sh` line.

## 7. docker group
Phase A ships with this PR (backups move to root timers, no volume prune, audit trail). Phase B (remove dstrad
from `docker`) is a separate window: see `docker-group.md`, including the cron inventory.

## 8. Verify
- `verify.sql` ALL PASS. `select usename, count(*) from pg_stat_activity group by 1` shows the app as `ost_app`.
- Site health, `scripts/production-qa-smoke.sh`, then watch backend logs for `permission denied` (a missed grant:
  report it; never switch the app back to postgres silently).
- Guard: `begin; truncate _prisma_migrations; rollback;` as postgres must error with `ost_guard`.
- Backups: `ost-db-backup --check` OK, log shows `verified (download compare)`.
- PITR: `select archived_count, failed_count, last_failed_wal from pg_stat_archiver` (failed_count not climbing),
  `ost-wal-ship --check` OK.
- CI: a throwaway PR that adds `docker volume prune` to a script must fail db-guard.

## 9. Restore tests
- Any plain or custom dump: `scripts/db/restore-test.sh` restores into a throwaway postgres 15.14 container
  (network none, data on tmpfs, removed on exit) and checks table count, per-table row counts against the dump,
  required tables, and migration state. Prod dumps are streamed to it over ssh so they never land on another disk:
  ```
  ssh dstrad@<ost> 'cat <dump>.sql.gz' | DOCKER='sudo docker' scripts/db/restore-test.sh \
    --format plain-gz --min-tables 39 --require-rows implants,_prisma_migrations \
    --migrations backend/prisma/migrations --allow-migration-drift
  ```
  CI runs it on every PR against the seeded CI database.
- Encrypted offsite backups and PITR: the Security Officer's box scripts (`restore-test-box.sh`,
  `restore-pitr-box.sh`), which hold the fleet private key and never touch the OST host. Schedule weekly.

## Rollback
- Roles: revert the compose hunk (DATABASE_URL), recreate backend and bot-analytics, then `scripts/db/rollback.sql`
  (it refuses while any ost_* session is open).
- Compose: `git revert` the PR and `docker compose up -d` (**[RESTART]** of postgres). The data volume is untouched.
- PITR: `PG_ARCHIVE_MODE=off` and recreate postgres (**[RESTART]**), then disable the ship and base timers.
- Timers: `systemctl disable --now ost-*.timer`. Nothing remote needs undoing (all copies are new keys).
- deploy.sh migrate step: `--no-migrate` skips it for one deploy (logged); removing the sudoers line makes every
  deploy stop before the switch.

## Break-glass for an approved destructive change
In the migration.sql: `-- DESTRUCTIVE-OK: <CEO approval ref>` and `SET LOCAL ost.allow_destructive = '<ref>';`,
plus the `destructive-ok` PR label from Drew/CEO. Every override is logged at WARNING with the ref and role.
