# OrthoAndSpineTools Medical Platform - Development Progress & TODO

| Section | Purpose |
|--------|---------|
| **PROJECT BOUNDARY (MAJOR RULE)** | Keep all git + coding inside this repo only — **never spill into other projects** |
| **ANALYTICS DURABILITY (CRITICAL)** | Postgres volume + dump backups — never wipe, double-count, or store under deploy paths |
| **NEXT UP — START HERE** | Deploy facts, QA checklist, backlog — **canonical source of truth** |
| **NEXT PRIORITIES (summary)** | Short roadmap; **NEXT UP wins** if they disagree |
| **CODING AGENT INSTRUCTIONS** | Onboarding for contributors and agents |
| **OPS QUICK REFERENCE** | Database, SSL, Docker disk, scripts |
| **Archive** | Full history → `CHANGELOG.md` |

## ⛔ **PROJECT BOUNDARY — MAJOR RULE** (do not violate)

**All git and coding for OrthoAndSpineTools stays inside this project only.**

| Allowed | Forbidden |
|---------|-----------|
| Paths under `~/orthoandspinetools-main` (this repo) | Editing, creating, deleting, or refactoring files in **any other** project/repo/site |
| `git` commands in **this** repo only (`orthoandspinetools` / `orthoandspinetools-main`) | `git add` / `commit` / `push` / `pull` / `checkout` in other repos |
| Reading other projects **only** as reference when explicitly asked (copy ideas, don’t write there) | “Drive-by” fixes, shared scripts, or commits that touch sibling folders (`~/…`, `/srv/sites/…`, other domains) |
| Deploy/ops for **this** stack (`docker-compose.prod.yml`, this nginx, this systemd units) | Changing Physician Forge, The Direct Care List, Lemmy, or any other site “while we’re here” |

**Why:** This server hosts multiple sites. Spilling edits/commits across projects causes wrong deploys, mixed history, and hard-to-debug outages.

**Agent checklist before every write or git command:**
1. Confirm cwd / target path is under `orthoandspinetools-main`.
2. Confirm `git rev-parse --show-toplevel` is this repo.
3. If a task seems to need another project → **stop and ask**; do not touch it.

## 🛡️ **ANALYTICS DATA DURABILITY — CRITICAL** (read before analytics / deploy / nginx / systemd / storage)

Full agent copy: **`AGENTS.md`**. Cursor rule: `.cursor/rules/analytics-durability.mdc`.

**This site uses PostgreSQL (not `analytics.json`).** Live data lives in Docker volume `orthoandspinetools-main_postgres_data` — outside the git tree and outside any static/`rsync --delete` target.

| Rule | Detail |
|------|--------|
| **Persist outside deploy** | Never put live analytics under `dist/`, `public/`, or the project tree that deploy deletes |
| **Before change** | Note dump size/mtime/sha256; confirm deploy won’t wipe `postgres_data`; confirm bot backfill stays gated by `analytics_bot_state.backfilled_at` |
| **Safe writes** | No truncate/reset on startup if data exists; dump backups = write `.tmp` then `mv` |
| **Backups** | `scripts/analytics-backup.sh` → `/mnt/HC_Volume_106016238/orthoandspinetools-backups/analytics/` (`analytics-*.sql.gz` + `analytics-latest.sql.gz`, ≥30d). Cron: `scripts/install-analytics-backup-cron.sh` (daily 02:15). Full DB still at 02:00. |
| **Semantics** | Humans = JS beacon only (no invented history). Bots = nginx log. Scanners out of headlines. UTC days. |
| **Forbidden w/o approval** | Delete/truncate analytics tables or dumps; clear bot cursor / full re-backfill; move path without copy+verify; `docker compose down -v` |
| **After change** | Report data path, backup path, cursor preserved, headlines (`viewsToday` / `views7d` / `bots.hits7d`) via `./scripts/analytics-durability-report.sh` |

