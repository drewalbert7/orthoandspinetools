# Deployment Guide

Production deployment for the monorepo at `https://github.com/drewalbert7/orthoandspinetools` (this repository: `backend/`, `frontend/`, `nginx/`).

## Prerequisites

- Docker and Docker Compose v2
- Domain DNS pointing to the server (`orthoandspinetools.com`, optional `www`)
- `.env` and `.env.cloudinary` on the server (see `.env.example` — do not commit secrets)

## Production stack

| Service | Image / build | Notes |
|---------|----------------|-------|
| `postgres` | `postgres:15-alpine` | Persistent volume `postgres_data` |
| `backend` | Build `backend/Dockerfile` | Port 3001 internal |
| `frontend` | Build `frontend/Dockerfile` | Static app on port 3000 internal |
| `nginx` | `nginx:alpine` | Ports 80/443, TLS certs under `nginx/ssl/certs/` |

Compose file: **`docker-compose.prod.yml`**

## First-time / routine deploy

On the server:

```bash
cd ~/orthoandspinetools-main
git pull origin main
docker compose -f docker-compose.prod.yml build --no-cache backend frontend
docker compose -f docker-compose.prod.yml up -d backend frontend nginx
```

After Prisma schema changes:

```bash
docker compose -f docker-compose.prod.yml exec backend npm run db:deploy
```

If only `nginx/nginx.conf` changed:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
# or: docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

## Environment

- **`DATABASE_URL`** — Postgres URL with pool params (see `docker-compose.prod.yml`).
- **`JWT_SECRET`**, **`POSTGRES_PASSWORD`** — Strong values in `.env`.
- **`PUBLIC_SITE_URL`** — Public origin for OG links and emails (e.g. `https://orthoandspinetools.com`).
- **`VITE_SITE_URL`** — Set at frontend **build** time for canonical URLs / JSON-LD.
- **Cloudinary** — `.env.cloudinary` for media uploads.
- **Amazon SES** (optional) — `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_REGION`, `EMAIL_FROM` for transactional mail.

### Where the backend's environment comes from (read this before editing any .env)

- **The ROOT `.env` is the source of truth.** `docker-compose.prod.yml` loads it twice: `env_file: .env` (every
  line becomes a container variable) and `${VAR}` interpolation in `environment:`. A value under `environment:`
  wins over the same name from `env_file`.
- **`JWT_SECRET`**: the live value is the ROOT `.env` `JWT_SECRET`, passed as `environment: JWT_SECRET: ${JWT_SECRET}`.
  It was rotated on prod on Oct 17, 2026. `backend/.env` also has a `JWT_SECRET` line: it is stale and never used
  (the compose value overrides it). Rotate only the ROOT `.env`, then recreate backend.
- **`backend/.env` is not used at runtime.** `backend/.dockerignore` and `frontend/.dockerignore` exclude `.env`
  and `.env.*`, so no env file is baked into an image (before this, `backend/.env` ended up at `/app/.env`, and
  `dotenv` read it only for names compose had not set). CI checks this (`scripts/tests/dockerignore-env.test.sh`
  and the "Built images carry no .env file" step).
- `DATABASE_URL` for the app is built in compose from `OST_APP_DB_PASSWORD` (role `ost_app`); the superuser
  `POSTGRES_PASSWORD` is blanked inside the app containers. Migrations use `MIGRATOR_DATABASE_URL` from
  `/etc/ost-backup/migrator.env`, never `.env` (see `docs/db-safety/RUNBOOK.md`).
- `SESSION_SECRET` and `ENCRYPTION_KEY` were never read by the code and are removed from `backend/env.example`.
  Delete those lines from the server `.env` files only after this change is deployed.

## SSL (Let's Encrypt)

Certs used by nginx: `nginx/ssl/certs/fullchain.pem` and `privkey.pem`.

Renew and reload:

```bash
./update-ssl-certs.sh
```

**Automated renewal** (monthly, 03:00 on the 1st):

```bash
./scripts/setup-ssl-renewal-cron.sh setup   # install
./scripts/setup-ssl-renewal-cron.sh show    # verify
# logs/ssl-renew-cron.log
```

Or manually:

```bash
mkdir -p nginx/ssl/certbot nginx/ssl/certs
docker run --rm \
  -v "$(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt" \
  -v "$(pwd)/nginx/ssl/certbot:/var/www/certbot" \
  certbot/certbot certonly --webroot --webroot-path=/var/www/certbot \
  --email admin@orthoandspinetools.com --agree-tos --no-eff-email \
  -d orthoandspinetools.com -d www.orthoandspinetools.com

docker run --rm \
  -v "$(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt" \
  -v "$(pwd)/nginx/ssl/certs:/certs" \
  alpine sh -c "cp /etc/letsencrypt/live/orthoandspinetools.com/fullchain.pem /certs/ && cp /etc/letsencrypt/live/orthoandspinetools.com/privkey.pem /certs/"

docker compose -f docker-compose.prod.yml exec nginx nginx -t
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

Nginx must serve `/.well-known/acme-challenge/` from `/var/www/certbot` (see `docker-compose.prod.yml` volume).

## Post-deploy checks

1. `curl -s https://orthoandspinetools.com/api/health`
2. Home feed, create post, login
3. `docker compose -f docker-compose.prod.yml ps` — all healthy

Full QA checklist: **`todo.md`** → **Production QA**.

## Safe vs dangerous commands

| Safe | Dangerous |
|------|-----------|
| `docker compose -f docker-compose.prod.yml restart <service>` | `docker compose down -v` (deletes DB volume) |
| `up -d` | `docker volume rm` on postgres data |

## More docs

- [WHAT_TO_DO.md](WHAT_TO_DO.md) — day-to-day ops
- [PRODUCTION_SCALING.md](PRODUCTION_SCALING.md) — pooling and scaling
- [todo.md](../todo.md) — current priorities and deploy facts
