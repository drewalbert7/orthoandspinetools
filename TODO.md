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
| **1** | **Disk maintenance** | ✅ Cron + `docker-disk-check.sh`; ~60% used, ~15 GB free |
| **2** | **SES SNS webhook + prod access** | ⏳ Optional — `AWS_SES_SNS_TOPIC_ARN` missing; password reset email works |
| **3** | **Logged-in Production QA** | ✅ Mostly done — create post, notifications, admin delete, password reset; self-notification on own post is acceptable |
| **4** | **SSL auto-renewal cron** | ✅ `0 3 1 * *` → `ssl-renew-cron.sh` |
| **5** | **SEO / LLM / OG** | ✅ Hub meta + JSON-LD, `llms-full.txt`, sitemap users, `seo-audit.sh` |
| **6** | **Link preview cards (X, iMessage, SMS)** | ✅ Server-side OG for posts, communities, profiles, home + hubs; 1200×630 images; iMessage-style detection |
| **7** | **Google Search Console** | ✅ Domain verified (Namecheap TXT `@`); sitemap submitted at `https://orthoandspinetools.com/sitemap.xml` |

**Ongoing disk habit:** `./scripts/docker-disk-check.sh report` before `--no-cache` builds.

### **Goals**
- [x] **Brand copy** — Tagline **"Ortho and Spine Tools - Hunt for the Best"** across SEO, `index.html`, register, `llms.txt`.
- [x] **Link previews** — Server-side OG for `/post/:id`, `/community/:slug`, `/user/:username`, `/`, `/cases`, `/startups`, `/popular`; nginx `serve_og_preview` map (bots + iMessage); `index.html` default OG/Twitter meta.
- [x] **Cases** — `/cases`, `tagName=Case`, backfill script.
- [x] **Dynamic sitemap** — posts, communities, public user profiles.
- [x] **LLM citing** — `llms.txt`, dynamic `llms-full.txt`, expanded `robots.txt`.
- [x] **Hub SEO** — DocumentMeta + JSON-LD on Cases, Popular, Startups, Search; Person schema on profiles.
- [x] **Real data** — Community moderators/rules, public user profiles, post sidebar join state.
- [x] **Production QA smoke** — `./scripts/production-qa-smoke.sh` (**28/28** after link-preview deploy).
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
6. **Password reset** — `/forgot-password` → inbox (sandbox: verified addresses only)

### **3. Backlog**
- **Link previews** — Optional branded `og-share.png` (1200×630); test cards in X Card Validator after sharing new URLs
- **Disk / ops** — Document cleanup policy; review 38G VPS sizing
- **SEO** — Lighthouse / Rich Results; confirm `VITE_SITE_URL` / `PUBLIC_SITE_URL` in prod builds
- **Admin** — Reporting/triage; SES suppression UI
- **Content** — More real specialty posts
- **Post media (WIP)** — Re-test create-post upload if needed; existing posts display images OK
- **Notifications** — Vote/mention/moderation triggers (v1 comment/reply shipped)

**Live snapshot (Jun 14, 2026):** 3 posts, 4 users, 11 communities · smoke **28/28** · link previews deployed

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

1. **SES** — Optional SNS topic ARN + webhook (`docs/SES_AWS_SETUP.md`)
2. **Content** — More real specialty posts (helps indexing now that GSC is live)
3. **Backlog** — Rich Results Test, optional `og-share.png`, admin reporting, Lighthouse in CI

---

## 🛠️ **OPS QUICK REFERENCE**

```bash
./scripts/docker-disk-check.sh report    # disk + Docker usage
./scripts/docker-disk-check.sh cleanup   # safe post-build cleanup
./scripts/production-qa-smoke.sh         # post-deploy smoke tests
./scripts/seo-audit.sh                 # SEO + OG curl checks; optional Lighthouse
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

### **Session log (Jun 14, 2026)**

| Done | Detail |
|------|--------|
| Link previews | Server-side OG for posts, communities, users, home + hubs; Sec-Fetch + bot detection (iMessage, X, SMS) |
| OG polish | 1200×630 Cloudinary crops, shorter card descriptions, `index.html` default meta |
| GSC DNS | Google verification TXT on Namecheap `@` — awaiting propagation |
| GSC live | Domain verified; sitemap `https://orthoandspinetools.com/sitemap.xml` submitted |
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
**Status:** 🚀 Live — GSC verified + sitemap submitted; smoke 28/28  
**You are here:** Optional SES webhook, content growth, Rich Results Test
