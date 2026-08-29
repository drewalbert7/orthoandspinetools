# OrthoAndSpineTools Medical Platform - Development Progress & TODO

| Section | Purpose |
|--------|---------|
| **NEXT UP — START HERE** | Deploy facts, QA checklist, backlog — **canonical source of truth** |
| **NEXT PRIORITIES (summary)** | Short roadmap; **NEXT UP wins** if they disagree |
| **CODING AGENT INSTRUCTIONS** | Onboarding for contributors and agents |
| **OPS QUICK REFERENCE** | Database, SSL, Docker disk, scripts |
| **Archive** | Full history → `CHANGELOG.md` |

## 🔥 **NEXT UP — START HERE** (updated Aug 29, 2026)

### **Pick up here (step-by-step)**

| Step | Task | Status |
|------|------|--------|
| **1** | **Disk / backups** | ✅ Hetzner volume `106016238` (20G) · cron → `/mnt/HC_Volume_106016238/orthoandspinetools-backups` · Docker log limits |
| **2** | **Link preview images** | ✅ Post OG images fixed (Cloudinary URL); Discord/iMessage/X show post images |
| **3** | **Edit post tags** | ✅ `/post/:id/edit` — add/remove community topic tags (e.g. remove mistaken **Case** tag) |
| **4** | **Physician NPI verification** | ✅ U.S. NPI via CMS registry; intl. manual review; admin pending filter |
| **5** | **Legal pages** | ✅ Privacy + Terms with NPI wording |
| **6** | **SES SNS webhook** | ⏸️ **Deferred** — not a launch blocker; revisit when digest volume / user scale grows (`docs/SES_AWS_SETUP.md`) |
| **7** | **Manual QA** | ⏳ Physician NPI signup, intl. pending queue, email verify |
| **8** | **Content** | ⏳ More real specialty posts; fix tags on backfilled posts as needed |
| **9** | **MAUDE brand synopsis** | ✅ Click brand → problem codes + recent FDA narrative excerpts (`/api/maude/synopsis`) |
| **10** | **MAUDE coverage gaps** | ✅ Device—Company titles; Unknown-specialty implants (discs, Superion, INFUSE, mobile-bearing knees) |

**Ongoing disk habit:** `./scripts/docker-disk-check.sh report` before `--no-cache` builds.

### **Goals**
- [x] **Brand copy** — Tagline **"Ortho and Spine Tools - Hunt for the Best"** across SEO, `index.html`, register, `llms.txt`.
- [x] **Link previews** — Server-side OG for `/post/:id`, `/community/:slug`, `/user/:username`, `/`, `/cases`, `/startups`, `/popular`; nginx `serve_og_preview` map (bots + iMessage); `index.html` default OG/Twitter meta.
- [x] **Cases** — `/cases`, `tagName=Case`, backfill script.
- [x] **Dynamic sitemap** — posts, communities, public user profiles.
- [x] **LLM citing** — `llms.txt`, dynamic `llms-full.txt`, expanded `robots.txt`.
- [x] **Hub SEO** — DocumentMeta + JSON-LD on Cases, Popular, Startups, Search; Person schema on profiles.
- [x] **Real data** — Community moderators/rules, public user profiles, post sidebar join state.
- [x] **Production QA smoke** — `./scripts/production-qa-smoke.sh` (**31/31** incl. OG post image HTTP 200).
- [x] **Post link preview images** — Fixed Cloudinary OG URLs; Discord/X/iMessage show post images in embeds.
- [x] **Edit post topic tags** — Authors can add/remove community tags on `/post/:id/edit`.
- [x] **Hetzner backup volume** — 20G volume `106016238`; Docker log rotation on all prod services.
- [x] **Physician NPI verification** — U.S. CMS registry at signup; international `physicianVerificationPending`; admin verify clears pending.
- [x] **Legal NPI wording** — Privacy Policy + Terms of Service describe NPI collection, CMS lookup, and manual intl. review.
- [x] **Admin pending physician filter** — Admin → Users → **Pending intl. review** (`physicianVerificationPending=true`).
- [x] **Daily DB backups** — `0 2 * * *` → Hetzner volume `106016238` at `/mnt/HC_Volume_106016238/orthoandspinetools-backups` (falls back to `backups/` if unmounted).
- [x] **Feed query indexes** — `posts`, `comments`, `post_votes`, `post_tags` indexes for home/community/profile feeds.
- [x] **Clickable links in posts** — `remark-gfm` autolinks bare URLs in post/comment bodies; `remark-breaks` preserves single newlines (applies everywhere `MarkdownContent` renders).
- [x] **MAUDE implant trends** — Public `/maude`: brand-ranked openFDA chart; Device—Company titles; brand search/trending/synopsis; Unknown-specialty coverage (cervical discs, Superion, INFUSE, mobile-bearing/UKA knees); SKU rollups; daily warm cron + `OPENFDA_API_KEY`.
- [x] **Secret rotation** — Rotated production `JWT_SECRET` + `POSTGRES_PASSWORD` off compose defaults; scrubbed plaintext DB password from tracked docs/scripts.
- [x] **Digest cron hardening** — Moved `EMAIL_DIGEST_CRON_SECRET` out of crontab into `scripts/digest-cron.sh` (loads `.env`); rotated the secret.
- [ ] **Amazon SES — follow-ups (deferred)** — SNS webhook + auto bounce/complaint suppression when mailing at scale; optional suppression Admin UI. **Sending works without this.**
- [x] **Dark / light mode** — `ThemeProvider` (`ost-theme`); Light → Dark → System cycle in header; FOUC-safe boot; site-wide CSS surfaces; Profile Appearance.
- [x] **MAUDE brand request** — `POST /api/maude/brand-request` + `MaudeBrandRequest` table; search UI “Don’t see it? Request we add it”.
- [ ] **Cloudflare R2 media** — Code wired (`r2MediaService` + `MEDIA_PROVIDER=auto`). Bucket `orthoandspinetools` on account `4298f947…` (Orthoandspine). **Blocked:** S3 endpoint TLS not provisioned yet (`sslv3 alert handshake failure` on `*.r2.cloudflarestorage.com`). Need working TLS + `R2_PUBLIC_URL` (r2.dev/custom domain). Cloudinary remains active fallback.
- [ ] **Cloudflare Images + Stream** — Token + Images hash saved; Images direct-upload URL works but file upload/`Stream` still unauthorized until products fully enabled. Optional vs R2.
- [ ] **Cloudflare off-site backups** — Copy daily DB dumps to Cloudflare R2 (same account, `backups/` prefix) once R2 S3 TLS is live; keep Hetzner volume as primary.
- [ ] **Security follow-ups** — Fail startup on default secrets; enable upload virus scanning (ClamAV). Rotate Cloudflare API token that was pasted in chat.
- [x] **Google Search Console** — Domain verified; sitemap submitted (`/sitemap.xml`).
- [ ] **Optional** — Rich Results Test on home + `/post/:id`; dedicated 1200×630 `og-share.png` for richer homepage/hub cards.

