# OrthoAndSpineTools Medical Platform - Development Progress & TODO

| Section | Purpose |
|--------|---------|
| **NEXT UP — START HERE** | Deploy facts, QA checklist, backlog — **canonical source of truth** |
| **NEXT PRIORITIES (summary)** | Short roadmap; **NEXT UP wins** if they disagree |
| **CODING AGENT INSTRUCTIONS** | Onboarding for contributors and agents |
| **OPS QUICK REFERENCE** | Database, SSL, scripts |
| **Archive** | Full history → `CHANGELOG.md` |

## 🔥 **NEXT UP — START HERE** (updated Jun 8, 2026)

### **Goals**
- [x] **Brand copy** — Tagline **"Ortho and Spine Tools - Hunt for the Best"** across SEO, `index.html`, register, `llms.txt`.
- [x] **Link previews** — `GET /api/og/post/:id` + nginx bot `map` on `/post/:id`. Smoke: `curl -A 'facebookexternalhit/1.1' https://orthoandspinetools.com/post/<id> | head`.
- [x] **Cases** — `/cases`, `tagName=Case` filter, create-post `mode=case`. **Prod:** `npm run backfill-case-post-tags` for existing `case_study` posts (done Jun 8, 2026 — 3 posts).
- [x] **Share meta (client)** — `DocumentMeta` + `frontend/src/lib/seo.ts`.
- [x] **Amazon SES — password reset** — `forgot-password` / `reset-password` UI + optional SES send. See `docs/SES_AWS_SETUP.md`.
- [x] **Amazon SES — ops (live May 25, 2026)** — Domain verified `us-east-2`; sends working.
- [x] **Dynamic sitemap** — `GET /sitemap.xml` from backend (posts + communities + static pages); nginx proxies to backend. Deployed Jun 8, 2026.
- [x] **Production QA smoke script** — `./scripts/production-qa-smoke.sh` (anonymous + public API checks).
- [ ] **Amazon SES — follow-ups** — Set **`AWS_SES_SNS_TOPIC_ARN`** + HTTPS SNS subscription → `/api/ses/events`. Check: `./scripts/ses-webhook-status.sh`. Request **production access** (leave sandbox). Optional: suppression Admin UI, digest frequency prefs.
- [ ] **Amazon SES — project isolation** — Dedicated IAM user + keys per project (`scripts/aws-ses-iam-policy.json`).
- [ ] **Ongoing** — Full Production QA §2 after deploy (logged-in flows). **Post media** create flow: verify if regressions reported.

### **0. Deploy status — verify live (after each ship)**
- [x] `git push origin main` → on server: `cd ~/orthoandspinetools-main && git pull && docker compose -f docker-compose.prod.yml build --no-cache backend frontend && docker compose -f docker-compose.prod.yml up -d backend frontend nginx` (pushed Jun 8, 2026)
- [ ] If **`nginx/nginx.conf`** only: `docker compose -f docker-compose.prod.yml up -d --force-recreate nginx`
- [ ] **Case tags (if `/cases` empty):** `docker compose -f docker-compose.prod.yml exec backend npm run backfill-case-post-tags`
- [ ] Run **`./scripts/production-qa-smoke.sh`** — must pass
- [x] **https://orthoandspinetools.com** — home, `/cases` (3 posts), posts, communities, `/startups` (Jun 8, 2026)

### **1. Deploy (production server)**

| Item | Value |
|------|--------|
| Server | `dstrad@orthoandspinetools` (SSH) |
| Repo | `~/orthoandspinetools-main` |
| Compose | `docker-compose.prod.yml` |
| Containers | `orthoandspinetools-{postgres,backend,frontend,nginx}` |
| Secrets | `.env`, `.env.cloudinary` (never commit); SES vars on server only |
| SSL renew | Monthly cron via `./scripts/setup-ssl-renewal-cron.sh setup` |

```bash
cd ~/orthoandspinetools-main
git pull origin main
docker compose -f docker-compose.prod.yml build --no-cache backend frontend
docker compose -f docker-compose.prod.yml up -d backend frontend nginx
```

**Migrations:** `docker compose -f docker-compose.prod.yml exec backend npm run db:deploy`

### **2. Production QA (right after deploy)**

