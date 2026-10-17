# OrthoAndSpineTools - Agent Handoff Document

A brand-new agent can resume from this file alone. Nothing in this file is ever deleted, only moved to History.

---

## 1. Rules to Live By

### Drew's Standing Rules

- **Report only via the operator bot to CEO Bot** - never contact Drew directly
- **Ask before any post, email, spend, code change, or irreversible step**
- **Show drafts first** before publishing or committing
- **No PHI/PII** in any output, commit, or communication
- **No em dashes** - use hyphens or rewrite
- **Surgeon-to-peer tone** - professional, collegial, not marketing-speak
- **Industry/company facts must be sourced, conflicts disclosed**
- **When corrected:** fix with code first, then an automated check, then written rules, human review last
- **One cloud agent per repo** - batch related changes into one PR
- **OST brand is separate** from Ortho & Spine Jobs and OrthoWest - do not conflate

### Repo Do's and Don'ts

| Do | Don't |
|----|-------|
| Production deploys via `./deploy.sh` with pre-deploy checks | Skip checks except `--skip-checks` for emergencies (log loudly) |
| Prisma migrations are manual: `prisma migrate deploy` | Never run `migrate dev` on production |
| Recompute scores: `npx tsx scripts/recompute-implant-scores.ts` | Run score scripts without understanding impact |
| Git on server: `GIT_SSH_COMMAND="ssh -F /dev/null" git pull` | Trust server `~/.ssh/config` (malformed) |
| Back up DB before deploys | Deploy without backup |
| After backend/frontend recreate: `docker compose -f docker-compose.prod.yml up -d --force-recreate nginx` | Forget nginx force-recreate (causes 502s) |

### Server Paths - Never Touch

- `~/.cursor-server`
- `~/.rustup`
- `~/.cargo`

### Project Boundary (Major Rule)

All git and coding stay inside `~/orthoandspinetools-main` only. Do not edit or commit other sites/repos on this host.

### Analytics Data Durability (Critical)

See `AGENTS.md` and `.cursor/rules/analytics-durability.mdc` for full details. Key points:

- Live analytics in PostgreSQL volume `orthoandspinetools-main_postgres_data` (outside git)
- Never `docker compose down -v` (deletes DB volume)
- Run `./scripts/analytics-durability-report.sh` after analytics changes
- Backups: `scripts/analytics-backup.sh` daily at 02:15

### Todo.md Rules

- **Nothing in todo.md is ever deleted, only moved to History**
- Read todo.md first in every session
- Update todo.md last in every PR

---

## 2. Skill Files

| File | Purpose |
|------|---------|
| `.cursor/rules/analytics-durability.mdc` | Critical analytics data durability rules - never wipe, double-count, or store under deploy paths |
| `.cursor/rules/todo-first.mdc` | Read todo.md first, update last in every PR; nothing deleted, only moved to History |
| `AGENTS.md` | Agent memory - project boundary, analytics durability, ops reminders |

---

## 3. In Progress

