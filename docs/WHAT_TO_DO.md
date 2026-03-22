# What you need to do (plain English)

The **scaling** docs (`PRODUCTION_SCALING.md`) are **optional improvements** for when you have lots of traffic or multiple servers. You do **not** have to do everything there to run the site.

## To keep the site running day to day

1. **Don’t delete the database by accident**
   - Avoid: `docker compose down -v` (the `-v` removes data).
   - Normal restarts are fine: `docker compose -f docker-compose.prod.yml restart`.

2. **After you change SSL certificate files** on disk, reload nginx:
   ```bash
   docker compose -f docker-compose.prod.yml exec nginx nginx -t
   docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
   ```

3. **Backups** (recommended on a schedule, e.g. weekly):
   ```bash
   ./scripts/database-backup-production.sh
   ```

That’s the minimum “don’t break production” list.

---

## When you deploy new code

1. On the server, in the project folder:
   ```bash
   docker compose -f docker-compose.prod.yml build backend frontend
   docker compose -f docker-compose.prod.yml up -d
   ```

2. Check that containers are healthy:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```

---

## Secrets and config (one-time or when rotating)

- Copy `.env.example` to `.env` and set a **strong** `POSTGRES_PASSWORD` and **strong** `JWT_SECRET`.
- Keep `.env` out of git (never commit real passwords).
- Cloudinary: keep using `.env.cloudinary` for image uploads if you use that feature.

---

## When you actually need the “scaling” guide

Read `docs/PRODUCTION_SCALING.md` only if you:

- Run **more than one** API server behind nginx, or  
- Hit **database connection** limits, or  
- Plan **monitoring / backups** in detail.

Otherwise, ignore it until you need it.
