import { logger } from '../utils/logger';

export type MaudeDailyPoint = {
  date: string; // YYYY-MM-DD
  count: number;
};

export type MaudeTopDevice = {
  /** Value used to filter openFDA (brand name). */
  name: string;
  count: number;
  icon: MaudeDeviceIcon;
  shortLabel: string;
  /** Always brand for the top-implants strip. */
  kind: 'brand';
};

export type MaudeDeviceIcon =
  | 'knee'
  | 'hip'
  | 'shoulder'
  | 'spine'
  | 'screw'
  | 'plate'
  | 'rod'
  | 'anchor'
  | 'graft'
  | 'instrument'
  | 'generic';

export type MaudeTrendResult = {
  series: MaudeDailyPoint[];
  /** Running total of series counts (for selected brand / device views). */
  cumulativeSeries: MaudeDailyPoint[];
  total: number;
  startDate: string;
  endDate: string;
  search: string;
  label: string;
  specialty: string;
  source: 'openfda';
  lastUpdated: string | null;
  disclaimer: string;
  topDevices: MaudeTopDevice[];
  /** When set, chart is scoped to this brand. */
  selectedBrand: string | null;
  /** Chart grain — monthly for multi-year windows. */
  grain: 'day' | 'month';
  /**
   * Top brand cumulative series for specialty comparison charts
   * (omitted / empty when a single brand is selected).
   */
  brandSeries: MaudeBrandSeries[];
  /** Rising brands in this specialty/window (recent vs prior period). */
  trendingBrands: MaudeTrendingBrand[];
  /** Whether OPENFDA_API_KEY is configured on this server. */
  hasApiKey: boolean;
  /** ISO timestamp when this payload was assembled (cache miss). */
  fetchedAt: string;
  trend: {
    recentAvg: number;
    priorAvg: number;
    changePct: number | null;
    direction: 'up' | 'down' | 'flat' | 'insufficient';
    /** Human window used for recent vs prior (e.g. "7d", "3mo"). */
    windowLabel: string;
  };
};

export type MaudeBrandSeries = {
  name: string;
  shortLabel: string;
  count: number;
  icon: MaudeDeviceIcon;
  series: MaudeDailyPoint[];
  cumulativeSeries: MaudeDailyPoint[];
};

/** Brands with rising recent report rate vs the prior window. */
export type MaudeTrendingBrand = {
  name: string;
  shortLabel: string;
  count: number;
  icon: MaudeDeviceIcon;
  recentTotal: number;
  priorTotal: number;
  changePct: number;
  direction: 'up' | 'down' | 'flat';
  windowLabel: string;
  /** True when prior period had ~0 reports and recent has activity. */
  isNew: boolean;
};

type CacheEntry = {
  expiresAt: number;
  value: MaudeTrendResult;
};

const cache = new Map<string, CacheEntry>();
/** In-memory cache; daily warm cron refreshes specialty + top-brand queries. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function clearMaudeCache(): void {
  cache.clear();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run async work with a fixed concurrency cap (openFDA is 240 req/min). */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/** How many implant brands to rank + plot on specialty comparison charts. */
const TOP_BRAND_LIMIT = 20;

const ORTHO = 'device.openfda.medical_specialty_description:"Orthopedic"';

/**
 * Subspecialty filters aligned with OrthoAndSpineTools community slugs.
 * openFDA only tags "Orthopedic" as specialty, so each filter is keyword-scoped.
 */
export const MAUDE_SPECIALTIES: Record<
  string,
  { label: string; communitySlug: string | null; searchClause: string }
