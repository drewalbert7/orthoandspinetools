# R2: immutability, lifecycle, tokens (audit item 0, OST part)

Dashboard work (Cloudflare, R2). Nothing here is applied; Drew picks lock lengths, SEC applies.
Check the current Cloudflare R2 docs when applying: R2 calls bucket-level object lock "Bucket locks"
(prefix-scoped retention rules) and expiry "Object lifecycle rules". R2 has no S3-style versioning.

## 1. Bucket for OST backups
Recommended: a **dedicated private bucket `ost-backups`** (no public r2.dev, no custom domain).
Fallback (what the scripts default to, per the brief): `drewalbertmd-backups` with OST prefixes. The
downside: an R2 token is scoped per bucket, so the OST host's token could also overwrite or delete DAMD/PF
backups in that bucket (only the bucket lock limits it). Set `OST_BACKUP_BUCKET=ost-backups` in
/etc/ost-backup/ost-db-backup.env if Drew approves the dedicated bucket.

## 2. Prefixes written by the OST scripts (all copy-only, `--immutable`, dated, never deleted by scripts)
| Prefix | Writer | Content | Lifecycle (expire) | Bucket lock (retain) |
|---|---|---|---|---|
| `ost-db/YYYY-MM-DD/` | ost-db-backup.sh daily | `.dump.gpg`, `.manifest.tsv.gpg`, `.SHA256SUMS` | 30 d | 14 d |
| `ost-db-weekly/YYYY-MM-DD/` | same, Sundays | same | 84 d | 28 d |
| `ost-db-monthly/YYYY-MM/` | same, 1st of month | same | 365 d | 90 d |
| `ost-base/YYYY-MM-DD/` | ost-basebackup.sh daily | base `.tar.gz.gpg` | 35 d | 14 d |
| `ost-wal/` | ost-wal-ship.sh every 2 min | WAL `.gpg` | 35 d | 14 d |

Rules: lock period ≤ expiry. PITR window = WAL/base expiry minus one day (≈34 d), so keep `ost-wal/` and
`ost-base/` expiry equal. Prefixes don't overlap (`ost-db/` does not match `ost-db-weekly/`).
Expected size: dumps ~0.2 MB/day; base ~4-20 MB/day; WAL depends on write volume (switched segments
compress well; estimate tens of MB/day). Well under 10 GB total at these retentions.

## 3. Tokens
- New R2 API token **"ost-backup-writer"**: Object Read & Write, **only** the backup bucket. Lives in
  /etc/ost-backup/rclone.conf (root 600) on OST. Read is needed for `rclone check --download`.
- R2 offers no write-without-delete permission, so the bucket lock is what makes copies undeletable.
- The backend's existing R2 key (R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY in .env, injected into the
  internet-facing backend + bot-analytics containers) must lose all access to backups: once backups live
  only in the new bucket, scope that key to the media bucket only and rotate it.
- Box side (restore tests): a separate **read-only** token for the backup bucket (remote `osj-r2` or a new
  `ost-r2-ro` on the box). The fleet private key never leaves the box.

## 4. The site media bucket
Backups never go to the site media bucket. `backup-to-r2.js` (the old offsite leg) no longer prunes and
refuses anything that is not a `.gpg` file, and every cron caller now runs with `SKIP_R2_BACKUP=1`.
Retiring the old `backups/` prefix is handled separately by the Security Officer (it is a delete, so it
needs Drew's OK).