| PR | Description | Status |
|----|-------------|--------|
| [#7](https://github.com/drewalbert7/orthoandspinetools/pull/7) | Implant catalog staging tables and openFDA importer | Draft, awaiting review |
| [#9](https://github.com/drewalbert7/orthoandspinetools/pull/9) | Restructure todo.md + check-gated deploy with rollback | In progress |
| [#11](https://github.com/drewalbert7/orthoandspinetools/pull/11) | Rate limiter fix (separate read/write buckets, trust proxy env) + pre-deploy checks target the local stack and fail on empty feed/implants or API 429/5xx + /methodology 301 | Open, not merged, not deployed |

---

## 4. Next Up

### Implant Directory Catalog Growth

- GUDID + maker-page enrichment for catalog
- Joint codes integration
- More systems via Grokbot ingest (draft then verify)
- Refine AI assessments
- More XR/diagram where rights clear
- More technique PDFs
- Swap Solera JP chart for English catalog shot when available

### Openly Licensed X-ray Corpus

- UCI shoulder X-ray dataset: 597 images, CC BY 4.0
- Per-image source/license tracking required

### Case-Post X-ray De-identification

- **Design-only until Drew and an attorney approve**
- Do not implement without explicit approval

### Practice Efficiency

- New site section: Practice Efficiency, structured like the existing Biologics and Tech sections. Topics include business tactics, contract negotiations (employment, call pay, RVU/comp, non-competes), OR efficiency (turnover, block time, case sequencing, team/tray standardization), and related practice management. (Requested by Drew 2026-10-17; not started, do not build until approved.)

---

## 5. Open Decisions

| Decision | Status |
|----------|--------|
| Ortho Conditioning X-rays excluded | Awaiting Drew confirmation of ownership |
| True 404s via nginx allowlist | Backlog |
| Homepage SSR | Backlog |
| Real AI ratings (not placeholder) | Backlog |
| journald cap | Held for Security hardening |
| Jest TS config | Backlog |
| Implant MCP / paid API | After data quality is solid (license + export + connector) |
| R2 custom domain | Prefer `media.orthoandspinetools.com` over `r2.dev` if needed |
| SES SNS webhook | Deferred - not launch blocker; revisit when digest volume grows |
| IPv6 client IP collapse (infra, root cause of 2026-10-17 429s) | Awaiting Drew approval. All IPv6 visitors and host-local traffic reach nginx as 172.18.0.1 via docker-proxy, so they share one rate-limit bucket. Options: enable IPv6 on the compose network (`enable_ipv6: true` + ULA subnet) so Docker NATs IPv6 with the real source address, or run nginx with `network_mode: host`. Needs a maintenance window (network recreate). |
| Prod backend/.env sets RATE_LIMIT_MAX_REQUESTS=100 | Untracked file baked into the backend image. After PR #11 it only limits writes (reads have their own 600/min bucket). Decide whether to keep 100 or move limits to root `.env` (env_file) so they change without a rebuild. |

---

## 6. Pitfalls

| Pitfall | Detail |
|---------|--------|
| **Disk filled to 100%** | Earlier deploy; now have alert cron at 85% (`scripts/ops/disk-alert.sh`), monthly cleanup cron |
| **docker-compose.prod.yml deleted mid-deploy** | Happened once; always verify file exists before deploy |
| **nginx /methodology location** | Used to exist only as uncommitted server edit; now committed (PR #4) |
| **Unknown URLs get noindex only after JS** | Soft 404s - search engines may index error pages |
| **Never trust simulated score tables** | Use live values from production DB |
| **Orphaned migrate dev process** | Found once on server; always check for running processes |
| **sitemap check skipped in CI** | Requires populated DB; test against production instead |
| **Server SSH config malformed** | Always use `GIT_SSH_COMMAND="ssh -F /dev/null"` |
| **nginx 502 after container recreate** | Must run `--force-recreate nginx` to refresh upstream IPs |
| **Playwright needs Node 20+** | Server system Node may be 18; install Node 20 to `~/.local/node20/bin` (deploy.sh auto-detects) |
| **Playwright Chromium system deps need root** | Run `sudo npx playwright install-deps chromium` once on server |
| **Old deploy.sh ran checks after deploy** | Now fixed: checks gate deploy, auto-rollback on failure |
| **http://localhost on the server is a 301 to the public site** | `curl -sf` treats 301 as success and Playwright followed the redirect, so deploy checks were testing production. deploy.sh now uses `--resolve orthoandspinetools.com:443:127.0.0.1` and Chromium `--host-resolver-rules` (PR #11) |
| **IPv6 visitors share one rate-limit bucket** | docker-proxy rewrites IPv6 sources to 172.18.0.1. Never set a low global limit on read GETs; never point Playwright at the public domain from the server (its traffic lands in the same bucket as real IPv6 users) |
| **Migration history not replayable from an empty DB** | `prisma migrate deploy` fails at add-community migration (users.is_admin missing). CI uses `prisma db push` + `e2e/fixtures/ci-seed.sql` instead |
| **Backend 301s HTTP API calls in production mode** | `security.ts` redirects when X-Forwarded-Proto is not https, so CI nginx must serve HTTPS (self-signed) for the browser to load /api data |

---

## 7. Recently Done

| PR | Title |
|----|-------|
| [#8](https://github.com/drewalbert7/orthoandspinetools/pull/8) | Add automated pre-deploy checks using Playwright |
| [#6](https://github.com/drewalbert7/orthoandspinetools/pull/6) | Remove tracked docker-compose binary |
| [#5](https://github.com/drewalbert7/orthoandspinetools/pull/5) | Add disk usage alert script with webhook support |
| [#4](https://github.com/drewalbert7/orthoandspinetools/pull/4) | Add nginx location block for /implants/methodology |
| [#3](https://github.com/drewalbert7/orthoandspinetools/pull/3) | Rename 'AI score' to 'Directory Score' and add methodology page |
| [#2](https://github.com/drewalbert7/orthoandspinetools/pull/2) | Implant directory data and scoring fixes |
| [#1](https://github.com/drewalbert7/orthoandspinetools/pull/1) | fix(seo): Technical SEO improvements - 404 handling, sitemap cleanup, OG image |

---

## 8. History

This section preserves all historical content from previous todo.md versions. Nothing is deleted.

### Deploy Status Archive

| Date | Status |
|------|--------|
| Oct 15d | Directory Score ost-dir-v2: velocity-first MAUDE peer hazard + facet breakdown; asymmetric penalty; paced recompute |
| Oct 15c | Implant Directory list polish: one-line STG+score, quieter verified check, less meta duplication |
| Oct 15b | Remove Stats from sidebar (keep header link to /stats) |
| Oct 15 | Implant Directory scale hardening: slim list cards, vote aggregation, verified-count cache, browse indexes |
| Oct 14f | Implant Directory + detail mobile layout; dark-mode remaps for slate/score badges/blue panels |
| Oct 14e | Implant share cards: /api/og/implant/:slug + nginx bot rewrite; Cloudflare/Cloudinary 1200x630 OG delivery |
| Oct 14d | STG-only technique PDFs; MAUDE Rising/Top color stability; globe idle spin; QA 31/31; analytics intact |
| Oct 14c | Public /stats + globe; implant comments + Directory Score; page finish; technique PDF guides |
| Oct 14b | All-specialty directory seeds; public review read; admin post+implant edit; analytics to R2 |
| Oct 14 | Implant Directory harden: FTS search, debounce/pagination, ingest/draft, AI SEO detail + .md twins |
| Oct 13 | Implant Directory shell (/implants, 5 spine seeds, member reviews); MAUDE Rising sort |

### Completed Goals Archive

- [x] Brand copy - Tagline "Ortho and Spine Tools - Hunt for the Best" across SEO, index.html, register, llms.txt
- [x] Link previews - Server-side OG for /post/:id, /community/:slug, /user/:username, /implants/:slug, /, /cases, /implants, /maude, /startups, /popular; nginx serve_og_preview map
- [x] Cases - /cases, tagName=Case, backfill script
- [x] Dynamic sitemap - posts, communities, public user profiles
- [x] LLM citing - llms.txt, dynamic llms-full.txt, expanded robots.txt
- [x] Hub SEO - DocumentMeta + JSON-LD on Cases, Popular, Startups, Search; Person schema on profiles
- [x] Real data - Community moderators/rules, public user profiles, post sidebar join state
- [x] Production QA smoke - ./scripts/production-qa-smoke.sh (31/31 incl. OG post image HTTP 200)
- [x] Post link preview images - Fixed Cloudinary OG URLs; Discord/X/iMessage show post images
- [x] Edit post topic tags - Authors can add/remove community tags on /post/:id/edit
- [x] Hetzner backup volume - 20G volume 106016238; Docker log rotation on all prod services
- [x] Physician NPI verification - U.S. CMS registry at signup; international physicianVerificationPending; admin verify
- [x] Legal NPI wording - Privacy Policy + Terms of Service describe NPI collection, CMS lookup, manual intl. review
- [x] Admin pending physician filter - Admin Users Pending intl. review (physicianVerificationPending=true)
- [x] Daily DB backups - 0 2 * * * to Hetzner volume 106016238
- [x] Feed query indexes - posts, comments, post_votes, post_tags indexes for home/community/profile feeds
- [x] Clickable links in posts - remark-gfm autolinks bare URLs; remark-breaks preserves single newlines
- [x] MAUDE implant trends - Public /maude: brand-ranked openFDA chart; Device-Company titles; brand search/trending/synopsis
- [x] MAUDE smart search - Clinical phrases expand to implant brands
- [x] Secret rotation - Rotated production JWT_SECRET + POSTGRES_PASSWORD off compose defaults
- [x] Digest cron hardening - Moved EMAIL_DIGEST_CRON_SECRET out of crontab into scripts/digest-cron.sh
- [x] Dark / light mode - ThemeProvider (ost-theme); Light/Dark/System cycle; FOUC-safe boot; Profile Appearance
- [x] MAUDE brand request - POST /api/maude/brand-request + MaudeBrandRequest table
- [x] Cloudflare R2 media - Available as fallback (MEDIA_PROVIDER=r2)
- [x] Cloudflare Images + Stream - Live MEDIA_PROVIDER=cloudflare with variants
- [x] Reddit-like image sizing - CF delivery variants + server-side sharp pre-resize
- [x] MAUDE ACDF coverage - Clinical concept ACDF / anterior cervical fusion + rollups
- [x] MAUDE brand-request alerts - MAUDE_REQUEST_TO emails admin on new requests
- [x] Mobile UX pass - Opt-in .touch-target; denser header; wrapping actions; shorter policy banner
- [x] Google Search Console - Domain verified; sitemap submitted
- [x] First-party bot + LLM agent traffic - Postgres analytics_bot* tables; UA classification; Admin Bots & agents
- [x] Public Stats page - GET /api/analytics/stats + /globe; GeoIP country; Stats link in header
- [x] Analytics durability - Rules in AGENTS.md + .cursor/rules/analytics-durability.mdc
- [x] Implant Directory shell - Nav under Cases; Postgres implants/implant_images/implant_reviews; 5 spine seeds
- [x] Implant Directory harden + AI SEO search - Search UX, API guards, DB search, Ingest/draft, Images/rights, Discussion, AI SEO
- [x] Implant Directory all subspecialties - Chip filter with All specialties + each community specialty
- [x] Implant Directory smart search - Clinical phrases, FTS/trgm/alias ranking, specialty synonym search_text
- [x] Admin edit - drewalbertmd (isAdmin): edit any post; PATCH implant listings
- [x] DB durability (Cloudflare) - Daily full Postgres to Hetzner volume + R2
- [x] Implant Directory AI scores + media UI - ai_rating 0-10 + summary; single product thumb; detail gallery
- [x] Implant Directory compact filters - Direct-Care-style row on /implants only
- [x] Implant Directory images fill-out - Seed listings have manufacturer product with attribution + licenseNote
- [x] Public Stats - Header Stats to /stats + live globe
- [x] Implant Directory page finish - Hide IFU placeholders; product ogImage + JSON-LD; gallery thumbs link
- [x] Implant Directory technique guides - Surgical/operative technique PDF only; list icon + detail CTA
- [x] MAUDE Rising/Top stable colors - Brand colors/stroke keyed by name so reorder does not jump chart
- [x] Implant Directory pre-growth hardening - Slim payloads, vote tallies, verified-count cache, browse indexes
- [x] Implant Directory Score v2 (ost-dir-v2) - Utility x velocity-first MAUDE hazard; asymmetric penalty; facets

### Backlog Archive

- Scaling - VPS RAM/disk upgrade before ~5k users; Redis for multi-replica rate limits; managed Postgres later
- Link previews - Optional branded og-share.png (1200x630)
- Disk / ops - Cloudflare R2 off-site DB backups done; root disk stays lean via volume backups + Docker log limits
- SEO - Lighthouse / Rich Results; confirm VITE_SITE_URL / PUBLIC_SITE_URL in prod builds
- Admin - SES suppression UI (with SNS webhook); email alert on intl. physician signup (optional)
- Content - More real specialty posts; remove Case tag from non-case posts via edit
- Post media (WIP) - Re-test create-post upload if needed; existing posts display images OK
- Notifications - Vote/mention/moderation triggers (v1 comment/reply shipped)
- R2 production URL - Optional custom domain (e.g. media.orthoandspinetools.com)
- Security follow-ups - Fail startup on default secrets; enable upload virus scanning (ClamAV); rotate CF API token
- Optional - Rich Results Test on home + /post/:id; dedicated 1200x630 og-share.png

### Session Logs Archive

#### Session log (Aug 28-29, 2026 - MAUDE trends)

| Done | Detail |
|------|--------|
| MAUDE page | /maude hub with multi-year openFDA chart (daily/cumulative), zoom/pan, hover highlight |
| Specialty filters | Toggles match communities (Spine, Hip & Knee, Sports, Trauma, etc.) |
| Top brands | Rank by brand_name (top 20); Device-Company titles; instruments/UNK/company-as-brand filtered |
| Search + trending | Live openFDA brand autocomplete; trending by recent vs prior growth |
| Brand synopsis | Click brand for event mix, device/patient problems, recent narrative excerpts |
| Coverage gaps | OR Unknown-specialty classes: disc arthroplasty, spinous spacers, INFUSE/rhBMP, mobile-bearing + UKA knees |
| SKU rollups | Mobi-C, prodisc C/L, M6-C, Simplify, Superion, INFUSE, ATTUNE, iFuse to one commercial product |
| openFDA ops | OPENFDA_API_KEY wired; daily warm cron; GET /api/maude/status |

#### Session log (Jul 2026 - security + review)

| Done | Detail |
|------|--------|
| Secret rotation | Rotated prod JWT_SECRET + POSTGRES_PASSWORD off compose defaults; DB password updated |
| Docs scrubbed | Removed plaintext secure_password_123 from multiple docs |
| Digest cron | Secret moved out of crontab to scripts/digest-cron.sh |
| Augmedics post | X2 headset post created under drewalbertmd |
| Ortho & Spine Jobs post | Platform post with mobile hero + compensation map images |
| Direct Care List post | Platform post with site OG image |
| Post links fixed | MarkdownContent now uses remark-gfm + remark-breaks |
| MAUDE trends page | /maude - daily openFDA adverse-event chart |
| Prod review (Jul 23-25) | All containers healthy; smoke 31/31; backups current; SSL valid; secrets non-default |

#### Session log (Jun 14, 2026 - night)

| Done | Detail |
|------|--------|
| Edit post tags | /post/:id/edit - add/remove community topic tags |
| OG post images | Fixed Cloudinary .auto 404s; Discord/X/iMessage embeds show post images |
| Hetzner volume | 20G volume 106016238 wired for daily backups; Docker log limits |
| Deploy | Backend + frontend live; smoke 31/31 |

#### Session log (Jun 14, 2026 - evening)

| Done | Detail |
|------|--------|
| NPI legal copy | Privacy + Terms: NPI collection, CMS lookup, intl. manual review, badge meaning |
| Admin filter | Users tab: Pending intl. review filter |
| NPI verification | Deployed: migration, register flow, admin badges, /api/auth/npi-check |
| Legal pages | /privacy, /terms, register consent checkbox, sitemap + smoke tests |

#### Session log (Jun 14, 2026)

| Done | Detail |
|------|--------|
| Link previews | Server-side OG for posts, communities, users, implants, home + hubs |
| OG polish | 1200x630 Cloudinary/Cloudflare crops, shorter card descriptions |
| GSC DNS | Google verification TXT on Namecheap |
| GSC live | Domain verified; sitemap submitted |
| Scaling prep | Daily DB backup cron; feed query indexes migration |
| QA | Smoke tests 28/28 |

#### Session log (Jun 8, 2026)

| Done | Detail |
|------|--------|
| Cases backfill | 3 case_study posts tagged; /cases populated |
| Dynamic sitemap | Backend route + nginx proxy; 19 URLs |
| QA tooling | production-qa-smoke.sh, ses-webhook-status.sh |
| TODO trim | Condensed; pushed 8543bd4 |
| Profile UX | Separate Level / Total points; pushed 24f79da |
| Disk fix | docker-disk-check.sh + volume/build cache prune; 18 GB free |

### Ops Quick Reference (preserved)

```bash
./scripts/docker-disk-check.sh report    # disk + Docker usage
./scripts/docker-disk-check.sh cleanup   # safe post-build cleanup
./scripts/production-qa-smoke.sh         # post-deploy smoke tests
./scripts/seo-audit.sh                   # SEO + OG curl checks; optional Lighthouse
./scripts/ses-webhook-status.sh          # SES/SNS env check
./scripts/quick-restart.sh               # safe restart (never docker compose down)
./scripts/database-backup-production.sh  # manual full DB backup
./scripts/database-backup-cron.sh        # cron entrypoint (daily 02:00)
./scripts/analytics-backup.sh            # analytics tables only
./scripts/install-analytics-backup-cron.sh # once: daily 02:15 analytics dump
./scripts/analytics-durability-report.sh # post-change fingerprint + headlines
./scripts/setup-backup-volume.sh         # one-time Hetzner volume backup dir setup
docker compose -f docker-compose.prod.yml exec backend npm run backfill-case-post-tags
```

### Server Reference (preserved)

| Item | Value |
|------|--------|
| Server | dstrad@orthoandspinetools (SSH) |
| Disk | /dev/sda1 38G root; Hetzner volume 106016238 20G at /mnt/HC_Volume_106016238 |
| Repo | ~/orthoandspinetools-main |
| Compose | docker-compose.prod.yml |
| Containers | orthoandspinetools-{postgres,backend,frontend,nginx,bot-analytics} |
| Secrets | .env, .env.cloudinary, Cloudflare CLOUDFLARE_* (never commit); SES vars on server only |
| SSL renew | Cron active: 0 3 1 * * scripts/ssl-renew-cron.sh |
| Disk cleanup | Cron active: 0 4 1 * * scripts/docker-disk-check.sh cleanup |

### Manual QA Checklist (preserved)

1. Home feed - posts from multiple communities
2. Create Post - typing stable; media upload shows on timeline + /post/:id
3. Notifications - comment/reply bell; mark read / dismiss
4. Admin delete - post menu ... from Home and PostDetail
5. Profile - Level and Total points show as separate rows
6. Physician signup QA - U.S. NPI path, international pending path, admin manual verify
7. Password reset - /forgot-password inbox (SES production access confirmed)

---

**Last Updated:** Oct 17, 2026
**Status:** Live - Playwright pre-deploy checks; Directory Score v2; MAUDE facets; Cloudflare Images+Stream

### Original TODO.md (verbatim, pre-restructure 2026-10-16)

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
| **13** | **Implant Directory** | ✅ Page finish + STG; **Score v2** (MAUDE facets); pre-growth harden ✅; catalog growth next; **MCP later** |

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
- [x] **Public Stats page** — `GET /api/analytics/stats` + `/globe`; GeoIP country on new pageviews; Stats link in **header only** (removed from sidebar).
- [x] **Analytics durability** — Rules in `AGENTS.md` + `.cursor/rules/analytics-durability.mdc` + TODO; live data on Postgres volume (not git/deploy); daily `analytics-backup.sh` → Hetzner `…/backups/analytics/` (≥30d); backfill gated by `backfilled_at`.
- [x] **Implant Directory shell** — Nav under Cases → `/implants` + `/implants/:slug`; Postgres `implants` / `implant_images` / `implant_reviews`; 5 spine seeds; directory public.
- [x] **Implant Directory — harden + AI SEO search** (before MCP / big ingest):
  1. **Search UX** — Debounced directory `q` (300ms); page/`pageSize` pagination with real `total`/`totalPages`; specialty + device-class filters.
  2. **API guards** — Rate-limit list/detail/reviews/ingest; public list returns only published|verified.
  3. **DB search** — `search_text` + `pg_trgm` + FTS GIN indexes; alias-aware ranked search (`implantSearch.ts`).
  4. **Ingest / draft** — `POST /api/implants/ingest` + publish (header `x-implant-ingest-secret`); `implant_edit_logs`; draft → published|verified.
  5. **Images / rights** — Ingest accepts product|xray|diagram with required `licenseNote` on product/xray; CF Images pipeline still TODO for bulk rights-cleared assets.
  6. **Discussion** — Upvote/downvote comments (feed-style) fold into proprietary Directory Score (`ost-dir-v2`); legacy star reviews deprecated for scoring.
  7. **AI SEO / discoverability** — Per-listing `/implants/:slug` + `/implants/:slug.md`; MedicalDevice JSON-LD; sitemap + `llms.txt` / `llms-full.txt`.
  8. **MAUDE on profile** — Deep-link + 12‑mo snapshot card on detail.
- [x] **Implant Directory — all subspecialties** — Chip filter with **All specialties** + each community specialty; seed listings per specialty.
- [x] **Implant Directory — smart search** — Clinical phrases (cervical TDR, TKA, pedicle screw, INFUSE…), FTS/trgm/alias ranking, specialty synonym `search_text`, inferred-specialty boost when All.
- [x] **Admin edit** — `drewalbertmd` (`isAdmin`): edit any post; PATCH implant listings + ingest/publish via JWT; audit in `implant_edit_logs`.
- [x] **DB durability (Cloudflare)** — Daily full Postgres → Hetzner volume + **R2** (`scripts/database-backup-production.sh` + `backup-to-r2.js`); analytics dumps also → R2 `…/analytics/`.
- [x] **Implant Directory — AI scores + media UI** — `ai_rating` 0–10 + summary on every listing; single product thumb; detail gallery for product/X-ray/diagram; browse sorted by AI score.
- [x] **Implant Directory — compact filters** — Direct-Care-style row (specialty / class / Verified / sort) on `/implants` only; no chip sprawl.
- [x] **Implant Directory — images fill-out** — Seed listings have manufacturer product (and where available XR/diagram) on Cloudflare Images with attribution + `licenseNote`; list/detail `productImage` / gallery live for all 15 seeds.
- [x] **Public Stats** — Header **Stats** → `/stats` + live globe (starts on North America, idle spin); human pageviews / geo; bots stay separate; not duplicated in sidebar.
- [x] **Implant Directory — page finish** — Hide IFU placeholders; product `ogImage` + JSON-LD; gallery thumbs link; related strip; MAUDE 12‑mo card; loading skeleton; XR lightbox; Verified disabled until count > 0; directory copy softened (X-ray not promised on every profile).
- [x] **Implant Directory — technique guides** — Surgical/operative technique PDF only (not brochures): list icon left of score + detail CTA; direct `.pdf` validated on ingest/admin; 6 STG seeds (INFUSE cleared — FDA URL 403).
- [x] **MAUDE Rising/Top stable colors** — Brand colors/stroke weight keyed by name so Rising ↔ Top reorder does not jump the chart.
- [x] **Implant Directory — pre-growth hardening** — Slim list/related payloads (product thumb only); vote tallies via `groupBy`; verified-count TTL cache; browse indexes `(status,specialty,ai_rating)` + company + verified partial; anonymous `Cache-Control` on list/detail; dedicated `IMPLANT_INGEST_SECRET` only; admin `GET /api/implants/admin/drafts`.
- [x] **Implant Directory — Score v2 (ost-dir-v2)** — Utility (listing + discussion) × velocity-first MAUDE hazard (flat/declining stay quiet; rising outliers elevated); asymmetric penalty; facets on detail; paced specialty warm for recompute; admin `POST /api/implants/admin/recompute-scores`.
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
- [x] **Latest deploy (Oct 15b)** — Remove Stats from sidebar (keep header link to `/stats`)
- [x] **Latest deploy (Oct 15c)** — Implant Directory list polish: one-line STG+score, quieter verified check, less meta duplication, contain thumbs, hide empty comment/page chrome
- [x] **Latest deploy (Oct 15d)** — Directory Score **ost-dir-v2**: velocity-first MAUDE peer hazard + facet breakdown on implant pages; asymmetric penalty; paced recompute; admin recompute-scores
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

1. **Implant Directory catalog growth** — Pre-growth hardening ✅; Score v2 (MAUDE facets) ✅; next: more systems via Grokbot ingest; extra XR/diagram; more technique PDFs
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