> = {
  all: {
    label: 'All Orthopedic',
    communitySlug: null,
    searchClause: ORTHO,
  },
  spine: {
    label: 'Spine',
    communitySlug: 'spine',
    searchClause: `${ORTHO} AND (device.openfda.device_name:spinal OR device.openfda.device_name:intervertebral OR device.openfda.device_name:pedicle OR device.openfda.device_name:vertebral OR device.brand_name:HORIZON)`,
  },
  'hip-knee-arthroplasty': {
    label: 'Hip & Knee Arthroplasty',
    communitySlug: 'hip-knee-arthroplasty',
    searchClause: `${ORTHO} AND (device.openfda.device_name:hip OR device.openfda.device_name:knee OR device.openfda.device_name:patellofemorotibial OR device.openfda.device_name:acetabular OR device.openfda.device_name:femoral)`,
  },
  'shoulder-elbow': {
    label: 'Shoulder Elbow',
    communitySlug: 'shoulder-elbow',
    searchClause: `${ORTHO} AND (device.openfda.device_name:shoulder OR device.openfda.device_name:elbow OR device.openfda.device_name:humeral OR device.openfda.device_name:ulnar)`,
  },
  sports: {
    label: 'Sports',
    communitySlug: 'sports',
    searchClause: `${ORTHO} AND (device.openfda.device_name:"soft tissue" OR device.openfda.device_name:suture OR device.openfda.device_name:anchor OR device.openfda.device_name:arthroscope OR device.openfda.device_name:ligament)`,
  },
  'ortho-trauma': {
    label: 'Ortho Trauma',
    communitySlug: 'ortho-trauma',
    searchClause: `${ORTHO} AND (device.openfda.device_name:intramedullary OR device.openfda.device_name:"plate, fixation" OR device.openfda.device_name:trauma OR device.openfda.device_name:"nail, fixation" OR device.openfda.device_name:"screw, fixation, bone")`,
  },
  'foot-ankle': {
    label: 'Foot & Ankle',
    communitySlug: 'foot-ankle',
    searchClause: `${ORTHO} AND (device.openfda.device_name:foot OR device.openfda.device_name:ankle OR device.openfda.device_name:calcane OR device.openfda.device_name:tibia OR device.openfda.device_name:talus)`,
  },
  hand: {
    label: 'Hand',
    communitySlug: 'hand',
    searchClause: `${ORTHO} AND (device.openfda.device_name:hand OR device.openfda.device_name:wrist OR device.openfda.device_name:carpal OR device.openfda.device_name:finger OR device.openfda.device_name:phalanx)`,
  },
  'ortho-peds': {
    label: 'Ortho Peds',
    communitySlug: 'ortho-peds',
    searchClause: `${ORTHO} AND (device.openfda.device_name:pediatric OR device.openfda.device_name:growth OR device.openfda.device_name:epiphys)`,
  },
  'ortho-onc': {
    label: 'Ortho Onc',
    communitySlug: 'ortho-onc',
    searchClause: `${ORTHO} AND (device.openfda.device_name:tumor OR device.openfda.device_name:oncolog OR device.openfda.device_name:megaprosthesis OR device.openfda.device_name:"limb salvage")`,
  },
  biologics: {
    label: 'Biologics',
    communitySlug: 'biologics',
    searchClause: `${ORTHO} AND (device.openfda.device_name:graft OR device.openfda.device_name:"bone void" OR device.openfda.device_name:demineralized OR device.openfda.device_name:filler OR device.openfda.device_name:bmp OR device.openfda.device_name:allograft)`,
  },
};

/** @deprecated Use MAUDE_SPECIALTIES — kept for older clients sending preset= */
export const MAUDE_PRESETS = MAUDE_SPECIALTIES;

const INSTRUMENT_NOISE =
  /\b(instrument|template|impactor|impaction|introducer|extractor|screwdriver|driver|reamer|drill|osteotome|forceps|retractor|saw|mallet|holder|handle|guidewire|trocar|trial|provisional|shim|pad|jig|gde)\b/i;