```bash
./scripts/analytics-backup.sh                    # run before risky migrations
./scripts/install-analytics-backup-cron.sh       # once
./scripts/analytics-durability-report.sh         # after analytics-related work
```

## 🔥 **NEXT UP — START HERE** (updated Sep 7, 2026)

### **Pick up here (step-by-step)**

| Step | Task | Status |
|------|------|--------|
| **1** | **Disk / backups** | ✅ Hetzner volume `106016238` (20G) · cron → `/mnt/HC_Volume_106016238/orthoandspinetools-backups` · Docker log limits |
| **2** | **Link preview images** | ✅ Posts + hubs + **implant profiles** (`/api/og/implant/:slug`, 1200×630 product image) for iMessage/SMS/X |
| **3** | **Edit post tags** | ✅ `/post/:id/edit` — add/remove community topic tags (e.g. remove mistaken **Case** tag) |
| **4** | **Physician NPI verification** | ✅ U.S. NPI via CMS registry; intl. manual review; admin pending filter |
| **5** | **Legal pages** | ✅ Privacy + Terms with NPI wording |
| **6** | **SES SNS webhook** | ⏸️ **Deferred** — not a launch blocker; revisit when digest volume / user scale grows (`docs/SES_AWS_SETUP.md`) |
| **7** | **Manual QA** | ⏳ Physician NPI signup, intl. pending queue, email verify |
| **8** | **Content** | ⏳ More real specialty posts; fix tags on backfilled posts as needed |
| **9** | **MAUDE brand synopsis** | ✅ Click brand → problem codes + recent FDA narrative excerpts (`/api/maude/synopsis`) |
| **10** | **MAUDE coverage gaps** | ✅ Device—Company titles; Unknown-specialty implants (discs, Superion, INFUSE, mobile-bearing knees) |
| **11** | **MAUDE smart search** | ✅ Clinical phrases → implant brands (cervical/lumbar disc arthroplasty, SI, INFUSE, …) |
| **12** | **Bot / LLM analytics** | ✅ Nginx log tailer + admin **Bots & agents**; header **Stats**; humans stay on JS beacon |
| **13** | **Implant Directory** | ✅ Page finish + STG PDFs; Directory Score + comments; public `/stats` (spinning NA globe); catalog growth next; **MCP later** |

**Ongoing disk habit:** `./scripts/docker-disk-check.sh report` before `--no-cache` builds.