### **0. Deploy status — verify live**
- [x] **https://orthoandspinetools.com** — home, hubs, sitemap, OG previews with post images, edit-post tags, `/maude`
- [x] **Latest deploy (Aug 29)** — dark/light mode + MAUDE brand request + media provider plumbing (R2/Images/Cloudinary); active uploads still **Cloudinary** until R2 TLS is ready
- [ ] After **every** frontend/nginx recreate: `--force-recreate nginx` if needed (stale upstream → 502)

### **1. Deploy (production server)**

| Item | Value |
|------|--------|
| Server | `dstrad@orthoandspinetools` (SSH) |
| Disk | `/dev/sda1` **38G** root · **Hetzner volume 106016238** 20G at `/mnt/HC_Volume_106016238` for DB backups |
| Repo | `~/orthoandspinetools-main` |
| Compose | `docker-compose.prod.yml` |
| Containers | `orthoandspinetools-{postgres,backend,frontend,nginx}` |
| Secrets | `.env`, `.env.cloudinary`, Cloudflare `CLOUDFLARE_*` (never commit); SES vars on server only |
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
- **Disk / ops** — Cloudflare R2 off-site backup copy; root disk stays lean via volume backups + Docker log limits
- **SEO** — Lighthouse / Rich Results; confirm `VITE_SITE_URL` / `PUBLIC_SITE_URL` in prod builds
- **Admin** — SES suppression UI (with SNS webhook); email alert on intl. physician signup (optional)
- **Content** — More real specialty posts; remove **Case** tag from non-case posts via edit
- **Post media (WIP)** — Re-test create-post upload if needed; existing posts display images OK
- **Notifications** — Vote/mention/moderation triggers (v1 comment/reply shipped)

**Live snapshot (Aug 29, 2026):** Dark/light theme · MAUDE brand request + Device—Company titles · Cloudflare R2/Images media plumbing (uploads still Cloudinary; R2 TLS pending) · smoke **31/31** · secrets rotated · volume backups · uptime monitoring · post OG images

---

## 📋 **NEXT PRIORITIES (summary)**

1. **Cloudflare R2 TLS** — Wait for S3 endpoint cert on `4298f947…`; then verify PutObject + set `R2_PUBLIC_URL`; switch media off Cloudinary for new uploads
2. **Content** — More real specialty posts; clean up **Case** tags on product/tool posts
3. **Manual QA** — Physician NPI signup, intl. pending queue, email verification
4. **Cloudflare backups** — Off-site DB dump copy to R2 after media endpoint is live
5. **Scaling** — CPX21 resize when ready