function formatYmdCompact(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function compactToIso(compact: string): string {
  if (!/^\d{8}$/.test(compact)) return compact;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function eachDayIso(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function computeTrend(
  series: MaudeDailyPoint[],
  days: number,
  grain: 'day' | 'month'
): MaudeTrendResult['trend'] {
  const windowSize =
    grain === 'month'
      ? Math.min(3, Math.max(1, Math.floor(series.length / 4)))
      : days >= 365
        ? 30
        : 7;
  const windowLabel = grain === 'month' ? `${windowSize}mo` : `${windowSize}d`;

  if (series.length < windowSize * 2) {
    return {
      recentAvg: 0,
      priorAvg: 0,
      changePct: null,
      direction: 'insufficient',
      windowLabel,
    };
  }
  const recent = series.slice(-windowSize);
  const prior = series.slice(-windowSize * 2, -windowSize);
  const recentAvg = recent.reduce((s, p) => s + p.count, 0) / recent.length;
  const priorAvg = prior.reduce((s, p) => s + p.count, 0) / prior.length;
  if (priorAvg === 0) {
    return {
      recentAvg,
      priorAvg,
      changePct: recentAvg > 0 ? 100 : 0,
      direction: recentAvg > 0 ? 'up' : 'flat',
      windowLabel,
    };
  }
  const changePct = ((recentAvg - priorAvg) / priorAvg) * 100;
  const direction =
    Math.abs(changePct) < 8 ? 'flat' : changePct > 0 ? 'up' : 'down';
  return { recentAvg, priorAvg, changePct, direction, windowLabel };
}

function computeTrendingBrands(
  brandSeries: MaudeBrandSeries[],
  days: number,
  grain: 'day' | 'month'
): MaudeTrendingBrand[] {
  const windowSize =
    grain === 'month'
      ? Math.min(3, Math.max(1, Math.floor((brandSeries[0]?.series.length || 0) / 4) || 1))
      : days >= 365
        ? 30
        : 7;
  const windowLabel = grain === 'month' ? `${windowSize}mo` : `${windowSize}d`;

  const scored: MaudeTrendingBrand[] = [];
  for (const brand of brandSeries) {
    const series = brand.series;
    if (series.length < windowSize * 2) continue;

    const recent = series.slice(-windowSize);
    const prior = series.slice(-windowSize * 2, -windowSize);
    const recentTotal = recent.reduce((s, p) => s + p.count, 0);
    const priorTotal = prior.reduce((s, p) => s + p.count, 0);

    // Need meaningful recent activity
    if (recentTotal < 3) continue;

    const isNew = priorTotal === 0 && recentTotal > 0;
    let changePct: number;
    if (priorTotal === 0) {
      changePct = recentTotal > 0 ? 100 : 0;
    } else {
      changePct = ((recentTotal - priorTotal) / priorTotal) * 100;
    }

    const direction: 'up' | 'down' | 'flat' =
      Math.abs(changePct) < 8 && !isNew ? 'flat' : changePct > 0 || isNew ? 'up' : 'down';

    if (direction !== 'up') continue;

    scored.push({
      name: brand.name,
      shortLabel: brand.shortLabel,
      count: brand.count,
      icon: brand.icon,
      recentTotal,
      priorTotal,
      changePct,
      direction,
      windowLabel,
      isNew,
    });
  }

  scored.sort((a, b) => {
    // New signals first, then steepest % rise; break ties by recent volume
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    if (b.changePct !== a.changePct) return b.changePct - a.changePct;
    return b.recentTotal - a.recentTotal;
  });

  return scored.slice(0, 10);
}

export function classifyDeviceIcon(name: string): MaudeDeviceIcon {
  const n = name.toLowerCase();

  // Common commercial brands → specialty glyph
  if (/\battune\b|\bpersona\b|\btriathlon\b|\boxinium\b|\bvanguard\b|\bstabilized\b/.test(n)) return 'knee';
  if (/\bpinnacle\b|\bcorail\b|\bactis\b|\bemphasys\b|\bs-rom\b|\bg7\b|\bactis\b|\bpolarcup\b/.test(n)) return 'hip';
  if (/\binhance\b|\balti\b|\bequate\b|\breverse\b/.test(n) && !/\bhip\b|\bknee\b/.test(n)) return 'shoulder';
  if (/\bhorizon\b|\bviper\b|\bexpedium\b|\bxia\b|\bsolera\b|\bmesal\b|\btlif\b|\bspinal\b/.test(n)) return 'spine';
  if (/\btruespan\b|\borthocord\b|\btightrope\b|\bfiberwire\b|\bhealix\b|\bsuture\b/.test(n)) return 'anchor';
  if (/\bquickset\b|\bbonesource\b|\bdbx\b|\baugment\b|\bgraft\b/.test(n)) return 'graft';

  if (/\bknee\b|patellofemor/.test(n)) return 'knee';
  if (/\bhip\b|acetabular|femoral head/.test(n)) return 'hip';
  if (/\bshoulder\b|\belbow\b|humeral|reverse configuration/.test(n)) return 'shoulder';
  if (/\bspinal\b|intervertebral|pedicle|vertebral|disc\b|cage\b/.test(n)) return 'spine';
  if (/\bscrew\b/.test(n)) return 'screw';
  if (/\bplate\b/.test(n)) return 'plate';
  if (/\brod\b|intramedullary|nail\b/.test(n)) return 'rod';
  if (/soft tissue|anchor|suture|fastener/.test(n)) return 'anchor';
  if (/graft|filler|void|allograft|bmp|demineralized/.test(n)) return 'graft';
  if (INSTRUMENT_NOISE.test(n)) return 'instrument';
  return 'generic';
}

export function shortDeviceLabel(name: string): string {
  const cleaned = name
    .replace(/\s+/g, ' ')
    .replace(/®/g, '')
    .replace(/™/g, '')
    .replace(/¿/g, '')
    .replace(/©/g, '')
    .replace(/, Semi-Constrained.*$/i, '')
    .replace(/, Cemented.*$/i, '')
    .replace(/, Porous.*$/i, '')
    .replace(/ And Accessories$/i, '')
    .trim();
  if (cleaned.length <= 48) return cleaned;
  return `${cleaned.slice(0, 47).trim()}…`;
}

/** openFDA rejects queries containing ® / ¿ / similar symbols in brand_name. */
function sanitizeBrandForSearch(brand: string): string {
  return brand
    .replace(/["\\]/g, '')
    .replace(/[®™©¿]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const JUNK_BRAND =
  /^(unk|unknown|n\/a|na|ni|none|null|not available|not provided|not reported|\*|-|—|–)$/i;

const JUNK_BRAND_PHRASE =
  /not reported|not available|not provided|specific device|unknown device|device not|n\/a\b/i;

function isUsableBrand(name: string): boolean {
  const t = name.trim();
  if (t.length < 2 || t.length > 120) return false;
  if (JUNK_BRAND.test(t)) return false;
  // Reporter placeholders like "UNK - SCREWS: CMF"
  if (/^unk(\b|[-\s])/i.test(t)) return false;
  if (/^unknown(\b|[-\s])/i.test(t)) return false;
  if (/^n\/?a(\b|[-\s])/i.test(t)) return false;
  if (JUNK_BRAND_PHRASE.test(t)) return false;
  // Instruments / tools are not implant brands
  if (INSTRUMENT_NOISE.test(t)) return false;
  if (/^[\d\W_]+$/.test(t)) return false;
  return true;
}

function toCumulative(series: MaudeDailyPoint[]): MaudeDailyPoint[] {
  let running = 0;
  return series.map((p) => {
    running += p.count;
    return { date: p.date, count: running };
  });
}

function resolveDateWindow(daysInput?: number): {
  days: number;
  startIso: string;
  endIso: string;
  startCompact: string;
  endCompact: string;
  grain: 'day' | 'month';
} {
  const days = Math.min(3650, Math.max(14, daysInput ?? 90));
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    days,
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
    startCompact: formatYmdCompact(start),
    endCompact: formatYmdCompact(end),
    // Multi-year windows chart as monthly totals (readable + smaller payloads).
    grain: days > 180 ? 'month' : 'day',
  };
}

function eachMonthIso(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const [sy, sm] = startIso.split('-').map(Number);
  const [ey, em] = endIso.split('-').map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function buildSeriesFromPoints(
  points: Map<string, number>,
  startIso: string,
  endIso: string,
  grain: 'day' | 'month'
): MaudeDailyPoint[] {
  if (grain === 'day') {
    return eachDayIso(startIso, endIso).map((date) => ({
      date,
      count: points.get(date) ?? 0,
    }));
  }

  const byMonth = new Map<string, number>();
  for (const [date, count] of points) {
    if (date < startIso || date > endIso) continue;
    const key = date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) || 0) + count);
  }
  return eachMonthIso(startIso, endIso).map((date) => ({
    date,
    count: byMonth.get(date) ?? 0,
  }));
}

function buildSearch(params: {
  specialty?: string;
  preset?: string;
  productCode?: string;
  brand?: string;
  deviceName?: string;
  q?: string;
  startCompact: string;
  endCompact: string;
}): { search: string; label: string; specialty: string } {
  const specialtyKey = (params.specialty || params.preset || 'all').trim();
  const specialtyDef = MAUDE_SPECIALTIES[specialtyKey] || MAUDE_SPECIALTIES.all;
  const specialty = MAUDE_SPECIALTIES[specialtyKey] ? specialtyKey : 'all';

  const productCode = params.productCode?.trim().toUpperCase();
  const brand = params.brand?.trim();
  const deviceName = params.deviceName?.trim();
  const q = params.q?.trim();

  const clauses: string[] = [];
  const labelParts: string[] = [specialtyDef.label];

  // Product code alone skips specialty keyword scope
  if (productCode && /^[A-Z0-9]{3}$/.test(productCode) && !brand && !deviceName && !q) {
    clauses.push(`device.openfda.product_code:"${productCode}"`);
    clauses.push(`date_received:[${params.startCompact} TO ${params.endCompact}]`);
    return {
      search: clauses.join(' AND '),
      label: `Product code ${productCode}`,
      specialty,
    };
  }

  if (specialtyDef.searchClause) clauses.push(specialtyDef.searchClause);

  if (productCode && /^[A-Z0-9]{3}$/.test(productCode)) {
    clauses.push(`device.openfda.product_code:"${productCode}"`);
    labelParts.push(`code ${productCode}`);
  }

  if (brand && brand.length >= 2 && brand.length <= 80) {
    const safe = sanitizeBrandForSearch(brand);
    if (safe.length >= 2) {
      // Phrase match after stripping ®/¿ — exact fails when FDA stored the symbol.
      clauses.push(`device.brand_name:"${safe}"`);
      labelParts.push(shortDeviceLabel(brand));
    }
  }

  if (deviceName && deviceName.length >= 2 && deviceName.length <= 200) {
    const safe = deviceName.replace(/"/g, '');
    clauses.push(`device.openfda.device_name.exact:"${safe}"`);
    labelParts.push(shortDeviceLabel(safe));
  }

  if (q && q.length >= 2 && q.length <= 120) {
    const safe = q.replace(/"/g, '');
    clauses.push(`"${safe}"`);
    labelParts.push(safe);
  }

  if (clauses.length === 0) clauses.push(ORTHO);

  clauses.push(`date_received:[${params.startCompact} TO ${params.endCompact}]`);
  return {
    search: clauses.join(' AND '),
    label: labelParts.join(' · '),
    specialty,
  };
}

async function openFdaGet(search: string, extra: Record<string, string>): Promise<{
  status: number;
  json: {
    meta?: { last_updated?: string; disclaimer?: string; results?: { total?: number } };
    results?: Array<Record<string, unknown>>;
    error?: { code?: string; message?: string };
  };
}> {
  const url = new URL('https://api.fda.gov/device/event.json');
  url.searchParams.set('search', search);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);

  const apiKey = process.env.OPENFDA_API_KEY?.trim();
  if (apiKey) url.searchParams.set('api_key', apiKey);

  const maxAttempts = 3;
  let lastStatus = 0;
  let lastJson: {
    meta?: { last_updated?: string; disclaimer?: string; results?: { total?: number } };
    results?: Array<Record<string, unknown>>;
    error?: { code?: string; message?: string };
  } = {};

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(35000),
    });

    const json = (await res.json().catch(() => ({}))) as typeof lastJson;
    lastStatus = res.status;
    lastJson = json;

    const retryable = res.status === 429 || res.status === 502 || res.status === 503;
    if (!retryable || attempt === maxAttempts) {
      return { status: res.status, json };
    }

    const backoffMs = res.status === 429 ? 1500 * attempt : 400 * attempt * attempt;
    logger.warn('openFDA transient error — retrying', { status: res.status, attempt, backoffMs });
    await sleep(backoffMs);
  }

  return { status: lastStatus, json: lastJson };
}

async function fetchOpenFdaDailyCounts(search: string): Promise<{
  points: Map<string, number>;
  lastUpdated: string | null;
  disclaimer: string;
}> {
  const { status, json } = await openFdaGet(search, { count: 'date_received' });

  if (status === 404 || json.error?.code === 'NOT_FOUND') {
    return {
      points: new Map(),
      lastUpdated: null,
      disclaimer:
        'Do not rely on openFDA / MAUDE alone for clinical decisions. Results may be incomplete or delayed.',
    };
  }

  if (status >= 400) {
    throw new Error(`openFDA error ${status}: ${(json.error?.message || '').slice(0, 200)}`);
  }

  const points = new Map<string, number>();
  for (const row of json.results || []) {
    const time = typeof row.time === 'string' ? row.time : '';
    const count = typeof row.count === 'number' ? row.count : 0;
    if (!time || count <= 0) continue;
    points.set(compactToIso(time), count);
  }

  return {
    points,
    lastUpdated: json.meta?.last_updated || null,
    disclaimer:
      json.meta?.disclaimer ||
      'Do not rely on openFDA / MAUDE alone for clinical decisions. Results may be incomplete or delayed.',
  };
}

async function fetchTopBrands(search: string, limit = TOP_BRAND_LIMIT): Promise<MaudeTopDevice[]> {
  const { status, json } = await openFdaGet(search, {
    count: 'device.brand_name.exact',
    limit: String(Math.min(100, Math.max(limit * 8, 40))),
  });

  if (status === 404 || json.error?.code === 'NOT_FOUND') return [];
  if (status >= 400) {
    logger.warn('openFDA top-brands count failed', { status, message: json.error?.message });
    return [];
  }

  const devices: MaudeTopDevice[] = [];
  const seenKeys = new Set<string>();
  for (const row of json.results || []) {
    const name = typeof row.term === 'string' ? row.term.trim() : '';
    const count = typeof row.count === 'number' ? row.count : 0;
    if (!isUsableBrand(name) || count <= 0) continue;
    const key = sanitizeBrandForSearch(name).toLowerCase();
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    devices.push({
      name,
      count,
      icon: classifyDeviceIcon(name),
      shortLabel: shortDeviceLabel(name),
      kind: 'brand',
    });
    if (devices.length >= limit) break;
  }
  return devices;
}

export function listMaudeSpecialties(): Array<{
  id: string;
  label: string;
  communitySlug: string | null;
}> {
  return Object.entries(MAUDE_SPECIALTIES).map(([id, s]) => ({
    id,
    label: s.label,
    communitySlug: s.communitySlug,
  }));
}

export type MaudeBrandSearchHit = {
  name: string;
  shortLabel: string;
  count: number;
  icon: MaudeDeviceIcon;
  /** How the match ranked: exact | prefix | contains */
  match: 'exact' | 'prefix' | 'contains';
};

const brandSearchCache = new Map<string, { expiresAt: number; value: MaudeBrandSearchHit[] }>();

/**
 * Live brand autocomplete against openFDA (wildcard + ranked exact/prefix/contains).
 */
export async function searchMaudeBrands(options: {
  q: string;
  specialty?: string;
  limit?: number;
}): Promise<MaudeBrandSearchHit[]> {
  const raw = options.q.trim();
  if (raw.length < 2) return [];

  const specialtyKey = (options.specialty || 'all').trim();
  const specialty = MAUDE_SPECIALTIES[specialtyKey] ? specialtyKey : 'all';
  const specialtyDef = MAUDE_SPECIALTIES[specialty];
  const limit = Math.min(25, Math.max(5, options.limit ?? 12));
  const safe = sanitizeBrandForSearch(raw).replace(/[?*]/g, '');
  if (safe.length < 2) return [];

  const cacheKey = `${specialty}|${safe.toLowerCase()}|${limit}`;
  const cached = brandSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // openFDA token/wildcard search on brand_name, then count exact brand terms.
  const search = `${specialtyDef.searchClause} AND device.brand_name:${safe}*`;
  const { status, json } = await openFdaGet(search, {
    count: 'device.brand_name.exact',
    limit: '80',
  });

  if (status === 404 || json.error?.code === 'NOT_FOUND') {
    brandSearchCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, value: [] });
    return [];
  }
  if (status >= 400) {
    throw new Error(`openFDA error ${status}: ${(json.error?.message || '').slice(0, 160)}`);
  }

  const qLower = safe.toLowerCase();
  const hits: MaudeBrandSearchHit[] = [];
  const seen = new Set<string>();

  for (const row of json.results || []) {
    const name = typeof row.term === 'string' ? row.term.trim() : '';
    const count = typeof row.count === 'number' ? row.count : 0;
    if (!isUsableBrand(name) || count <= 0) continue;
    const key = sanitizeBrandForSearch(name).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const nameLower = name.toLowerCase();
    const cleanLower = key;
    let match: MaudeBrandSearchHit['match'] = 'contains';
    if (nameLower === qLower || cleanLower === qLower) match = 'exact';
    else if (nameLower.startsWith(qLower) || cleanLower.startsWith(qLower)) match = 'prefix';
    else if (!nameLower.includes(qLower) && !cleanLower.includes(qLower)) {
      // Wildcard can return sibling tokens; keep if any token starts with query
      const tokenHit = cleanLower.split(/\s+/).some((t) => t.startsWith(qLower));
      if (!tokenHit) continue;
      match = 'prefix';
    }

    hits.push({
      name,
      shortLabel: shortDeviceLabel(name),
      count,
      icon: classifyDeviceIcon(name),
      match,
    });
  }

  const rank = { exact: 0, prefix: 1, contains: 2 } as const;
  hits.sort((a, b) => {
    const rd = rank[a.match] - rank[b.match];
    if (rd !== 0) return rd;
    if (b.count !== a.count) return b.count - a.count;
    return a.shortLabel.localeCompare(b.shortLabel);
  });

  const value = hits.slice(0, limit);
  brandSearchCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, value });
  return value;
}