### **Goals**
- [x] **Brand copy** — Tagline **"Ortho and Spine Tools - Hunt for the Best"** across SEO, `index.html`, register, `llms.txt`.
- [x] **Link previews** — Server-side OG for `/post/:id`, `/community/:slug`, `/user/:username`, `/implants/:slug`, `/`, `/cases`, `/implants`, `/maude`, `/startups`, `/popular`; nginx `serve_og_preview` map (bots + iMessage); `index.html` default OG/Twitter meta.
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
- [x] **MAUDE smart search** — Clinical phrases expand to implant brands (e.g. “cervical disc arthroplasty” → Mobi-C / prodisc C / M6-C…; “lumbar disc arthroplasty” → CHARITÉ / prodisc L / activL); also SI fusion, interspinous, INFUSE, kypho, pedicle fixation, UKA, RSA.
- [x] **Secret rotation** — Rotated production `JWT_SECRET` + `POSTGRES_PASSWORD` off compose defaults; scrubbed plaintext DB password from tracked docs/scripts.
- [x] **Digest cron hardening** — Moved `EMAIL_DIGEST_CRON_SECRET` out of crontab into `scripts/digest-cron.sh` (loads `.env`); rotated the secret.
- [ ] **Amazon SES — follow-ups (deferred)** — SNS webhook + auto bounce/complaint suppression when mailing at scale; optional suppression Admin UI. **Sending works without this.**
- [x] **Dark / light mode** — `ThemeProvider` (`ost-theme`); Light → Dark → System cycle in header; FOUC-safe boot; site-wide CSS surfaces; Profile Appearance.
- [x] **MAUDE brand request** — `POST /api/maude/brand-request` + `MaudeBrandRequest` table; search UI “Don’t see it? Request we add it”.
- [x] **Cloudflare R2 media** — Available as fallback (`MEDIA_PROVIDER=r2`). Bucket `orthoandspinetools` on `4298f947…`, public `https://pub-c36d475ac3284cb2bfde3c1ae5d28ccf.r2.dev`. Existing Cloudinary + R2 URLs still serve.
- [x] **Cloudflare Images + Stream dialed-in** — Live `MEDIA_PROVIDER=cloudflare`. Variants `feed`/`avatar`/`thumb`/`banner` + flexible transforms. Nginx CSP allows Stream iframes. CreatePost Stream preview. Light sharp prep (EXIF/soft-cap) + CF delivery sizing. Smoke: image/avatar/banner/video → 200.
- [x] **Reddit-like image sizing** — CF delivery variants (scale-down 1920 / avatar 256 / etc.) + server-side `sharp` pre-resize before upload; feed UI `object-contain` + max-height.
- [x] **MAUDE ACDF coverage** — Clinical concept “ACDF / anterior cervical fusion” + rollups (Zero-P, Atlantis, Zevo, Skyline, Slim Loc, ACIS, CoRoent, Tritanium C, Prevail, …). Hyphen brand Lucene fix. CADD-Solis pump noise demoted.
- [x] **MAUDE brand-request alerts** — `MAUDE_REQUEST_TO` (+ `UPTIME_ALERT_TO`) passed into backend; SES emails `admin@orthoandspinetools.com` on new requests.
- [x] **Mobile UX pass** — Opt-in `.touch-target` (no global 44px inflation); denser header; wrapping feed/post/comment actions; shorter policy banner; feed media height; drawer scroll lock; MAUDE chip scroll; dark orange/yellow remaps.
- [ ] **R2 production URL** — Optional custom domain (e.g. `media.orthoandspinetools.com`) instead of rate-limited `r2.dev`.
- [ ] **Security follow-ups** — Fail startup on default secrets; enable upload virus scanning (ClamAV). Rotate Cloudflare API token that was pasted in chat.
- [x] **Google Search Console** — Domain verified; sitemap submitted (`/sitemap.xml`).
- [ ] **Optional** — Rich Results Test on home + `/post/:id`; dedicated 1200×630 `og-share.png` for richer homepage/hub cards.
- [x] **First-party bot + LLM agent traffic** — Postgres `analytics_bot*` tables; UA classification (ai_agent / ai_crawl / search / …); `bot-analytics` compose service tails `nginx/logs/access.log` (14d backfill + cursor); `/pageview` bot UAs never inflate human counts; Admin Analytics **Bots & agents**; public **`/stats`** (OC-style humans + globe + bots) in header for everyone. Unit: `scripts/orthoandspinetools-bot-analytics.service` (`sudo` enable if not yet installed).
- [x] **Public Stats page** — `GET /api/analytics/stats` + `/globe`; GeoIP country on new pageviews; Stats link in public header/sidebar.
- [x] **Analytics durability** — Rules in `AGENTS.md` + `.cursor/rules/analytics-durability.mdc` + TODO; live data on Postgres volume (not git/deploy); daily `analytics-backup.sh` → Hetzner `…/backups/analytics/` (≥30d); backfill gated by `backfilled_at`.
- [x] **Implant Directory shell** — Nav under Cases → `/implants` + `/implants/:slug`; Postgres `implants` / `implant_images` / `implant_reviews`; 5 spine seeds; directory public.
- [x] **Implant Directory — harden + AI SEO search** (before MCP / big ingest):
  1. **Search UX** — Debounced directory `q` (300ms); page/`pageSize` pagination with real `total`/`totalPages`; specialty + device-class filters.
  2. **API guards** — Rate-limit list/detail/reviews/ingest; public list returns only published|verified.
  3. **DB search** — `search_text` + `pg_trgm` + FTS GIN indexes; alias-aware ranked search (`implantSearch.ts`).
  4. **Ingest / draft** — `POST /api/implants/ingest` + publish (header `x-implant-ingest-secret`); `implant_edit_logs`; draft → published|verified.
  5. **Images / rights** — Ingest accepts product|xray|diagram with required `licenseNote` on product/xray; CF Images pipeline still TODO for bulk rights-cleared assets.
  6. **Discussion** — Upvote/downvote comments (feed-style) fold into proprietary Directory Score (`ost-dir-v1`); legacy star reviews deprecated for scoring.
  7. **AI SEO / discoverability** — Per-listing `/implants/:slug` + `/implants/:slug.md`; MedicalDevice JSON-LD; sitemap + `llms.txt` / `llms-full.txt`.
  8. **MAUDE on profile** — Deep-link + 12‑mo snapshot card on detail.
