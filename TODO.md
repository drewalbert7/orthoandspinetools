# OrthoAndSpineTools Medical Platform - Development Progress & TODO

| Section | Purpose |
|--------|---------|
| **NEXT UP — START HERE** | Deploy facts, QA checklist, backlog — **canonical source of truth** |
| **NEXT PRIORITIES (summary)** | Short roadmap; **NEXT UP wins** if they disagree |
| **CODING AGENT INSTRUCTIONS** | Onboarding for contributors and agents |
| **OPS QUICK REFERENCE** | Database, SSL, Docker disk, scripts |
| **Archive** | Full history → `CHANGELOG.md` |

## 🔥 **NEXT UP — START HERE** (updated Jun 14, 2026)

### **Pick up here (step-by-step)**

| Step | Task | Status |
|------|------|--------|
| **1** | **Disk maintenance** | ✅ Cron + `docker-disk-check.sh`; ~68% used, ~12 GB free |
| **2** | **Daily DB backups** | ✅ Cron `0 2 * * *` → `database-backup-cron.sh` (7-day retention) |
| **3** | **SES SNS webhook** | ⏳ Optional — `AWS_SES_SNS_TOPIC_ARN` missing; SES production access confirmed; transactional email works |
| **4** | **Physician NPI verification** | ✅ U.S. NPI via CMS registry; intl. manual review; admin pending filter |
| **5** | **Legal pages (NPI wording)** | ✅ Privacy + Terms updated for NPI collection and verification |
| **6** | **Logged-in Production QA** | ⏳ Manual — US NPI signup, intl. pending queue, email verify flows |
| **7** | **SSL auto-renewal cron** | ✅ `0 3 1 * *` → `ssl-renew-cron.sh` |
| **8** | **SEO / LLM / OG** | ✅ Hub meta + JSON-LD, `llms-full.txt`, sitemap users, `seo-audit.sh` |
| **9** | **Link preview cards** | ✅ Server-side OG for posts, communities, profiles, home + hubs |
| **10** | **Google Search Console** | ✅ Domain verified; sitemap submitted |
| **11** | **Scaling prep** | ✅ Feed query DB indexes deployed; backups automated |

**Ongoing disk habit:** `./scripts/docker-disk-check.sh report` before `--no-cache` builds.

### **Goals**
- [x] **Brand copy** — Tagline **"Ortho and Spine Tools - Hunt for the Best"** across SEO, `index.html`, register, `llms.txt`.
- [x] **Link previews** — Server-side OG for `/post/:id`, `/community/:slug`, `/user/:username`, `/`, `/cases`, `/startups`, `/popular`; nginx `serve_og_preview` map (bots + iMessage); `index.html` default OG/Twitter meta.
- [x] **Cases** — `/cases`, `tagName=Case`, backfill script.
- [x] **Dynamic sitemap** — posts, communities, public user profiles.
- [x] **LLM citing** — `llms.txt`, dynamic `llms-full.txt`, expanded `robots.txt`.
- [x] **Hub SEO** — DocumentMeta + JSON-LD on Cases, Popular, Startups, Search; Person schema on profiles.
- [x] **Real data** — Community moderators/rules, public user profiles, post sidebar join state.
- [x] **Production QA smoke** — `./scripts/production-qa-smoke.sh` (**30/30** incl. `/privacy`, `/terms`).
- [x] **Physician NPI verification** — U.S. CMS registry at signup; international `physicianVerificationPending`; admin verify clears pending.
- [x] **Legal NPI wording** — Privacy Policy + Terms of Service describe NPI collection, CMS lookup, and manual intl. review.
- [x] **Admin pending physician filter** — Admin → Users → **Pending intl. review** (`physicianVerificationPending=true`).
- [x] **Daily DB backups** — `0 2 * * *` → `scripts/database-backup-cron.sh` (7-day retention in `backups/`).
- [x] **Feed query indexes** — `posts`, `comments`, `post_votes`, `post_tags` indexes for home/community/profile feeds.
- [ ] **Amazon SES — follow-ups** — SNS topic ARN + `/api/ses/events`; optional suppression Admin UI.
- [x] **Google Search Console** — Domain verified; sitemap submitted (`/sitemap.xml`).
- [ ] **Optional** — Rich Results Test on home + `/post/:id`; dedicated 1200×630 `og-share.png` for richer homepage/hub cards.

