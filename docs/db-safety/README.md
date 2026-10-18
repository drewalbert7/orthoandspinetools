# OST database safety

- `RUNBOOK.md`: how to apply this on production, in order, with verification and rollback.
- `r2-immutability-and-lifecycle.md`: offsite bucket, prefixes, lifecycle and bucket-lock rules, tokens.
- `docker-group.md`: removing dstrad from the docker group (phase A/B), cron inventory, sudoers.
- Rule for agents: `.cursor/rules/db-safety.mdc` and the "Database safety" section of `AGENTS.md`.

## What is where
| Area | Files |
|---|---|
| Least privilege | `scripts/db/roles.sql` (ost_app DML only, ost_migrator owns the schema, ost_backup read-only, ost_guard), `verify.sql`, `rollback.sql`, `pg_hba-additions.conf`, compose `DATABASE_URL` -> ost_app |
| Volume | compose `postgres_data` external; `docker-disk-check.sh` never prunes volumes |
| Deploy | `deploy.sh`: verified snapshot (`scripts/predeploy-db-snapshot.sh`) before the build, `prisma migrate deploy` as ost_migrator (`scripts/db-migrate.sh` via `/usr/local/sbin/ost-db-migrate`) before the switch, disk guard 5G free and below 90% used |
| Backups | `scripts/backup/ost-db-backup.sh` (pg_dump -Fc as ost_backup, gpg to the fleet public key, `rclone copy --immutable`, download compare), systemd units in `ops/systemd/` |
| PITR | `scripts/db/ost-archive-wal.sh` (archive_command), `scripts/backup/ost-wal-ship.sh`, `scripts/backup/ost-basebackup.sh` |
| Guards | `scripts/db-guard/` (CI workflow `db-guard.yml` + pre-commit), DB-side `ost_guard` event triggers |
| Restore test | `scripts/db/restore-test.sh` (box and CI) |

## PITR choice: plain archive_command + host shipper (not wal-g or pgBackRest)
- No image change: stock postgres:15-alpine plus one bind-mounted script. wal-g release binaries are glibc
  builds (alpine is musl); pgBackRest must run inside the container at the same version on both sides.
- No secret in the DB container and an encrypt-only server: encryption uses the fleet public key on the host,
  like every other fleet backup. pgBackRest repo encryption is symmetric (the passphrase would sit on the server);
  wal-g PGP would need the key and the R2 token inside the container.
- No deletes by tooling: retention is R2 lifecycle only (pgBackRest `expire` and wal-g `delete` delete).
- RPO about 7 minutes worst case (`archive_timeout` 300 s + 2 min ship interval). Trade-off: restore is a script,
  tested end to end by the Security Officer.

## Open questions
1. Dedicated private `ost-backups` bucket with its own bucket-scoped writer token (recommended) vs OST prefixes
   in the shared fleet backup bucket (the script default).
2. Pinned rclone on OST: which release, installed and checksummed by whom.
3. Which dstrad crons call docker: answered in `docker-group.md` (five do). Decide root timers vs cron.d.
4. bot-analytics: give it its own role (it only needs its `analytics_*` tables) instead of sharing ost_app?
5. CI uses `prisma db push` because the migration history is not replayable from zero. Move CI to
   `prisma migrate deploy` once the migration drift is fixed (one applied migration is not in the repo).

## Findings (fixed by this PR unless noted)
- `POSTGRES_PASSWORD` reached the backend and bot-analytics containers through `env_file: .env`: now blanked there.
- Local plaintext dumps were 664 in a 755 directory: the dump scripts now use umask 077 and a 700 directory
  (existing files on the host still need a one-time `chmod 600`; not done, nothing applied).
- An unused host-native PostgreSQL 16 listens on 127.0.0.1:5432 (empty, loopback only): not touched; decide
  whether to disable it.
- The compose file had a weak fallback superuser password: removed; compose now refuses to start without one.
