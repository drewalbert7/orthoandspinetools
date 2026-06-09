# OrthoAndSpineTools Medical Platform - Development Progress & TODO

| Section | Purpose |
|--------|---------|
| **NEXT UP — START HERE** | Deploy facts, QA checklist, backlog — **canonical source of truth** |
| **NEXT PRIORITIES (summary)** | Short roadmap; **NEXT UP wins** if they disagree |
| **CODING AGENT INSTRUCTIONS** | Onboarding for contributors and agents |
| **OPS QUICK REFERENCE** | Database, SSL, Docker disk, scripts |
| **Archive** | Full history → `CHANGELOG.md` |

## 🔥 **NEXT UP — START HERE** (updated Jun 8, 2026 — end of session)

### **Pick up here (next session — priority order)**

1. **🟢 Server & disk space (addressed Jun 8, 2026)** — Root had hit **100%** during `--no-cache` builds. **Fix applied:** `./scripts/docker-disk-check.sh cleanup` removed **~1.9 GB** (orphan Docker volumes, build cache, unused images). Disk now **~51% (~18 GB free)** on 38G VPS. **Ongoing:**
   - Run `./scripts/docker-disk-check.sh report` before every `--no-cache` build; `cleanup` if ≥85%
   - Avoid `--no-cache` unless necessary — use plain `build` when only app code changed
   - Optional: monthly cron `0 4 1 * * cd ~/orthoandspinetools-main && ./scripts/docker-disk-check.sh cleanup`
   - Long-term: 38G is tight for frequent full rebuilds; consider larger disk if builds fail again
2. **SES SNS webhook** — `AWS_SES_SNS_TOPIC_ARN` still **missing** on server. `./scripts/ses-webhook-status.sh` → AWS Console steps in `docs/SES_AWS_SETUP.md` §3–5; request production access (leave sandbox).
3. **Logged-in Production QA** — create-post media, notifications bell, admin delete (§2 manual checklist).
4. **Uncommitted local files on server** — not pushed: `CLAUDE.md` (deleted), `docs/WHAT_TO_DO.md`, `docs/architecture.md`, `docs/deployment.md`, `update-ssl-certs.sh`, `scripts/setup-ssl-renewal-cron.sh`, `scripts/ssl-renew-cron.sh` — review, commit or discard next session.

### **Goals**
- [x] **Brand copy** — Tagline **"Ortho and Spine Tools - Hunt for the Best"** across SEO, `index.html`, register, `llms.txt`.
- [x] **Link previews** — `GET /api/og/post/:id` + nginx bot `map` on `/post/:id`.
- [x] **Cases** — `/cases`, `tagName=Case`, backfill script. Prod backfill done Jun 8, 2026 (3 posts).
- [x] **Dynamic sitemap** — `GET /sitemap.xml` from backend; nginx proxy. Deployed Jun 8, 2026.
- [x] **Production QA smoke script** — `./scripts/production-qa-smoke.sh` (18/18 passing after last deploy).
- [x] **Profile UX** — Level and Total points shown as **separate** stats (`Profile.tsx`, commit `24f79da`). Frontend redeployed Jun 8, 2026.
- [ ] **Amazon SES — follow-ups** — SNS topic ARN + `/api/ses/events` subscription; production access; optional suppression Admin UI.
- [ ] **Amazon SES — project isolation** — Dedicated IAM user per project (`scripts/aws-ses-iam-policy.json`).
- [ ] **Ongoing** — Logged-in QA §2; post media create flow if regressions reported.

### **0. Deploy status — verify live**
- [x] `git push` + server pull — `main` at `24f79da` (Jun 8, 2026)
- [x] Backend + nginx — sitemap, Cases backfill, QA scripts (`8543bd4`)
- [x] Frontend — profile Level/Total points split (`24f79da`)
- [ ] After **every** `--no-cache` build: check `df -h /` and run safe Docker cleanup if >85%
- [ ] Run **`./scripts/production-qa-smoke.sh`** after deploys
- [x] **https://orthoandspinetools.com** — home, `/cases` (3 posts), `/profile` 200, dynamic sitemap

### **1. Deploy (production server)**

| Item | Value |
|------|--------|
| Server | `dstrad@orthoandspinetools` (SSH) |
| Disk | `/dev/sda1` **38G** — **~51%** after cleanup (`./scripts/docker-disk-check.sh`); was **100%** during build |
| Repo | `~/orthoandspinetools-main` |
| Compose | `docker-compose.prod.yml` |
| Containers | `orthoandspinetools-{postgres,backend,frontend,nginx}` |
| Secrets | `.env`, `.env.cloudinary` (never commit); SES vars on server only |
| SSL renew | Monthly cron via `./scripts/setup-ssl-renewal-cron.sh setup` (scripts exist locally, not yet committed) |

```bash
cd ~/orthoandspinetools-main
GIT_SSH_COMMAND='ssh -F /dev/null -o StrictHostKeyChecking=accept-new' git pull origin main
docker compose -f docker-compose.prod.yml build --no-cache backend frontend   # watch disk!
docker compose -f docker-compose.prod.yml up -d backend frontend nginx
./scripts/production-qa-smoke.sh
```

