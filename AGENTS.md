# OrthoAndSpineTools — Agent memory

## Project boundary (major)

All git and coding stay inside `~/orthoandspinetools-main` only. Do not edit or commit other sites/repos on this host.

## CRITICAL — Analytics data durability

Read before changing analytics, deploy, nginx, systemd, or storage.

### 1. Persistence location (this site)

This stack stores analytics in **PostgreSQL**, not `analytics.json`.

| What | Where |
|------|--------|
| Live data | Docker volume `orthoandspinetools-main_postgres_data` → `/var/lib/docker/volumes/.../_data` |
| Tables | `analytics_page_views` (humans) · `analytics_bot*` (bots/agents) · `analytics_bot_state` (log cursor) |
| Outside git / static deploy | **Yes** — never under `dist/`, `public/`, or a path `rsync --delete` syncs |
| Bot log path | Host `nginx/logs/access.log` (compose mount); cursor in DB, not the repo |

Code deploys, `git pull`, `npm`/`docker` builds, and rsync must **never** delete or overwrite the Postgres volume or analytics dump backups.

### 2. Before any analytics / deploy change

1. Locate live store (Postgres volume) and latest analytics dump; note **size + mtime + sha256** of `analytics-latest.sql.gz`.
2. Confirm deploy only rebuilds containers/assets — it does **not** wipe `postgres_data`.
3. Confirm `bot-analytics` restart reuses `analytics_bot_state.backfilled_at` (no full re-ingest).
4. One-shot nginx backfill is gated by `analytics_bot_state.backfilled_at` — restarts must not re-ingest from zero or double-count.

```bash
./scripts/analytics-durability-report.sh
# optional fingerprint before risk:
sha256sum /mnt/HC_Volume_106016238/orthoandspinetools-backups/analytics/analytics-latest.sql.gz
```

### 3. Writes must be safe

- Prefer transactional upserts (Prisma); dump backups use **write `.tmp` then `mv`**.
- Never truncate / reset / “re-init empty” analytics tables on startup if data exists.
- Never commit analytics dumps, DB dumps with secrets, or live DB files into git (`backups/` is gitignored).

### 4. Backups (required)

| Item | Value |
|------|--------|
| Script | `scripts/analytics-backup.sh` |
| Install cron | `scripts/install-analytics-backup-cron.sh` → daily **02:15** |
| Primary path | `/mnt/HC_Volume_106016238/orthoandspinetools-backups/analytics/` |
| Files | `analytics_YYYYMMDD_HHMMSS.sql.gz` + `analytics-latest.sql.gz` |
| Retention | ≥30 days |
| Full DB | Existing `database-backup-cron.sh` at 02:00 (includes analytics tables) |

Run one analytics backup **immediately before** risky migrations.

### 5. Accuracy / semantics (do not “fix” by wiping)

- **Humans** = JS beacon → `POST /api/analytics/pageview` (only since beacon shipped — do not invent historical humans).
- **Bots/agents** = nginx access-log ingest via `bot-analytics` (scanners excluded from headline totals).
- Bot UAs hitting `/pageview` record as bots only — never inflate human counts.
- **AI referrals** (human referrer/UTM) stay separate from bot tallies if/when added.
- Days are **UTC** — do not change timezone without an explicit migration plan.

### 6. Forbidden without explicit user approval

- Deleting, truncating, or replacing analytics tables / related dumps
- Re-running full log backfill that would reset or duplicate counters (e.g. clearing `analytics_bot_state`)
- Moving the data path without copying old → new and verifying stats
- Putting analytics storage under a path cleaned by deploy `--delete`
- `docker compose down -v` (deletes the DB volume)

### 7. After any analytics-related change, report

- Data path (Postgres volume), backup path, whether restart preserved cursor/`backfilled_at`
- Headline counts: `viewsToday` / `views7d` / `bots.hits7d` (via `./scripts/analytics-durability-report.sh`)

## Ops reminders

- After every `backend`/`frontend` recreate: `docker compose -f docker-compose.prod.yml up -d --force-recreate nginx`
- Canonical checklist: `TODO.md`