- [x] **Implant Directory — all subspecialties** — Chip filter with **All specialties** + each community specialty; seed listings per specialty.
- [x] **Implant Directory — smart search** — Clinical phrases (cervical TDR, TKA, pedicle screw, INFUSE…), FTS/trgm/alias ranking, specialty synonym `search_text`, inferred-specialty boost when All.
- [x] **Admin edit** — `drewalbertmd` (`isAdmin`): edit any post; PATCH implant listings + ingest/publish via JWT; audit in `implant_edit_logs`.
- [x] **DB durability (Cloudflare)** — Daily full Postgres → Hetzner volume + **R2** (`scripts/database-backup-production.sh` + `backup-to-r2.js`); analytics dumps also → R2 `…/analytics/`.
- [x] **Implant Directory — AI scores + media UI** — `ai_rating` 0–10 + summary on every listing; single product thumb; detail gallery for product/X-ray/diagram; browse sorted by AI score.
- [x] **Implant Directory — compact filters** — Direct-Care-style row (specialty / class / Verified / sort) on `/implants` only; no chip sprawl.
- [x] **Implant Directory — images fill-out** — Seed listings have manufacturer product (and where available XR/diagram) on Cloudflare Images with attribution + `licenseNote`; list/detail `productImage` / gallery live for all 15 seeds.
- [x] **Public Stats** — Header **Stats** → `/stats` + live globe (starts on North America, idle spin); human pageviews / geo; bots stay separate.
- [x] **Implant Directory — page finish** — Hide IFU placeholders; product `ogImage` + JSON-LD; gallery thumbs link; related strip; MAUDE 12‑mo card; loading skeleton; XR lightbox; Verified disabled until count > 0; directory copy softened (X-ray not promised on every profile).
- [x] **Implant Directory — technique guides** — Surgical/operative technique PDF only (not brochures): list icon left of score + detail CTA; direct `.pdf` validated on ingest/admin; 6 STG seeds (INFUSE cleared — FDA URL 403).
- [x] **MAUDE Rising/Top stable colors** — Brand colors/stroke weight keyed by name so Rising ↔ Top reorder does not jump the chart.
- [x] **Implant Directory — pre-growth hardening** — Slim list/related payloads (product thumb only); vote tallies via `groupBy`; verified-count TTL cache; browse indexes `(status,specialty,ai_rating)` + company + verified partial; anonymous `Cache-Control` on list/detail; dedicated `IMPLANT_INGEST_SECRET` only; admin `GET /api/implants/admin/drafts`.
- [ ] **Implant Directory — catalog growth** — More systems via Grokbot ingest (draft → verify); refine AI assessments; more XR/diagram where rights clear; more technique PDFs; swap Solera JP chart for English catalog shot when available. **← next**
- [ ] **Implant Directory — MCP / paid data** — Licensed API + MCP connector (Nomads-style); optional SQLite/JSON export. **Blocked until images + data quality are solid.**