export async function getMaudeDailyTrends(options: {
  days?: number;
  specialty?: string;
  preset?: string;
  productCode?: string;
  brand?: string;
  deviceName?: string;
  q?: string;
  /** Skip cache read (still writes). Used by the daily warm cron. */
  forceRefresh?: boolean;
  /** Include top-N brand comparison series (default true when no brand filter). */
  includeBrandSeries?: boolean;
}): Promise<MaudeTrendResult> {
  const window = resolveDateWindow(options.days);
  const selectedBrand = options.brand?.trim() || null;
  const includeBrandSeries =
    options.includeBrandSeries !== false && !selectedBrand;

  const { search, label, specialty } = buildSearch({
    specialty: options.specialty,
    preset: options.preset,
    productCode: options.productCode,
    brand: options.brand,
    deviceName: options.deviceName,
    q: options.q,
    startCompact: window.startCompact,
    endCompact: window.endCompact,
  });

  const cacheKey = `${window.days}|${search}|brands:${includeBrandSeries ? TOP_BRAND_LIMIT : 0}`;
  if (!options.forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  logger.info('Fetching openFDA MAUDE daily counts', {
    label,
    days: window.days,
    specialty,
    brand: selectedBrand,
    grain: window.grain,
    includeBrandSeries,
  });

  // Specialty-level search (without brand/device) for the top-brands strip
  const baseSearch = buildSearch({
    specialty,
    startCompact: window.startCompact,
    endCompact: window.endCompact,
  }).search;

  const [daily, topDevices] = await Promise.all([
    fetchOpenFdaDailyCounts(search),
    fetchTopBrands(baseSearch, TOP_BRAND_LIMIT),
  ]);

  const series = buildSeriesFromPoints(
    daily.points,
    window.startIso,
    window.endIso,
    window.grain
  );
  const total = series.reduce((s, p) => s + p.count, 0);
  const cumulativeSeries = toCumulative(series);

  let brandSeries: MaudeBrandSeries[] = [];
  if (includeBrandSeries && topDevices.length > 0) {
    const brandResults = await mapPool(topDevices.slice(0, TOP_BRAND_LIMIT), 4, async (device) => {
      try {
        const brandSearch = buildSearch({
          specialty,
          brand: device.name,
          startCompact: window.startCompact,
          endCompact: window.endCompact,
        }).search;
        const brandDaily = await fetchOpenFdaDailyCounts(brandSearch);
        const brandPts = buildSeriesFromPoints(
          brandDaily.points,
          window.startIso,
          window.endIso,
          window.grain
        );
        const brandTotal = brandPts.reduce((s, p) => s + p.count, 0);
        return {
          name: device.name,
          shortLabel: device.shortLabel,
          count: brandTotal > 0 ? brandTotal : device.count,
          icon: device.icon,
          series: brandPts,
          cumulativeSeries: toCumulative(brandPts),
        } satisfies MaudeBrandSeries;
      } catch (err) {
        logger.warn('openFDA brand series failed', {
          brand: device.name,
          message: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    });
    brandSeries = brandResults
      .filter((b): b is MaudeBrandSeries => b != null)
      .sort((a, b) => b.count - a.count);
  }

  const trendingBrands = computeTrendingBrands(brandSeries, window.days, window.grain);

  const value: MaudeTrendResult = {
    series,
    cumulativeSeries,
    total,
    startDate: window.startIso,
    endDate: window.endIso,
    search,
    label,
    specialty,
    source: 'openfda',
    lastUpdated: daily.lastUpdated,
    disclaimer: daily.disclaimer,
    topDevices,
    selectedBrand,
    grain: window.grain,
    brandSeries,
    trendingBrands,
    hasApiKey: Boolean(process.env.OPENFDA_API_KEY?.trim()),
    fetchedAt: new Date().toISOString(),
    trend: computeTrend(series, window.days, window.grain),
  };

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export type MaudeCountTerm = { term: string; count: number };

export type MaudeBrandSynopsis = {
  brand: string;
  label: string;
  specialty: string;
  startDate: string;
  endDate: string;
  totalReports: number;
  summary: string;
  eventTypes: MaudeCountTerm[];
  deviceProblems: MaudeCountTerm[];
  patientProblems: MaudeCountTerm[];
  samples: Array<{
    date: string;
    eventType: string;
    problems: string[];
    excerpt: string;
    reportNumber: string | null;
  }>;
  disclaimer: string;
};

const synopsisCache = new Map<string, { expiresAt: number; value: MaudeBrandSynopsis }>();

const LOW_SIGNAL_PROBLEM =
  /without identified|no clinical signs|no consequences|no code available|insufficient information|no information|adverse event without|not applicable|^n\/?a$/i;

async function fetchCountTerms(search: string, countField: string, limit = 12): Promise<MaudeCountTerm[]> {
  const { status, json } = await openFdaGet(search, {
    count: countField,
    limit: String(limit),
  });
  if (status === 404 || json.error?.code === 'NOT_FOUND') return [];
  if (status >= 400) {
    logger.warn('openFDA count failed', { countField, status, message: json.error?.message });
    return [];
  }
  const out: MaudeCountTerm[] = [];
  for (const row of json.results || []) {
    const term = typeof row.term === 'string' ? row.term.trim() : '';
    const count = typeof row.count === 'number' ? row.count : 0;
    if (!term || count <= 0) continue;
    out.push({ term, count });
  }
  return out;
}

function preferSignalTerms(terms: MaudeCountTerm[], limit: number): MaudeCountTerm[] {
  const useful = terms.filter((t) => !LOW_SIGNAL_PROBLEM.test(t.term));
  const filler = terms.filter((t) => LOW_SIGNAL_PROBLEM.test(t.term));
  return [...useful, ...filler].slice(0, limit);
}

function buildSynopsisSummary(
  brand: string,
  total: number,
  eventTypes: MaudeCountTerm[],
  deviceProblems: MaudeCountTerm[],
  patientProblems: MaudeCountTerm[]
): string {
  const parts: string[] = [];
  parts.push(
    `${shortDeviceLabel(brand)} has ${total.toLocaleString()} MAUDE report${total === 1 ? '' : 's'} in this window.`
  );

  if (eventTypes.length) {
    const etTotal = eventTypes.reduce((s, t) => s + t.count, 0) || 1;
    const mix = eventTypes
      .slice(0, 3)
      .filter((t) => t.term)
      .map((t) => `${t.term} ${Math.round((t.count / etTotal) * 100)}%`)
      .join(', ');
    if (mix) parts.push(`Event mix: ${mix}.`);
  }

  const topDevice = preferSignalTerms(deviceProblems, 3)
    .slice(0, 3)
    .map((t) => `${t.term} (${t.count.toLocaleString()})`);
  if (topDevice.length) parts.push(`Leading device problems: ${topDevice.join(', ')}.`);

  const topPatient = preferSignalTerms(patientProblems, 3)
    .slice(0, 3)
    .map((t) => `${t.term} (${t.count.toLocaleString()})`);
  if (topPatient.length) parts.push(`Leading patient problems: ${topPatient.join(', ')}.`);

  parts.push('This is an automated roll-up of FDA reports — not a clinical conclusion.');
  return parts.join(' ');
}

/**
 * Brand-level MAUDE synopsis: event mix, device/patient problem tallies, recent excerpts.
 */
export async function getMaudeBrandSynopsis(options: {
  brand: string;
  specialty?: string;
  days?: number;
}): Promise<MaudeBrandSynopsis> {
  const brand = options.brand.trim();
  if (brand.length < 2) {
    throw new Error('brand is required');
  }

  const window = resolveDateWindow(options.days ?? 1095);
  const { search, label, specialty } = buildSearch({
    specialty: options.specialty,
    brand,
    startCompact: window.startCompact,
    endCompact: window.endCompact,
  });

  const cacheKey = `synopsis|${window.days}|${search}`;
  const cached = synopsisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [eventTypesRaw, deviceProblemsRaw, patientProblemsRaw, sampleRes] = await Promise.all([
    fetchCountTerms(search, 'event_type.exact', 8),
    fetchCountTerms(search, 'product_problems.exact', 20),
    fetchCountTerms(search, 'patient.patient_problems.exact', 20),
    openFdaGet(search, { limit: '8', sort: 'date_received:desc' }),
  ]);

  const eventTypes = eventTypesRaw.filter((t) => t.term);
  const deviceProblems = preferSignalTerms(deviceProblemsRaw, 10);
  const patientProblems = preferSignalTerms(patientProblemsRaw, 10);

  let totalReports = eventTypes.reduce((s, t) => s + t.count, 0);
  if (totalReports === 0 && sampleRes.json.meta?.results?.total) {
    totalReports = sampleRes.json.meta.results.total;
  }

  const samples: MaudeBrandSynopsis['samples'] = [];
  if (sampleRes.status < 400) {
    for (const row of sampleRes.json.results || []) {
      const texts = Array.isArray(row.mdr_text)
        ? (row.mdr_text as Array<{ text_type_code?: string; text?: string }>)
        : [];
      const preferred =
        texts.find((t) => /description of event/i.test(t.text_type_code || '')) ||
        texts.find((t) => /narrative/i.test(t.text_type_code || '')) ||
        texts.find((t) => (t.text || '').length > 40);
      const excerpt = (preferred?.text || '')
        .replace(/\s+/g, ' ')
        .replace(/\(b\)\(\d+\)/gi, '[redacted]')
        .trim()
        .slice(0, 320);
      if (!excerpt) continue;
      const dateRaw = typeof row.date_received === 'string' ? row.date_received : '';
      const date = /^\d{8}$/.test(dateRaw) ? compactToIso(dateRaw) : dateRaw;
      const problems = Array.isArray(row.product_problems)
        ? (row.product_problems as string[]).filter(Boolean).slice(0, 4)
        : [];
      samples.push({
        date,
        eventType: typeof row.event_type === 'string' ? row.event_type : 'Unknown',
        problems,
        excerpt: excerpt.length >= 320 ? `${excerpt.slice(0, 317)}…` : excerpt,
        reportNumber: typeof row.report_number === 'string' ? row.report_number : null,
      });
      if (samples.length >= 5) break;
    }
  }

  const value: MaudeBrandSynopsis = {
    brand,
    label,
    specialty,
    startDate: window.startIso,
    endDate: window.endIso,
    totalReports,
    summary: buildSynopsisSummary(brand, totalReports, eventTypes, deviceProblems, patientProblems),
    eventTypes,
    deviceProblems,
    patientProblems,
    samples,
    disclaimer:
      'Do not rely on openFDA / MAUDE alone for clinical decisions. Narratives are abbreviated FDA text and may be incomplete or delayed.',
  };

  synopsisCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export type MaudeWarmResult = {
  warmed: number;
  errors: string[];
  lastUpdated: string | null;
  hasApiKey: boolean;
};

/**
 * Prefetch specialty + top-brand trend queries so /maude stays snappy and
 * picks up openFDA's weekly MAUDE refresh without waiting on a user visit.
 */
export async function warmMaudeCaches(options?: {
  days?: number[];
  /** Brands to warm for the "all" specialty (most common click-throughs). */
  topBrands?: number;
}): Promise<MaudeWarmResult> {
  const hasApiKey = Boolean(process.env.OPENFDA_API_KEY?.trim());
  // Prefetch the default 3y window with brand series; short window without brand fan-out.
  const dayWindows = options?.days?.length ? options.days : [1095];
  const brandLimit = options?.topBrands ?? (hasApiKey ? 6 : 3);
  const specialtyIds = Object.keys(MAUDE_SPECIALTIES);
  const errors: string[] = [];
  let warmed = 0;
  let lastUpdated: string | null = null;
  const pauseMs = hasApiKey ? 250 : 500;

  clearMaudeCache();

  let topBrands: MaudeTopDevice[] = [];

  for (const days of dayWindows) {
    for (const specialty of specialtyIds) {
      try {
        const withBrands = days >= 365;
        const result = await getMaudeDailyTrends({
          days,
          specialty,
          forceRefresh: true,
          includeBrandSeries: withBrands,
        });
        warmed += 1;
        if (result.lastUpdated) lastUpdated = result.lastUpdated;
        if (specialty === 'all' && topBrands.length === 0) {
          topBrands = result.topDevices.slice(0, brandLimit);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${specialty}/${days}d: ${msg.slice(0, 120)}`);
      }
      await sleep(pauseMs);
    }

    // A few focused single-brand caches for the default specialty landing clicks.
    for (const brand of topBrands) {
      try {
        const brandResult = await getMaudeDailyTrends({
          days,
          specialty: 'all',
          brand: brand.name,
          forceRefresh: true,
          includeBrandSeries: false,
        });
        warmed += 1;
        if (brandResult.lastUpdated) lastUpdated = brandResult.lastUpdated;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`all/${brand.name}/${days}d: ${msg.slice(0, 120)}`);
      }
      await sleep(pauseMs);
    }
  }

  logger.info('MAUDE cache warm complete', { warmed, errors: errors.length, lastUpdated, hasApiKey });
  return { warmed, errors, lastUpdated, hasApiKey };
}
