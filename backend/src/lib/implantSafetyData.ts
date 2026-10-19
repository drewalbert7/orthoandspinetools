/**
 * Pulls the inputs for the Reported safety signal (FDA MAUDE) from openFDA:
 * device/event (severity counts, breaks, product codes, monthly trend, category baseline),
 * device/enforcement and device/recall (recalls with FDA class).
 *
 * Every query is recorded as a cited source URL (api.fda.gov, never with an api_key).
 * Requests go through openFdaHttp (keyless fallback, pacing, cache).
 */
import { maudeBrandWindowSearch } from './openFdaMaude';
import { openFdaFetch, type OpenFdaResponse } from './openFdaHttp';
import {
  RECALL_LOOKBACK_MONTHS,
  RECALL_FACTORS,
  SAFETY_WINDOW_DAYS,
  type CategoryCode,
  type RecallClass,
  type RecallEvent,
  type SafetySignalInput,
  type SafetySource,
  type SeverityCounts,
} from './implantSafetySignal';

export class OpenFdaUnavailableError extends Error {}

const BREAK_CLAUSE = '(product_problems:"Break" OR product_problems:"Fracture")';

type Ctx = { sources: SafetySource[]; fetchedAt: string[] };

async function get(
  ctx: Ctx,
  label: string,
  endpoint: 'event' | 'enforcement' | 'recall',
  params: Record<string, string>
): Promise<OpenFdaResponse> {
  const res = await openFdaFetch(endpoint, params);
  if (res.status >= 400 && res.status !== 404) {
    throw new OpenFdaUnavailableError(
      `openFDA ${endpoint} returned ${res.status}${res.json.error?.message ? `: ${res.json.error.message}` : ''}`
    );
  }
  ctx.sources.push({ label, url: res.url });
  ctx.fetchedAt.push(res.fetchedAt);
  return res;
}

function terms(res: OpenFdaResponse): Array<{ term: string; count: number }> {
  if (res.status === 404) return [];
  return (res.json.results || [])
    .map((r) => ({
      // Date counts come back as { time, count }; term counts as { term, count }.
      term: typeof r.term === 'string' ? r.term.trim() : typeof r.time === 'string' ? r.time.trim() : '',
      count: typeof r.count === 'number' ? r.count : 0,
    }))
    .filter((t) => t.term && t.count > 0);
}

function total(res: OpenFdaResponse): number {
  if (res.status === 404) return 0;
  return res.json.meta?.results?.total ?? 0;
}

/** Map MAUDE event_type terms onto death / injury / malfunction / other. */
export function severityFromEventTypes(rows: Array<{ term: string; count: number }>, breaks: number): SeverityCounts {
  const c: SeverityCounts = { death: 0, injury: 0, malfunction: 0, other: 0, total: 0, breaks };
  for (const { term, count } of rows) {
    const t = term.toLowerCase();
    if (t === 'death') c.death += count;
    else if (t === 'injury') c.injury += count;
    else if (t === 'malfunction') c.malfunction += count;
    else c.other += count;
    c.total += count;
  }
  c.breaks = Math.min(breaks, c.total);
  return c;
}