### **0. Deploy status — verify live**
- [x] **https://orthoandspinetools.com** — home, hubs, sitemap, OG previews with post images, edit-post tags, `/maude`
- [x] **Latest deploy (Oct 13)** — Implant Directory shell (`/implants`, 5 spine seeds, member reviews); MAUDE Rising sort for graph+list; analytics durability still in force
- [x] **Latest deploy (Oct 14)** — Implant Directory harden: FTS search, debounce/pagination, ingest/draft, AI SEO detail + `.md` twins, sitemap/llms
- [x] **Latest deploy (Oct 14b)** — All-specialty directory seeds; public review read; admin post+implant edit; analytics→R2 off-site
- [x] **Latest deploy (Oct 14c)** — Public `/stats` + globe; implant comments + Directory Score; page finish; technique PDF guides on list/detail
- [x] **Latest deploy (Oct 14d)** — STG-only technique PDFs; MAUDE Rising/Top color stability; globe idle spin from North America; production QA **31/31**; analytics volume + backups intact (`viewsToday`/`views7d`/`bots.hits7d` via durability report)
- [x] **Latest deploy (Oct 14e)** — Implant share cards: `/api/og/implant/:slug` + nginx bot rewrite; Cloudflare/Cloudinary 1200×630 OG delivery; DocumentMeta `og:image:secure_url` + dims; hub implant OG copy polish
- [x] **Latest deploy (Oct 14f)** — Implant Directory + detail mobile layout (2-col filters, full-width gallery, touch targets); dark-mode remaps for slate/score badges/blue panels; STG + discussion polish
- [x] **Latest deploy (Oct 15)** — Implant Directory scale hardening: slim list cards, vote aggregation, verified-count cache, browse indexes, Cache-Control, ingest-secret harden, admin drafts queue
- [x] **Ops rule (hard)** — After **every** `backend`/`frontend` recreate, always: `docker compose -f docker-compose.prod.yml up -d --force-recreate nginx` (cached Docker DNS → 502 Connection refused on old IPs)
- [x] **Analytics backup cron** — `15 2 * * *` → `scripts/analytics-backup.sh` → `/mnt/HC_Volume_106016238/orthoandspinetools-backups/analytics/`

### **1. Deploy (production server)**

| Item | Value |
|------|--------|
| Server | `dstrad@orthoandspinetools` (SSH) |
| Disk | `/dev/sda1` **38G** root · **Hetzner volume 106016238** 20G at `/mnt/HC_Volume_106016238` for DB backups |
| Repo | `~/orthoandspinetools-main` |
| Compose | `docker-compose.prod.yml` |
| Containers | `orthoandspinetools-{postgres,backend,frontend,nginx,bot-analytics}` |
| Secrets | `.env`, `.env.cloudinary`, Cloudflare `CLOUDFLARE_*` (never commit); SES vars on server only |
| SSL renew | ✅ Cron active: `0 3 1 * *` → `scripts/ssl-renew-cron.sh` |
| Disk cleanup | ✅ Cron active: `0 4 1 * *` → `scripts/docker-disk-check.sh cleanup` |

