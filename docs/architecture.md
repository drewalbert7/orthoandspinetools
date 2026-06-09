# Architecture Overview

OrthoAndSpineTools is a medical-focused community platform (Reddit-style posts, comments, voting, and specialty communities).

## System diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    orthoandspinetools.com                    │
├─────────────────────────────────────────────────────────────┤
│  Nginx (TLS, rate limits, OG bot routing)                    │
├──────────────────────┬──────────────────────────────────────┤
│  Frontend            │  Backend                              │
│  React + TypeScript  │  Node.js + Express + TypeScript       │
│  Vite + Tailwind     │  JWT auth, Prisma ORM                 │
│  React Query         │  Cloudinary uploads, SES email        │
├──────────────────────┴──────────────────────────────────────┤
│  PostgreSQL                                                 │
└─────────────────────────────────────────────────────────────┘
```

## Repository layout

| Path | Role |
|------|------|
| `frontend/` | SPA (React Router, pages, components, `apiService`) |
| `backend/` | REST API (`/api/*`), Prisma schema, migrations |
| `nginx/` | Production reverse proxy config and TLS cert paths |
| `docker-compose.prod.yml` | Production stack (postgres, backend, frontend, nginx) |

## Key flows

- **Auth** — JWT in `Authorization` header; registration, login, profile, optional email verification and password reset (Amazon SES when configured).
- **Content** — Posts and comments per community; voting; tags (e.g. Case, startup-related); attachments via Cloudinary.
- **Moderation** — Site admins (`isAdmin`) and community moderators; admin dashboard at `/admin`.
- **Notifications** — In-app bell for comments/replies (and related API routes).
- **SEO / sharing** — Client `DocumentMeta` + JSON-LD; server-rendered OG HTML for link-preview bots on `/post/:id`.

## Deployment

Production runs via Docker Compose. See [WHAT_TO_DO.md](WHAT_TO_DO.md), [PRODUCTION_SCALING.md](PRODUCTION_SCALING.md), and [deployment.md](deployment.md).

## Security notes

- TLS terminated at nginx (`nginx/ssl/certs/`).
- Rate limiting on API and login routes.
- No patient-identifiable data in product design; audit logging for sensitive actions.
- Secrets only in server `.env` files (never committed).