/** Monthly buckets for [startIso, endIso] from a date_received count. */
export function monthlyTrend(
  rows: Array<{ term: string; count: number }>,
  startIso: string,
  endIso: string
): SafetySignalInput['trend'] {
  const byMonth = new Map<string, number>();
  for (const { term, count } of rows) {
    if (!/^\d{8}$/.test(term)) continue;
    const iso = `${term.slice(0, 4)}-${term.slice(4, 6)}-${term.slice(6, 8)}`;
    if (iso < startIso || iso > endIso) continue;
    const m = iso.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) || 0) + count);
  }
  const months: Array<{ month: string; count: number }> = [];
  let [y, mo] = startIso.slice(0, 7).split('-').map(Number);
  const end = endIso.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(mo).padStart(2, '0')}`;
    months.push({ month: key, count: byMonth.get(key) || 0 });
    if (key >= end) break;
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  const cut = Math.max(0, months.length - 6);
  const sum = (a: typeof months) => a.reduce((s, p) => s + p.count, 0);
  return { recentTotal: sum(months.slice(cut)), priorTotal: sum(months.slice(0, cut)), months };
}

const FIRM_STOP = new Set([
  'inc', 'incorporated', 'corp', 'corporation', 'llc', 'ltd', 'limited', 'usa', 'us', 'co', 'company',
  'the', 'and', 'of', 'international', 'medical', 'gmbh', 'ag', 'sa', 'sarl', 'plc', 'holdings', 'group',
]);

/** First distinctive word of a firm name ("Medtronic Sofamor Danek USA, Inc" gives "medtronic"). */
export function firmToken(name: string | null | undefined): string | null {
  if (!name) return null;
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !FIRM_STOP.has(w));
  return words[0] || null;
}

export function firmMatches(recallingFirm: string | null | undefined, tokens: Set<string>): boolean {
  if (!recallingFirm) return false;
  const words = new Set(recallingFirm.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/));
  for (const t of tokens) if (words.has(t)) return true;
  return false;
}

/**
 * Recalls must name this commercial line, not a sibling under the same PMA.
 * e.g. "prodisc C Vivo" must not pick up a "Prodisc C SK" labeling recall via P070001.
 */
export function productMatchesBrandKey(
  productDescription: string | null | undefined,
  brandKey: string
): boolean {
  const product = (productDescription || '').toLowerCase();
  const key = brandKey.toLowerCase().replace(/[®™©]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!product || !key) return false;
  if (product.includes(key)) return true;
  const tokens = key.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  return tokens.length > 0 && tokens.every((t) => product.includes(t));
}

function compact(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function isoFromCompact(s: unknown): string | null {
  return typeof s === 'string' && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}

function recallClass(v: unknown): RecallClass | null {
  return typeof v === 'string' && v in RECALL_FACTORS ? (v as RecallClass) : null;
}

/** Keep one entry per recall event (event_id), with its most serious class. */
export function dedupeRecallEvents(rows: RecallEvent[]): RecallEvent[] {
  const rank: Record<RecallClass, number> = { 'Class I': 3, 'Class II': 2, 'Class III': 1 };
  const byId = new Map<string, RecallEvent>();
  for (const r of rows) {
    const prev = byId.get(r.id);
    if (!prev || rank[r.classification] > rank[prev.classification]) byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function enforcementToRecall(row: Record<string, unknown>, url: string): RecallEvent | null {
  const cls = recallClass(row.classification);
  if (!cls) return null;
  const id = String(row.event_id || row.recall_number || '');
  if (!id) return null;
  return {
    id,
    classification: cls,
    date: isoFromCompact(row.recall_initiation_date),
    firm: typeof row.recalling_firm === 'string' ? row.recalling_firm : null,
    product: String(row.product_description || '').replace(/\s+/g, ' ').slice(0, 200),
    reason: typeof row.reason_for_recall === 'string' ? row.reason_for_recall.replace(/\s+/g, ' ').slice(0, 200) : null,
    url,
  };
}

async function categoryForCode(ctx: Ctx, code: string, startCompact: string, endCompact: string, share: number): Promise<CategoryCode> {
  const search = `device.device_report_product_code:"${code}" AND date_received:[${startCompact} TO ${endCompact}]`;
  const ev = await get(ctx, `Category ${code}: reports by event type`, 'event', { search, count: 'event_type.exact', limit: '8' });
  const br = await get(ctx, `Category ${code}: reports naming a break or fracture`, 'event', { search: `${search} AND ${BREAK_CLAUSE}`, limit: '1' });
  const brands = await get(ctx, `Category ${code}: brands reported`, 'event', { search, count: 'device.brand_name.exact', limit: '999' });
  const name = await get(ctx, `Category ${code}: FDA device name`, 'event', { search, count: 'device.openfda.device_name.exact', limit: '1' });
  return {
    code,
    name: terms(name)[0]?.term ?? null,
    share,
    counts: severityFromEventTypes(terms(ev), total(br)),
    brandCount: terms(brands).length,
  };
}

/**
 * Collect every input for one implant. Throws OpenFdaUnavailableError when openFDA
 * answers with an error (the caller shows Insufficient data).
 */
export async function fetchSafetySignalInput(options: {
  maudeBrandKey: string;
  specialty?: string;
  company?: string | null;
  fdaApplicant?: string | null;
  /** Every verified FDA number on file (510(k) or PMA); recalls listing any of them count. */
  fdaNumbers?: string[];
  now?: Date;
}): Promise<SafetySignalInput> {
  const ctx: Ctx = { sources: [], fetchedAt: [] };
  const w = maudeBrandWindowSearch({ brand: options.maudeBrandKey, specialty: options.specialty, days: SAFETY_WINDOW_DAYS });

  const ev = await get(ctx, 'Device: reports by event type (same search as the MAUDE snapshot)', 'event', {
    search: w.search,
    count: 'event_type.exact',
    limit: '8',
  });
  const br = await get(ctx, 'Device: reports naming a break or fracture', 'event', {
    search: `${w.search} AND ${BREAK_CLAUSE}`,
    limit: '1',
  });
  const device = severityFromEventTypes(terms(ev), total(br));

  const trendRes = await get(ctx, 'Device: reports by date received (12-month trend)', 'event', {
    search: w.search,
    count: 'date_received',
  });
  const trend = monthlyTrend(terms(trendRes), w.startIso, w.endIso);

  const categories: CategoryCode[] = [];
  const firms = new Set<string>();
  if (device.total > 0) {
    const codesRes = await get(ctx, 'Device: reports by FDA product code', 'event', {
      search: w.search,
      count: 'device.device_report_product_code.exact',
      limit: '20',
    });
    const codeRows = terms(codesRes).filter((t) => /^[A-Z0-9]{3}$/.test(t.term));
    const codeSum = codeRows.reduce((s, t) => s + t.count, 0);
    const picked = codeRows
      .map((t) => ({ code: t.term, share: codeSum > 0 ? t.count / codeSum : 0 }))
      .filter((c) => c.share >= 0.05)
      .slice(0, 5);
    for (const c of picked) {
      categories.push(await categoryForCode(ctx, c.code, w.startCompact, w.endCompact, c.share));
    }
    const mfr = await get(ctx, 'Device: manufacturers filing the reports', 'event', {
      search: w.search,
      count: 'device.manufacturer_d_name.exact',
      limit: '5',
    });
    for (const t of terms(mfr)) {
      const tok = firmToken(t.term);
      if (tok) firms.add(tok);
    }
  }
  for (const f of [options.company, options.fdaApplicant]) {
    const tok = firmToken(f);
    if (tok) firms.add(tok);
  }

  // Recalls in the lookback: brand phrase in the product description and a firm match.
  const now = options.now ?? new Date();
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - RECALL_LOOKBACK_MONTHS);
  const brandPhrase = options.maudeBrandKey.replace(/["\\]/g, '').replace(/[®™©¿\uFFFD]+/g, '').trim();
  const recallRows: RecallEvent[] = [];
  const enf = await get(ctx, `Recalls: enforcement reports naming "${brandPhrase}"`, 'enforcement', {
    search: `product_description:"${brandPhrase}" AND recall_initiation_date:[${compact(since)} TO ${compact(now)}]`,
    limit: '100',
  });
  if (enf.status !== 404) {
    for (const row of enf.json.results || []) {
      if (!firmMatches(typeof row.recalling_firm === 'string' ? row.recalling_firm : null, firms)) continue;
      const r = enforcementToRecall(
        row,
        `https://api.fda.gov/device/enforcement.json?search=${encodeURIComponent(`recall_number:"${String(row.recall_number || '')}"`)}`
      );
      if (r) recallRows.push(r);
    }
  }

  // Recalls tied to an FDA number on file (exact 510(k) or PMA match in device/recall).
  const resNumbers = new Set<string>();
  for (const raw of options.fdaNumbers ?? []) {
    const num = raw.trim().toUpperCase();
    const field = /^K\d{6}$/.test(num) ? 'k_numbers' : /^P\d{6}$/.test(num) ? 'pma_numbers' : null;
    if (!field) continue;
    const rec = await get(ctx, `Recalls: device/recall records listing ${num}`, 'recall', {
      search: `${field}:"${num}" AND event_date_initiated:[${since.toISOString().slice(0, 10)} TO ${now.toISOString().slice(0, 10)}]`,
      limit: '100',
    });
    if (rec.status !== 404) {
      for (const row of rec.json.results || []) {
        if (typeof row.product_res_number === 'string') resNumbers.add(row.product_res_number);
      }
    }
  }
  for (const rn of [...resNumbers].slice(0, 10)) {
    const e = await get(ctx, `Recalls: FDA class for ${rn}`, 'enforcement', { search: `recall_number:"${rn}"`, limit: '1' });
    const row = e.status === 404 ? null : e.json.results?.[0];
    const r = row ? enforcementToRecall(row, e.url) : null;
    // Shared PMA/510(k) across commercial lines: only keep recalls that name this brand key.
    if (r && productMatchesBrandKey(r.product, brandPhrase)) recallRows.push(r);
  }

  const pulledAt = ctx.fetchedAt.sort()[0] || new Date().toISOString();
  return {
    device,
    categories,
    recalls: dedupeRecallEvents(recallRows),
    trend,
    sources: ctx.sources,
    pulledAt,
    windowStart: w.startIso,
    windowEnd: w.endIso,
  };
}