**Automated (anonymous):** `./scripts/production-qa-smoke.sh`

**Manual (requires login):**
1. **Home feed** — posts from multiple communities
2. **Create Post** — typing stable; media upload shows on timeline + `/post/:id`
3. **Notifications** — comment/reply → bell; mark read / dismiss
4. **Admin delete** — post menu `...` from Home and PostDetail
5. **SEO** — OG bot curl smoke; `DocumentMeta` title after SPA load
6. **Password reset** — `/forgot-password` → inbox (sandbox: verified addresses only)

### **3. Backlog**
- **SEO** — Re-run Lighthouse / Rich Results; confirm `VITE_SITE_URL` / `PUBLIC_SITE_URL` in prod builds
- **Admin** — Reporting/triage flow; optional post search
- **Content** — More real specialty posts; remove test posts if any appear
- **Post media (WIP)** — Re-test create-post upload if regressions; existing posts display images OK
- **Notifications** — Vote/mention/moderation triggers (v1 comment/reply shipped)

**Live snapshot (Jun 8, 2026):** 3 posts, 4 users, 11 communities · SSL expires **Aug 15, 2026**

---

## 🤖 **CODING AGENT INSTRUCTIONS**

**Before any work:**
1. Read **NEXT UP** above (do not re-ask how production is hosted)
2. Check `https://orthoandspinetools.com`
3. Read relevant code before editing; match existing patterns
4. Run `./scripts/production-qa-smoke.sh` after deploy-affecting changes
5. Update this file when completing major tasks

**Stack:** React/Vite/Tailwind frontend · Node/Express/Prisma/PostgreSQL backend · Docker + nginx + Let's Encrypt

**Do not:** break existing features; commit secrets; run destructive DB ops without approval; `docker compose down -v`

**Key paths:**
- `frontend/src/pages/` — Home, Cases, CreatePost, PostDetail
- `backend/src/routes/` — posts, auth, notifications, sitemap, ogPreview, sesEvents
- `nginx/nginx.conf` — SSL, OG bot rewrite, sitemap proxy
- `docs/SES_AWS_SETUP.md` — SES + SNS webhook setup

---

## 📋 **NEXT PRIORITIES (summary)**

1. **SES** — SNS topic ARN + webhook subscription; production access (AWS Console — see `docs/SES_AWS_SETUP.md`)
2. **Logged-in QA** — create-post media, notifications, admin flows
3. **Content** — grow specialty communities with real posts
4. **Admin** — reporting flow, suppression UI for SES bounces

---

## 🛠️ **OPS QUICK REFERENCE**

```bash
./scripts/production-qa-smoke.sh      # post-deploy smoke tests
./scripts/ses-webhook-status.sh       # SES/SNS env check
./scripts/quick-restart.sh            # safe restart (never docker compose down)
./scripts/database-backup-production.sh
docker compose -f docker-compose.prod.yml exec backend npm run backfill-case-post-tags
docker compose -f docker-compose.prod.yml exec backend npm run backfill-default-tags
```

**Database password:** `POSTGRES_PASSWORD` in `.env` must match `DATABASE_URL`. If mismatch: `ALTER USER postgres WITH PASSWORD '...';` then restart backend.

**SSL paths in nginx:** `nginx/ssl/certs/fullchain.pem` + `privkey.pem` — not `/etc/nginx/ssl/cert.pem`.

**nginx after config change:** `docker compose -f docker-compose.prod.yml up -d --force-recreate nginx`

---

## 📚 **Archive**

Detailed completed work, historical bug fixes, and long checklists were moved out of this file to reduce noise.

- **Changelog:** `CHANGELOG.md`
- **SES setup:** `docs/SES_AWS_SETUP.md`
- **Database recovery:** `docs/DATABASE_MAINTENANCE.md`, `docs/DATABASE_RECOVERY.md`
- **Moderation:** `MODERATION_SYSTEM_IMPLEMENTATION.md`
- **Production scaling:** `docs/PRODUCTION_SCALING.md`

---

**Last Updated:** Jun 8, 2026  
**Status:** 🚀 Live — Cases fixed, dynamic sitemap deployed, QA smoke script passing  
**Next session:** SES SNS webhook (AWS Console) + logged-in QA pass
