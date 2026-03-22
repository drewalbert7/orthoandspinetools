# Production Deployment & Scalability

This guide describes how to deploy OrthoAndSpineTools reliably and scale as traffic grows.

## 1. Deployment checklist

### Before first production deploy

| Step | Action |
|------|--------|
| Secrets | Set strong `JWT_SECRET` and `POSTGRES_PASSWORD` in `.env` (never commit real values). |
| Database URL | Use connection pool params on `DATABASE_URL` (see below). |
| CORS | Set `CORS_ORIGINS` if you use extra domains; default includes orthoandspinetools.com. |
| Cloudinary | Configure `.env.cloudinary` for media uploads. |
| SSL | Place certs under `nginx/ssl/certs/` and reload nginx after updates. |
| Backups | Schedule `./scripts/database-backup-production.sh` (cron). |
| Build | `docker compose -f docker-compose.prod.yml build --no-cache` then `up -d`. |

### Safe operations

- `docker compose -f docker-compose.prod.yml up -d` — preserves volumes.
- `docker compose -f docker-compose.prod.yml restart <service>` — no data loss.

### Dangerous operations (avoid on production)

- `docker compose down -v` — **deletes named volumes** including Postgres data.
- `docker volume rm` on the Postgres volume.
- Raw SQL `DROP DATABASE` / `TRUNCATE` without backup.

---

## 2. Connection pooling (Prisma / PostgreSQL)

Each Node process uses a Prisma connection pool. Limit connections so multiple app instances or deploys do not exhaust Postgres (`max_connections` defaults ~100).

**Recommended `DATABASE_URL` query parameters:**

```
postgresql://USER:PASSWORD@HOST:5432/orthoandspinetools?connection_limit=10&pool_timeout=20
```

- **`connection_limit`**: Max connections per Node instance (e.g. 5–15 per replica).
- **`pool_timeout`**: Seconds to wait for a free connection.

**Rule of thumb:** `(connection_limit × number of backend containers) + admin overhead < PostgreSQL max_connections`.

To raise Postgres limits on a dedicated server, tune `max_connections` and memory in `postgresql.conf` or via custom `command` in Compose (advanced).

---

## 3. Vertical scaling (single server)

1. **More CPU/RAM** on the host.
2. **Postgres**: `shm_size` is set in `docker-compose.prod.yml` for shared memory; increase if you tune `shared_buffers`.
3. **Nginx**: `worker_processes auto` and higher `worker_connections` (see `nginx/nginx.conf`).
4. **Node**: Optional `NODE_OPTIONS=--max-old-space-size=2048` for large payloads.

---

## 4. Horizontal scaling (multiple API instances)

1. Run **multiple backend containers** with the **same** `DATABASE_URL` and JWT secrets.
2. Put **nginx** in front with an `upstream` block listing each backend:

```nginx
upstream backend {
    least_conn;
    server backend_1:3001;
    server backend_2:3001;
    keepalive 32;
}
```

3. Lower **per-instance** `connection_limit` in `DATABASE_URL` so total DB connections stay safe.
4. **Sticky sessions** are not required for this API (JWT is stateless); ensure all instances share the same `JWT_SECRET`.
5. **Uploads**: Use shared storage (e.g. NFS, S3, or only Cloudinary URLs) if more than one backend handles uploads.

See `docker-compose.scale.example.yml` for a commented pattern (Docker Compose / Swarm / Kubernetes will differ).

---

## 5. Caching & CDN

- **Static assets**: Vite build; nginx caches immutable assets (`Cache-Control: public, immutable`).
- **API**: Add Redis later for sessions/rate limits if you move beyond in-memory limits.
- **Images**: Cloudinary already offloads heavy media.

---

## 6. Health checks & orchestration

- **Backend**: `GET /api/health` (includes DB check).
- **Docker**: `docker-compose.prod.yml` defines healthchecks for `postgres` and `backend`.
- Use these with Docker Swarm, Kubernetes, or load balancer health probes.

---

## 7. Monitoring

- Logs: `docker compose -f docker-compose.prod.yml logs -f backend nginx`
- Metrics: Consider Prometheus + Grafana or a hosted APM later.
- Alerts: Disk space, container restarts, 5xx rate, DB connection errors.

---

## 8. Security (deployment)

- TLS termination at nginx; HSTS enabled.
- Rate limits: nginx (`limit_req`) + Express rate limiter.
- Rotate JWT and DB passwords periodically.
- Restrict SSH and firewall to required ports (80, 443).

---

## 9. Quick reference commands

```bash
# Production up
docker compose -f docker-compose.prod.yml up -d

# Rebuild after code change
docker compose -f docker-compose.prod.yml build backend frontend
docker compose -f docker-compose.prod.yml up -d backend frontend

# Reload nginx only (e.g. after cert update)
docker compose -f docker-compose.prod.yml exec nginx nginx -t && \
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

# Backup DB
./scripts/database-backup-production.sh
```

---

## Related files

- `docker-compose.prod.yml` — production stack
- `docker-compose.scale.example.yml` — multi-backend example
- `.env.example` — environment template
- `nginx/nginx.conf` — reverse proxy and rate limits