**Before/after every deploy:**
```bash
./scripts/docker-disk-check.sh report    # exits 1 if disk ≥85%
./scripts/docker-disk-check.sh cleanup   # safe: dangling images, build cache, unused volumes
```
Never run `docker compose down -v` (deletes production DB volume).

**Migrations:** `docker compose -f docker-compose.prod.yml exec backend npm run db:deploy`

### **2. Production QA (right after deploy)**

**Automated (anonymous):** `./scripts/production-qa-smoke.sh`

**Manual (requires login):**
1. **Home feed** — posts from multiple communities
2. **Create Post** — typing stable; media upload shows on timeline + `/post/:id`
3. **Notifications** — comment/reply → bell; mark read / dismiss
4. **Admin delete** — post menu `...` from Home and PostDetail
5. **Profile** — Level and Total points show as separate rows (header grid + sidebar)
6. **Password reset** — `/forgot-password` → inbox (sandbox: verified addresses only)

### **3. Backlog**
- **Disk / ops** — Document cleanup policy; optional `scripts/docker-disk-check.sh`; review 38G VPS sizing
- **SEO** — Lighthouse / Rich Results; confirm `VITE_SITE_URL` / `PUBLIC_SITE_URL` in prod builds
- **Admin** — Reporting/triage; SES suppression UI
- **Content** — More real specialty posts
- **Post media (WIP)** — Re-test create-post upload if needed; existing posts display images OK
- **Notifications** — Vote/mention/moderation triggers (v1 comment/reply shipped)

**Live snapshot (Jun 8, 2026):** 3 posts, 4 users, 11 communities · SSL expires **Aug 15, 2026** · latest commit **`24f79da`**

---

## 🤖 **CODING AGENT INSTRUCTIONS**

**Before any work:**
1. Read **NEXT UP** above (do not re-ask how production is hosted)
2. Run `df -h /` and `docker system df` on the server — **disk was critical this session**
3. Check `https://orthoandspinetools.com`
4. Run `./scripts/production-qa-smoke.sh` after deploy-affecting changes
5. Update this file when completing major tasks

**Stack:** React/Vite/Tailwind frontend · Node/Express/Prisma/PostgreSQL backend · Docker + nginx + Let's Encrypt

**Do not:** break existing features; commit secrets; run destructive DB ops without approval; **`docker compose down -v`** (deletes DB volume)

**Git push on server** (SSH config has bad options in `~/.ssh/config`):
```bash
GIT_SSH_COMMAND='ssh -F /dev/null -o StrictHostKeyChecking=accept-new' git pull origin main
```

---

## 📋 **NEXT PRIORITIES (summary)**

1. **Disk maintenance** — monthly `docker-disk-check.sh cleanup` cron; avoid unnecessary `--no-cache` builds
2. **SES** — SNS topic ARN + webhook; production access (`docs/SES_AWS_SETUP.md`)
3. **Logged-in QA** — create-post media, notifications, admin flows
4. **Repo hygiene** — commit or discard uncommitted SSL/docs files on server

---

## 🛠️ **OPS QUICK REFERENCE**

```bash
./scripts/docker-disk-check.sh report    # disk + Docker usage
./scripts/docker-disk-check.sh cleanup   # safe post-build cleanup
./scripts/production-qa-smoke.sh         # post-deploy smoke tests
./scripts/ses-webhook-status.sh          # SES/SNS env check
./scripts/quick-restart.sh               # safe restart (never docker compose down)
./scripts/database-backup-production.sh
docker compose -f docker-compose.prod.yml exec backend npm run backfill-case-post-tags
```

**Database password:** `POSTGRES_PASSWORD` in `.env` must match `DATABASE_URL`.

**SSL paths in nginx:** `nginx/ssl/certs/fullchain.pem` + `privkey.pem`

**nginx after config change:** `docker compose -f docker-compose.prod.yml up -d --force-recreate nginx`

---

## 📚 **Archive**

- **Changelog:** `CHANGELOG.md`
- **SES setup:** `docs/SES_AWS_SETUP.md`
- **Database recovery:** `docs/DATABASE_MAINTENANCE.md`, `docs/DATABASE_RECOVERY.md`
- **Production scaling:** `docs/PRODUCTION_SCALING.md`

### **Session log (Jun 8, 2026)**

| Done | Detail |
|------|--------|
| Cases backfill | 3 `case_study` posts tagged; `/cases` populated |
| Dynamic sitemap | Backend route + nginx proxy; 19 URLs |
| QA tooling | `production-qa-smoke.sh`, `ses-webhook-status.sh` |
| TODO trim | Condensed; pushed `8543bd4` |
| Profile UX | Separate Level / Total points; pushed `24f79da`, frontend deployed |
| Disk fix | `docker-disk-check.sh` + volume/build cache prune; **18 GB free**; script added to repo |

---

**Last Updated:** Jun 8, 2026 (end of session)  
**Status:** 🚀 Live at `24f79da` — profile deploy OK; **disk management is next session priority**  
**Next session:** SES SNS webhook → logged-in QA → commit `docker-disk-check.sh` + uncommitted local files
