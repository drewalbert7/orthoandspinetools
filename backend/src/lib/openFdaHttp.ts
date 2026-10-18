/**
 * Shared openFDA HTTP client for every api.fda.gov endpoint we read
 * (device/event, device/enforcement, device/recall).
 *
 * Key handling:
 * - OPENFDA_API_KEY set: the key is sent. If openFDA rejects the key (403), the request
 *   is retried once without it, so a bad key degrades to keyless limits instead of failing.
 * - No key: requests go out keyless. openFDA allows about 240 requests per minute and
 *   1000 per day per IP without a key, and rejects count queries with limit=1000 unless a
 *   key is sent (the 403 "No api_key was supplied" we saw locally). Keyless count limits
 *   are clamped to 999.
 *
 * Requests are serialized with a minimum gap (polite pacing) and cached in memory. When
 * OPENFDA_CACHE_DIR is set (local dev), responses are also cached on disk so repeated
 * local runs do not hit openFDA again.
 *
 * publicOpenFdaUrl() builds the citation URL shown to readers. It never contains a key.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger';

export type OpenFdaEndpoint = 'event' | 'enforcement' | 'recall';

export type OpenFdaJson = {
  meta?: { last_updated?: string; disclaimer?: string; results?: { total?: number } };
  results?: Array<Record<string, unknown>>;
  error?: { code?: string; message?: string };
};

export type OpenFdaResponse = {
  status: number;
  json: OpenFdaJson;
  /** Citation URL without any api_key. */
  url: string;
  /** ISO time the response was fetched from openFDA (cache hits keep the original time). */
  fetchedAt: string;
};

/** openFDA rejects count limit=1000 without a key; 999 is the keyless maximum. */
export const KEYLESS_MAX_COUNT_LIMIT = 999;
const KEYED_MAX_LIMIT = 1000;
const MEMORY_TTL_MS = 12 * 60 * 60 * 1000;
const DISK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const memory = new Map<string, { expiresAt: number; value: OpenFdaResponse }>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

export function openFdaApiKey(): string | null {
  return process.env.OPENFDA_API_KEY?.trim() || null;
}

/** Minimum gap between requests: keyless 300 ms (about 200/min, under the 240/min limit). */
function minGapMs(hasKey: boolean): number {
  return hasKey ? 80 : 300;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Clamp the limit param to what openFDA accepts for this key state. */
export function effectiveParams(
  params: Record<string, string>,
  hasKey: boolean
): Record<string, string> {
  const out = { ...params };
  if (out.limit) {
    const n = Number(out.limit);
    const max = hasKey ? KEYED_MAX_LIMIT : KEYLESS_MAX_COUNT_LIMIT;
    if (Number.isFinite(n) && n > max) out.limit = String(max);
  }
  return out;
}

/** Public citation URL (no api_key, ever). */
export function publicOpenFdaUrl(endpoint: OpenFdaEndpoint, params: Record<string, string>): string {
  const url = new URL(`https://api.fda.gov/device/${endpoint}.json`);
  for (const [k, v] of Object.entries(params)) {
    if (k === 'api_key') continue;
    url.searchParams.set(k, v);
  }
  return url.toString();
}

function diskPath(cacheKey: string): string | null {
  const dir = process.env.OPENFDA_CACHE_DIR?.trim();
  if (!dir) return null;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `${createHash('sha1').update(cacheKey).digest('hex')}.json`);
}

function readDisk(cacheKey: string): OpenFdaResponse | null {
  const p = diskPath(cacheKey);
  if (!p || !existsSync(p)) return null;
  try {
    const v = JSON.parse(readFileSync(p, 'utf8')) as OpenFdaResponse;
    if (Date.now() - Date.parse(v.fetchedAt) > DISK_TTL_MS) return null;
    return v;
  } catch {
    return null;
  }
}

function writeDisk(cacheKey: string, value: OpenFdaResponse): void {
  const p = diskPath(cacheKey);
  if (!p) return;
  try {
    writeFileSync(p, JSON.stringify(value));
  } catch {
    /* cache is best effort */
  }
}

async function paced<T>(hasKey: boolean, fn: () => Promise<T>): Promise<T> {
  const run: Promise<T> = queue.then(async (): Promise<T> => {
    const wait = lastRequestAt + minGapMs(hasKey) - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch((): undefined => undefined);
  return run;
}

async function fetchOnce(
  endpoint: OpenFdaEndpoint,
  params: Record<string, string>,
  key: string | null
): Promise<{ status: number; json: OpenFdaJson }> {
  const url = new URL(`https://api.fda.gov/device/${endpoint}.json`);
  for (const [k, v] of Object.entries(effectiveParams(params, Boolean(key)))) url.searchParams.set(k, v);
  if (key) url.searchParams.set('api_key', key);
  const res = await paced(Boolean(key), () =>
    fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(35000) })
  );
  const json = (await res.json().catch(() => ({}))) as OpenFdaJson;
  return { status: res.status, json };
}

/**
 * GET an openFDA device endpoint with keyless fallback, retries on 429/5xx, pacing and cache.
 * 404 NOT_FOUND (no matching records) is a normal answer, not an error.
 */
export async function openFdaFetch(
  endpoint: OpenFdaEndpoint,
  params: Record<string, string>,
  options: { memoryCache?: boolean } = {}
): Promise<OpenFdaResponse> {
  const useMemory = options.memoryCache !== false;
  let key = openFdaApiKey();
  const citeParams = effectiveParams(params, Boolean(key));
  const cacheKey = `${endpoint}|${JSON.stringify(effectiveParams(params, false))}`;
  const hit = memory.get(cacheKey);
  if (useMemory && hit && hit.expiresAt > Date.now()) return hit.value;
  const disk = readDisk(cacheKey);
  if (disk) {
    if (useMemory) memory.set(cacheKey, { expiresAt: Date.now() + MEMORY_TTL_MS, value: disk });
    return disk;
  }

  let status = 0;
  let json: OpenFdaJson = {};
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    ({ status, json } = await fetchOnce(endpoint, params, key));
    if (status === 403 && key) {
      logger.warn('openFDA rejected the API key; retrying keyless', { code: json.error?.code });
      key = null;
      ({ status, json } = await fetchOnce(endpoint, params, null));
    }
    const retryable = status === 429 || status === 500 || status === 502 || status === 503;
    if (!retryable || attempt === 3) break;
    await sleep(status === 429 ? 2000 * attempt : 500 * attempt * attempt);
  }

  const value: OpenFdaResponse = {
    status,
    json,
    url: publicOpenFdaUrl(endpoint, key ? citeParams : effectiveParams(params, false)),
    fetchedAt: new Date().toISOString(),
  };
  const cacheable = status < 400 || status === 404;
  if (cacheable) {
    if (useMemory) memory.set(cacheKey, { expiresAt: Date.now() + MEMORY_TTL_MS, value });
    writeDisk(cacheKey, value);
  }
  return value;
}

export function clearOpenFdaHttpCache(): void {
  memory.clear();
}