### **0. Deploy status — verify live**
- [x] **https://orthoandspinetools.com** — home, hubs, sitemap, llms-full, OG previews
- [ ] After **every** frontend/nginx recreate: `--force-recreate nginx` if needed (stale upstream → 502)
- [ ] Run **`./scripts/production-qa-smoke.sh`** after deploys
- [ ] Run **`./scripts/seo-audit.sh`** after SEO changes (optional Lighthouse)

### **1. Deploy (production server)**

| Item | Value |
|------|--------|
| Server | `dstrad@orthoandspinetools` (SSH) |
| Disk | `/dev/sda1` **38G** — **~60%**, ~15 GB free |
| Repo | `~/orthoandspinetools-main` |
| Compose | `docker-compose.prod.yml` |
| Containers | `orthoandspinetools-{postgres,backend,frontend,nginx}` |
| Secrets | `.env`, `.env.cloudinary` (never commit); SES vars on server only |
| SSL renew | ✅ Cron active: `0 3 1 * *` → `scripts/ssl-renew-cron.sh` |
| Disk cleanup | ✅ Cron active: `0 4 1 * *` → `scripts/docker-disk-check.sh cleanup` |

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
6. **Physician signup QA** — U.S. NPI path, international pending path, admin manual verify
7. **Password reset** — `/forgot-password` → inbox (SES production access confirmed)

### **3. Backlog**
- **Scaling** — VPS RAM/disk upgrade before ~5k users; Redis for multi-replica rate limits; managed Postgres later
- **Link previews** — Optional branded `og-share.png` (1200×630)
- **Disk / ops** — Off-server backup copy (S3/rsync); review 38G VPS sizing
- **SEO** — Lighthouse / Rich Results; confirm `VITE_SITE_URL` / `PUBLIC_SITE_URL` in prod builds
- **Admin** — SES suppression UI; email alert on intl. physician signup (optional)
- **Content** — More real specialty posts
- **Post media (WIP)** — Re-test create-post upload if needed; existing posts display images OK
- **Notifications** — Vote/mention/moderation triggers (v1 comment/reply shipped)

**Live snapshot (Jun 14, 2026):** 3 posts, 4 users, 11 communities · smoke **30/30** · NPI verification deployed · legal pages live

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

1. **Content** — More real specialty posts (GSC is live; indexing follows content)
2. **Manual QA** — Physician NPI signup, intl. pending queue, email verification
3. **SES SNS** — Optional webhook for bounces/complaints (`docs/SES_AWS_SETUP.md`)
4. **Scaling** — Off-server backup copy, monitoring/uptime alerts, VPS upgrade when traffic grows
5. **Optional** — `og-share.png` (1200×630) for richer homepage/hub link previews

---

## 🛠️ **OPS QUICK REFERENCE**

```bash
./scripts/docker-disk-check.sh report    # disk + Docker usage
./scripts/docker-disk-check.sh cleanup   # safe post-build cleanup
./scripts/production-qa-smoke.sh         # post-deploy smoke tests
./scripts/seo-audit.sh                 # SEO + OG curl checks; optional Lighthouse
./scripts/ses-webhook-status.sh          # SES/SNS env check
./scripts/quick-restart.sh               # safe restart (never docker compose down)
./scripts/database-backup-production.sh    # manual DB backup
./scripts/database-backup-cron.sh          # cron entrypoint (daily 02:00)
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

### **Session log (Jun 14, 2026 — evening)**

| Done | Detail |
|------|--------|
| NPI legal copy | Privacy + Terms: NPI collection, CMS lookup, intl. manual review, badge meaning |
| Admin filter | Users tab: **Pending intl. review** filter via `physicianVerificationPending` API param |
| NPI verification | Deployed (`46482b5`): migration, register flow, admin badges, `/api/auth/npi-check` |
| Legal pages | `/privacy`, `/terms`, register consent checkbox, sitemap + smoke tests |

### **Session log (Jun 14, 2026)**

| Done | Detail |
|------|--------|
| Link previews | Server-side OG for posts, communities, users, home + hubs; Sec-Fetch + bot detection (iMessage, X, SMS) |
| OG polish | 1200×630 Cloudinary crops, shorter card descriptions, `index.html` default meta |
| GSC DNS | Google verification TXT on Namecheap `@` — awaiting propagation |
| GSC live | Domain verified; sitemap submitted |
| Scaling prep | Daily DB backup cron; feed query indexes migration |
| QA | Smoke tests **28/28** |

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

**Last Updated:** Jun 14, 2026  
**Status:** 🚀 Live — NPI verification, legal pages, admin pending filter; smoke 30/30  
**You are here:** Manual physician signup QA; content growth; optional SES SNS + og-share.png
