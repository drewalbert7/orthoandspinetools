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