**Deferred (not launch blockers):** SES SNS webhook for auto bounce/complaint suppression — see `docs/SES_AWS_SETUP.md` when digest/user volume grows.

**Uptime monitoring:** ✅ `scripts/uptime-monitor.sh` (every 5 min via `install-uptime-monitor-cron.sh`) — emails on down/recovery via SES to `UPTIME_ALERT_TO`.

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

## 🛠️ **OPS QUICK REFERENCE**

```bash
./scripts/docker-disk-check.sh report    # disk + Docker usage
./scripts/docker-disk-check.sh cleanup   # safe post-build cleanup
./scripts/production-qa-smoke.sh         # post-deploy smoke tests
./scripts/seo-audit.sh                 # SEO + OG curl checks; optional Lighthouse
./scripts/ses-webhook-status.sh          # SES/SNS env check
./scripts/quick-restart.sh               # safe restart (never docker compose down)
./scripts/database-backup-production.sh    # manual DB backup (uses volume when mounted)
./scripts/database-backup-cron.sh          # cron entrypoint (daily 02:00)
./scripts/setup-backup-volume.sh           # one-time Hetzner volume backup dir setup
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

### **Session log (Aug 28–29, 2026 — MAUDE trends)**

| Done | Detail |
|------|--------|
| MAUDE page | `/maude` hub with multi-year openFDA chart (daily/cumulative), zoom/pan, hover highlight |
| Specialty filters | Toggles match communities (Spine, Hip & Knee, Sports, Trauma, etc.) |
| Top brands | Rank by `brand_name` (top 20); Device—Company titles; instruments/UNK/company-as-brand filtered |
| Search + trending | Live openFDA brand autocomplete; trending by recent vs prior growth |
| Brand synopsis | Click brand → event mix, device/patient problems, recent narrative excerpts (`GET /api/maude/synopsis`) |
| Coverage gaps | OR Unknown-specialty classes: disc arthroplasty, spinous spacers (Superion), INFUSE/rhBMP, mobile-bearing + UKA knees; spine keywords for SI/kypho |
| SKU rollups | Mobi-C, prodisc C/L, M6-C, Simplify, Superion, INFUSE, ATTUNE, iFuse → one commercial product |
| openFDA ops | `OPENFDA_API_KEY` wired; daily warm cron (`scripts/maude-warm-cron.sh`); `GET /api/maude/status` |
| Wiring | `/api/maude/trends`, `/search`, `/synopsis`, `/warm`; sidebar + sitemap + OG |

### **Session log (Jul 2026 — security + review)**

| Done | Detail |
|------|--------|
| Secret rotation | Rotated prod `JWT_SECRET` + `POSTGRES_PASSWORD` off compose defaults; DB password updated; backend/postgres recreated |
| Docs scrubbed | Removed plaintext `secure_password_123` from `DATABASE_RECOVERY.md`, `DATABASE_MAINTENANCE.md`, `IMPORTANT_RESTART_INFO.md`, `database-ensure-connection.sh` |
| Digest cron | Secret moved out of crontab → `scripts/digest-cron.sh` (loads `.env`); secret rotated |
| Augmedics post | X2 headset post created under `drewalbertmd` (Spine · Tech + Medical Device) via `backend/scripts/createAugmedicsPost.js` |
| Ortho & Spine Jobs post | Platform post under `drewalbertmd` (o/Tech · Tech tag) with mobile hero + compensation map images; links to the anonymous survey — `backend/scripts/createOrthoJobsPost.js` |
| Direct Care List post | Platform post under `drewalbertmd` (o/Tech · Tech tag) with site OG image — `backend/scripts/createDirectCareListPost.js` |
| Post links fixed | `MarkdownContent` now uses `remark-gfm` (autolinks bare URLs) + `remark-breaks` (single newlines render); GFM table/strikethrough styles added; frontend rebuilt + deployed |
| MAUDE trends page | `/maude` — daily openFDA adverse-event chart; specialty toggles match communities; top-implant icon grid (click to filter chart) |
| Prod review (Jul 23–25) | All containers healthy; smoke **31/31**; backups current; SSL valid to Aug 15; secrets non-default |

### **Session log (Jun 14, 2026 — night)**

| Done | Detail |
|------|--------|
| Edit post tags | `/post/:id/edit` — add/remove community topic tags; `PUT /posts/:id` accepts `tagIds` |
| OG post images | Fixed Cloudinary `.auto` 404s; Discord/X/iMessage embeds show post images |
| Hetzner volume | 20G volume `106016238` wired for daily backups; Docker log limits |
| Deploy | Backend + frontend live; smoke **31/31** |

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

**Last Updated:** Aug 29, 2026  
**Status:** 🚀 Live — dark/light mode, MAUDE brand requests, media provider plumbing (R2 pending TLS); Cloudinary still serving uploads  
**You are here:** Wait for Cloudflare R2 S3 TLS; then public URL + cut over media; content/tag cleanup; physician QA
