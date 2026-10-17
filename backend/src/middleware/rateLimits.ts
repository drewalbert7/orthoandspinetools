import type { Request, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

/**
 * Global API rate limiting.
 *
 * Background (Oct 2026 incident): the old single global limiter counted every
 * request (reads, analytics beacons, writes) against one bucket of
 * RATE_LIMIT_MAX_REQUESTS (100 per 15 min in prod). Behind docker-proxy, every
 * IPv6 visitor and every host-local request (deploy checks, monitors) reaches
 * nginx as the docker bridge gateway (172.18.0.1), so they all shared that one
 * bucket and normal browsing returned 429 on /api/posts and /api/implants.
 *
 * Now:
 *  - Safe reads (GET/HEAD/OPTIONS) use a separate, generous per-minute bucket.
 *  - Writes keep the strict RATE_LIMIT_MAX_REQUESTS bucket.
 *  - Endpoints that already have their own dedicated limiter are skipped here
 *    (analytics beacons, health, OG previews, SES webhooks, sitemap).
 *  - Auth endpoints keep their own strict limiters in routes/auth.ts and the
 *    nginx zone=login limit; nothing here loosens them.
 */

const DEFAULT_SKIP_EXACT = new Set<string>([
  '/api/health',
  '/health',
  '/sitemap.xml',
  '/llms-full.txt',
]);

const DEFAULT_SKIP_PREFIXES = [
  '/api/og/',
  '/api/ses/events',
  // Has its own collectLimiter / publicStatsLimiter in routes/analytics.ts.
  '/api/analytics/',
];

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type Env = Record<string, string | undefined>;

function intFromEnv(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Parse TRUST_PROXY into a value for app.set('trust proxy', ...).
 * Default 1: exactly one proxy hop (the nginx container) sits in front of the
 * backend, so req.ip is the left-most address nginx appended to X-Forwarded-For.
 * Never default to `true`: that lets any client spoof X-Forwarded-For and pick
 * its own rate-limit bucket.
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw.trim() === '') return 1;
  const v = raw.trim();
  if (v === 'false') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number.parseInt(v, 10);
  return v; // e.g. "loopback, uniquelocal"
}

export function isSkippedPath(path: string): boolean {
  if (DEFAULT_SKIP_EXACT.has(path)) return true;
  return DEFAULT_SKIP_PREFIXES.some((p) => path.startsWith(p));
}

export function isReadRequest(req: Pick<Request, 'method'>): boolean {
  return READ_METHODS.has((req.method || '').toUpperCase());
}

export interface ApiLimiterConfig {
  readWindowMs: number;
  readMax: number;
  writeWindowMs: number;
  writeMax: number;
}

export function resolveApiLimiterConfig(env: Env = process.env): ApiLimiterConfig {
  return {
    readWindowMs: intFromEnv(env, 'READ_RATE_LIMIT_WINDOW_MS', 60_000),
    readMax: intFromEnv(env, 'READ_RATE_LIMIT_MAX', 600),
    writeWindowMs: intFromEnv(env, 'RATE_LIMIT_WINDOW_MS', 900_000),
    writeMax: intFromEnv(env, 'RATE_LIMIT_MAX_REQUESTS', 300),
  };
}

export function createApiLimiters(env: Env = process.env): {
  readLimiter: RequestHandler;
  writeLimiter: RequestHandler;
  config: ApiLimiterConfig;
} {
  const config = resolveApiLimiterConfig(env);

  const readLimiter = rateLimit({
    windowMs: config.readWindowMs,
    max: config.readMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests from this IP, please try again shortly.' },
    skip: (req) => !isReadRequest(req) || isSkippedPath(req.path),
  });

  const writeLimiter = rateLimit({
    windowMs: config.writeWindowMs,
    max: config.writeMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests from this IP, please try again later.' },
    skip: (req) => isReadRequest(req) || isSkippedPath(req.path),
  });

  return { readLimiter, writeLimiter, config };
}
