import { logger } from '../utils/logger';

export type MaudeDailyPoint = {
  date: string; // YYYY-MM-DD
  count: number;
};

export type MaudeTopDevice = {
  name: string;
  count: number;
  icon: MaudeDeviceIcon;
  shortLabel: string;
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
  trend: {
    recentAvg: number;
    priorAvg: number;
    changePct: number | null;
    direction: 'up' | 'down' | 'flat' | 'insufficient';
  };
};

type CacheEntry = {
  expiresAt: number;
  value: MaudeTrendResult;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

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
  /\b(instrument|template|impactor|screwdriver|reamer|drill|osteotome|forceps|retractor|saw|mallet|holder|guidewire|trocar)\b/i;

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

function computeTrend(series: MaudeDailyPoint[]): MaudeTrendResult['trend'] {
  if (series.length < 14) {
    return { recentAvg: 0, priorAvg: 0, changePct: null, direction: 'insufficient' };
  }
  const recent = series.slice(-7);
  const prior = series.slice(-14, -7);
  const recentAvg = recent.reduce((s, p) => s + p.count, 0) / recent.length;
  const priorAvg = prior.reduce((s, p) => s + p.count, 0) / prior.length;
  if (priorAvg === 0) {
    return {
      recentAvg,
      priorAvg,
      changePct: recentAvg > 0 ? 100 : 0,
      direction: recentAvg > 0 ? 'up' : 'flat',
    };
  }
  const changePct = ((recentAvg - priorAvg) / priorAvg) * 100;
  const direction =
    Math.abs(changePct) < 8 ? 'flat' : changePct > 0 ? 'up' : 'down';
  return { recentAvg, priorAvg, changePct, direction };
}

export function classifyDeviceIcon(name: string): MaudeDeviceIcon {
  const n = name.toLowerCase();
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
    .replace(/, Semi-Constrained.*$/i, '')
    .replace(/, Cemented.*$/i, '')
    .replace(/, Porous.*$/i, '')
    .replace(/ And Accessories$/i, '')
    .trim();
  if (cleaned.length <= 42) return cleaned;
  return `${cleaned.slice(0, 41).trim()}…`;
}

function resolveDateWindow(daysInput?: number): {
  days: number;
  startIso: string;
  endIso: string;
  startCompact: string;
  endCompact: string;
} {
  const days = Math.min(365, Math.max(14, daysInput ?? 90));
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
  };
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
    const safe = brand.replace(/"/g, '');
    clauses.push(`device.brand_name:"${safe}"`);
    labelParts.push(safe);
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
    results?: Array<{ time?: string; term?: string; count?: number }>;
    error?: { code?: string; message?: string };
  };
}> {
  const url = new URL('https://api.fda.gov/device/event.json');
  url.searchParams.set('search', search);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);

  const apiKey = process.env.OPENFDA_API_KEY?.trim();
  if (apiKey) url.searchParams.set('api_key', apiKey);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  });

  const json = (await res.json().catch(() => ({}))) as {
    meta?: { last_updated?: string; disclaimer?: string; results?: { total?: number } };
    results?: Array<{ time?: string; term?: string; count?: number }>;
    error?: { code?: string; message?: string };
  };

  return { status: res.status, json };
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
    if (!row.time || typeof row.count !== 'number') continue;
    points.set(compactToIso(row.time), row.count);
  }

  return {
    points,
    lastUpdated: json.meta?.last_updated || null,
    disclaimer:
      json.meta?.disclaimer ||
      'Do not rely on openFDA / MAUDE alone for clinical decisions. Results may be incomplete or delayed.',
  };
}

async function fetchTopDevices(search: string, limit = 12): Promise<MaudeTopDevice[]> {
  // Pull extra rows so we can drop instrument noise and still fill the grid
  const { status, json } = await openFdaGet(search, {
    count: 'device.openfda.device_name.exact',
    limit: String(Math.min(50, Math.max(limit * 3, 20))),
  });

  if (status === 404 || json.error?.code === 'NOT_FOUND') return [];
  if (status >= 400) {
    logger.warn('openFDA top-devices count failed', { status, message: json.error?.message });
    return [];
  }

  const devices: MaudeTopDevice[] = [];
  for (const row of json.results || []) {
    const name = (row.term || '').trim();
    const count = typeof row.count === 'number' ? row.count : 0;
    if (!name || count <= 0) continue;
    const icon = classifyDeviceIcon(name);
    if (icon === 'instrument') continue;
    devices.push({
      name,
      count,
      icon,
      shortLabel: shortDeviceLabel(name),
    });
    if (devices.length >= limit) break;
  }

  // If filtering removed everything, fall back to raw top rows
  if (devices.length === 0) {
    for (const row of (json.results || []).slice(0, limit)) {
      const name = (row.term || '').trim();
      const count = typeof row.count === 'number' ? row.count : 0;
      if (!name || count <= 0) continue;
      devices.push({
        name,
        count,
        icon: classifyDeviceIcon(name),
        shortLabel: shortDeviceLabel(name),
      });
    }
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

export async function getMaudeDailyTrends(options: {
  days?: number;
  specialty?: string;
  preset?: string;
  productCode?: string;
  brand?: string;
  deviceName?: string;
  q?: string;
}): Promise<MaudeTrendResult> {
  const window = resolveDateWindow(options.days);

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

  const cacheKey = `${window.days}|${search}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  logger.info('Fetching openFDA MAUDE daily counts', { label, days: window.days, specialty });

  // Specialty-level search (without exact device) for top-implants strip
  const baseSearch = buildSearch({
    specialty,
    startCompact: window.startCompact,
    endCompact: window.endCompact,
  }).search;

  const [daily, topDevices] = await Promise.all([
    fetchOpenFdaDailyCounts(search),
    fetchTopDevices(baseSearch, 10),
  ]);

  const series = eachDayIso(window.startIso, window.endIso).map((date) => ({
    date,
    count: daily.points.get(date) ?? 0,
  }));
  const total = series.reduce((s, p) => s + p.count, 0);

  const value: MaudeTrendResult = {
    series,
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
    trend: computeTrend(series),
  };

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