```bash
cd ~/orthoandspinetools-main
GIT_SSH_COMMAND='ssh -F /dev/null -o StrictHostKeyChecking=accept-new' git pull origin main
docker compose -f docker-compose.prod.yml build --no-cache backend frontend   # watch disk!
docker compose -f docker-compose.prod.yml up -d backend frontend bot-analytics
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx   # required: refresh upstream IPs
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
- **Disk / ops** — Cloudflare R2 off-site DB backups ✅; root disk stays lean via volume backups + Docker log limits
- **SEO** — Lighthouse / Rich Results; confirm `VITE_SITE_URL` / `PUBLIC_SITE_URL` in prod builds
- **Admin** — SES suppression UI (with SNS webhook); email alert on intl. physician signup (optional)
- **Content** — More real specialty posts; remove **Case** tag from non-case posts via edit
- **Post media (WIP)** — Re-test create-post upload if needed; existing posts display images OK
- **Notifications** — Vote/mention/moderation triggers (v1 comment/reply shipped)

**Live snapshot (Aug 30, 2026):** **Media → Cloudflare Images + Stream** (Reddit-like sizing) · R2/Cloudinary legacy URLs still serve · MAUDE smart search · dark/light theme

---

## 📋 **NEXT PRIORITIES (summary)**

1. **Implant Directory catalog growth** — Pre-growth API/index hardening ✅; next: more systems via Grokbot ingest; extra XR/diagram; more technique PDFs; refine AI assessments
2. **Manual QA** — Create post with image/video; physician NPI / intl. pending / email verify
3. **Implant MCP / paid API** — After data quality is solid (license + export + connector)
4. **R2 custom domain** — Prefer `media.orthoandspinetools.com` over `r2.dev` if needed
5. **Scaling** — CPX21 resize when ready

**Deferred (not launch blockers):** SES SNS webhook for auto bounce/complaint suppression — see `docs/SES_AWS_SETUP.md` when digest/user volume grows.

**Uptime monitoring:** ✅ `scripts/uptime-monitor.sh` (every 5 min via `install-uptime-monitor-cron.sh`) — emails on down/recovery via SES to `UPTIME_ALERT_TO`.

---

## 🤖 **CODING AGENT INSTRUCTIONS**

**Before any work:**
1. Read **PROJECT BOUNDARY — MAJOR RULE** above — **all git + coding stays in this repo only; never spill into other projects**
2. Read **ANALYTICS DATA DURABILITY — CRITICAL** (and `AGENTS.md`) before touching analytics, deploy, nginx, systemd, or storage
3. Read **NEXT UP** above (do not re-ask how production is hosted)
4. Run `df -h /` and `docker system df` on the server — **disk was critical this session**
5. Check `https://orthoandspinetools.com`
6. Run `./scripts/production-qa-smoke.sh` after deploy-affecting changes
7. Update this file when completing major tasks

**Stack:** React/Vite/Tailwind frontend · Node/Express/Prisma/PostgreSQL backend · Docker + nginx + Let's Encrypt

**Do not:** break existing features; commit secrets; run destructive DB ops without approval; **`docker compose down -v`** (deletes DB volume); **edit or git other projects on this host**; wipe/reset analytics tables or force bot log re-backfill without explicit approval

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
./scripts/database-backup-production.sh    # manual full DB backup (uses volume when mounted)
./scripts/database-backup-cron.sh          # cron entrypoint (daily 02:00)
./scripts/analytics-backup.sh              # analytics tables only → …/backups/analytics/
./scripts/install-analytics-backup-cron.sh # once: daily 02:15 analytics dump
./scripts/analytics-durability-report.sh   # post-change fingerprint + headlines
./scripts/setup-backup-volume.sh           # one-time Hetzner volume backup dir setup
docker compose -f docker-compose.prod.yml exec backend npm run backfill-case-post-tags
```

**Database password:** `POSTGRES_PASSWORD` in `.env` must match `DATABASE_URL`.

**SSL paths in nginx:** `nginx/ssl/certs/fullchain.pem` + `privkey.pem`

**nginx after backend/frontend recreate or config change:** always `--force-recreate` (stale upstream IPs → intermittent 502):
`docker compose -f docker-compose.prod.yml up -d --force-recreate nginx`

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
| Link previews | Server-side OG for posts, communities, users, implants, home + hubs; Sec-Fetch + bot detection (iMessage, X, SMS) |
| OG polish | 1200×630 Cloudinary/Cloudflare crops, shorter card descriptions, `index.html` default meta; implant product-image cards |
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

**Last Updated:** Aug 31, 2026  
**Status:** 🚀 Live — Mobile UX; MAUDE ACDF + SES brand-request alerts; Cloudflare Images+Stream; R2 backups  
**You are here:** Optional endoscopic/nav spine coverage gaps; optional R2 custom media domain; content/tag cleanup
