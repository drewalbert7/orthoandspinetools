/**
 * Run: npm run test:ratelimit  (node:test via tsx, no DB needed)
 *
 * Proves:
 *  1. Behind one proxy hop, two clients with different X-Forwarded-For values
 *     get separate buckets (one client exhausting its limit does not 429 another).
 *  2. Normal browsing (many page loads, each firing several API reads plus an
 *     analytics beacon) never hits 429, even with the prod write limit of 100/15min.
 *  3. Writes are still strictly limited.
 *  4. A client cannot escape its bucket by forging X-Forwarded-For (trust proxy = 1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { createApiLimiters, parseTrustProxy } from './rateLimits';

const PROD_LIKE_ENV = {
  RATE_LIMIT_WINDOW_MS: '900000',
  RATE_LIMIT_MAX_REQUESTS: '100',
};

function buildApp(env: Record<string, string | undefined>) {
  const app = express();
  app.set('trust proxy', parseTrustProxy(env.TRUST_PROXY));
  const { readLimiter, writeLimiter } = createApiLimiters(env);
  app.use(readLimiter);
  app.use(writeLimiter);
  const ok = (_req: express.Request, res: express.Response) => {
    res.json({ ok: true, ip: _req.ip });
  };
  app.get('/api/posts', ok);
  app.get('/api/communities', ok);
  app.get('/api/implants', ok);
  app.get('/api/implants/:slug', ok);
  app.post('/api/posts', ok);
  app.post('/api/analytics/pageview', ok);
  app.get('/api/whoami', ok);
  return app;
}

async function withServer<T>(app: express.Express, fn: (base: string) => Promise<T>): Promise<T> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// nginx appends $remote_addr to X-Forwarded-For; simulate that single hop.
function viaNginx(clientIp: string, forgedPrefix?: string): Record<string, string> {
  const xff = forgedPrefix ? `${forgedPrefix}, ${clientIp}` : clientIp;
  return { 'X-Forwarded-For': xff, 'Content-Type': 'application/json' };
}

test('parseTrustProxy defaults to exactly one hop and never to true', () => {
  assert.equal(parseTrustProxy(undefined), 1);
  assert.equal(parseTrustProxy(''), 1);
  assert.equal(parseTrustProxy('2'), 2);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('loopback, uniquelocal'), 'loopback, uniquelocal');
});

test('req.ip is the client address nginx forwarded, not the proxy', async () => {
  await withServer(buildApp(PROD_LIKE_ENV), async (base) => {
    const r = await fetch(`${base}/api/whoami`, { headers: viaNginx('203.0.113.7') });
    const body = (await r.json()) as { ip: string };
    assert.equal(body.ip, '203.0.113.7');
  });
});

test('two different X-Forwarded-For clients get separate write buckets', async () => {
  const env = { ...PROD_LIKE_ENV, RATE_LIMIT_MAX_REQUESTS: '5' };
  await withServer(buildApp(env), async (base) => {
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${base}/api/posts`, { method: 'POST', headers: viaNginx('198.51.100.1'), body: '{}' });
      assert.equal(r.status, 200, `client A write ${i + 1} should pass`);
    }
    const blocked = await fetch(`${base}/api/posts`, { method: 'POST', headers: viaNginx('198.51.100.1'), body: '{}' });
    assert.equal(blocked.status, 429, 'client A 6th write should be limited');

    const other = await fetch(`${base}/api/posts`, { method: 'POST', headers: viaNginx('198.51.100.2'), body: '{}' });
    assert.equal(other.status, 200, 'client B must not share client A bucket');
  });
});

test('two different X-Forwarded-For clients get separate read buckets', async () => {
  const env = { ...PROD_LIKE_ENV, READ_RATE_LIMIT_MAX: '10' };
  await withServer(buildApp(env), async (base) => {
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${base}/api/posts`, { headers: viaNginx('2001:db8::a') });
      assert.equal(r.status, 200);
    }
    assert.equal((await fetch(`${base}/api/posts`, { headers: viaNginx('2001:db8::a') })).status, 429);
    assert.equal((await fetch(`${base}/api/posts`, { headers: viaNginx('2001:db8:1::b') })).status, 200);
  });
});

test('forging X-Forwarded-For does not give a client a fresh bucket', async () => {
  const env = { ...PROD_LIKE_ENV, RATE_LIMIT_MAX_REQUESTS: '3' };
  await withServer(buildApp(env), async (base) => {
    for (let i = 0; i < 3; i++) {
      await fetch(`${base}/api/posts`, { method: 'POST', headers: viaNginx('192.0.2.50', `10.0.0.${i}`), body: '{}' });
    }
    const r = await fetch(`${base}/api/posts`, { method: 'POST', headers: viaNginx('192.0.2.50', '10.9.9.9'), body: '{}' });
    assert.equal(r.status, 429);
  });
});

test('normal browsing of 60 page loads from one IP never returns 429 with prod write limit', async () => {
  // Each page load: posts feed + communities sidebar + implant list + one implant detail + analytics beacon.
  // 60 loads = 300 requests, 3x the old shared 100/15min bucket that caused the outage.
  await withServer(buildApp(PROD_LIKE_ENV), async (base) => {
    const statuses: number[] = [];
    for (let i = 0; i < 60; i++) {
      const h = viaNginx('172.18.0.1'); // worst case: every IPv6 visitor collapsed to the docker gateway
      const rs = await Promise.all([
        fetch(`${base}/api/posts?limit=20&sort=newest`, { headers: h }),
        fetch(`${base}/api/communities`, { headers: h }),
        fetch(`${base}/api/implants`, { headers: h }),
        fetch(`${base}/api/implants/prodisc-c`, { headers: h }),
        fetch(`${base}/api/analytics/pageview`, { method: 'POST', headers: h, body: '{"path":"/"}' }),
      ]);
      statuses.push(...rs.map((r) => r.status));
    }
    const limited = statuses.filter((s) => s === 429).length;
    assert.equal(limited, 0, `expected no 429 during normal browsing, got ${limited}`);
  });
});
