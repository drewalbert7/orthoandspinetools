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
  /** Cleaned product / system name for display. */
  shortLabel: string;
  /** Parent company when known (curated or manufacturer roll-up). */
  company: string | null;
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
  company: string | null;
  count: number;
  icon: MaudeDeviceIcon;
  series: MaudeDailyPoint[];
  cumulativeSeries: MaudeDailyPoint[];
};

/** Brands with rising recent report rate vs the prior window. */
export type MaudeTrendingBrand = {
  name: string;
  shortLabel: string;
  company: string | null;
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
 * Several high-volume ortho/spine implant classes are tagged specialty "Unknown"
 * in openFDA (not Orthopedic). OR them in explicitly or they vanish from rankings.
 */
const DISC_ARTHROPLASTY = 'device.openfda.device_name:"Prosthesis, Intervertebral Disc"';
const SPINOUS_SPACER = 'device.openfda.device_name:"Prosthesis, Spinous Process Spacer/Plate"';
const MOBILE_BEARING_KNEE =
  'device.openfda.device_name:"Prosthesis, Knee, Patellofemorotibial, Semi-Constrained, Metal/Polymer, Mobile Bearing"';
const UKA_MOBILE_BEARING =
  'device.openfda.device_name:"Prosthesis, Knee, Femorotibial, Unicompartmental, Semi-Constrained, Metal/Polymer, Mobile Bearing"';
const RHBMP_FILLER =
  'device.openfda.device_name:"Filler, Recombinant Human Bone Morphogenetic Protein, Collagen Scaffold With Metal Prosthesis, Osteoinduction" OR device.openfda.device_name:"Filler, Recombinant Human Bone Morphogenetic Protein, Collagen Scaffold, Osteoinduction"';

/** Unknown-specialty implant classes that still belong in All Orthopedic. */
const ORTHO_UNKNOWN_IMPLANTS = `(${DISC_ARTHROPLASTY} OR ${SPINOUS_SPACER} OR ${MOBILE_BEARING_KNEE} OR ${UKA_MOBILE_BEARING} OR ${RHBMP_FILLER})`;

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
    searchClause: `(${ORTHO} OR ${ORTHO_UNKNOWN_IMPLANTS})`,
  },
  spine: {
    label: 'Spine',
    communitySlug: 'spine',
    searchClause: `((${ORTHO} AND (device.openfda.device_name:spinal OR device.openfda.device_name:intervertebral OR device.openfda.device_name:pedicle OR device.openfda.device_name:vertebral OR device.openfda.device_name:cervical OR device.openfda.device_name:sacro OR device.openfda.device_name:spinous OR device.openfda.device_name:kypho OR device.openfda.device_name:vertebro OR device.brand_name:HORIZON OR device.brand_name:INFUSE OR device.brand_name:IFUSE OR device.brand_name:iFuse)) OR ${DISC_ARTHROPLASTY} OR ${SPINOUS_SPACER} OR ${RHBMP_FILLER})`,
  },
  'hip-knee-arthroplasty': {
    label: 'Hip & Knee Arthroplasty',
    communitySlug: 'hip-knee-arthroplasty',
    searchClause: `((${ORTHO} AND (device.openfda.device_name:hip OR device.openfda.device_name:knee OR device.openfda.device_name:patellofemorotibial OR device.openfda.device_name:acetabular OR device.openfda.device_name:femoral OR device.openfda.device_name:unicompartmental)) OR ${MOBILE_BEARING_KNEE} OR ${UKA_MOBILE_BEARING})`,
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
    searchClause: `((${ORTHO} AND (device.openfda.device_name:graft OR device.openfda.device_name:"bone void" OR device.openfda.device_name:demineralized OR device.openfda.device_name:filler OR device.openfda.device_name:bmp OR device.openfda.device_name:allograft OR device.brand_name:INFUSE)) OR ${RHBMP_FILLER})`,
  },
};

/** @deprecated Use MAUDE_SPECIALTIES — kept for older clients sending preset= */
export const MAUDE_PRESETS = MAUDE_SPECIALTIES;

const INSTRUMENT_NOISE =
  /\b(instrument|template|impactor|impaction|introducer|inserter|extractor|screwdriver|driver|reamer|drill|osteotome|forceps|retractor|saw|mallet|holder|handle|guidewire|trocar|trial|provisional|shim|pad|jig|gde|spatula|mixing bowl|disposable)\b/i;

/** Manufacturer / company names wrongly filed as brand_name. */
const COMPANY_AS_BRAND =
  /^(djo(\s+surgical)?|enovis|stryker(\s+(corporation|orthopaedics?))?|zimmer(\s+biomet)?|biomet|depuy(\s+synthes)?|synthes|johnson\s*&\s*johnson|j&j|medtronic|smith\s*(&|and)\s*nephew|arthrex|globus(\s+medical)?|nuvasive|exactech|wright(\s+medical)?|microport|lima(\s*corporate)?|conmed|orthofix|aesculap|b\.?\s*braun)$/i;

/**
 * Well-known implant families → parent company (FDA manufacturer rows are often subsidiaries).
 * Order matters: more specific patterns first.
 */
const BRAND_FAMILY_COMPANY: Array<{ test: RegExp; company: string }> = [
  { test: /^cd\s*horizon/i, company: 'Medtronic' },
  { test: /\bmetrx\b/i, company: 'Medtronic' },
  { test: /^prestige(\s+cervical|\s+disc)/i, company: 'Medtronic' },
  { test: /^superion\b|^vertiflex\b/i, company: 'Boston Scientific' },
  { test: /^coflex\b/i, company: 'Presidio Surgical' },
  { test: /^infuse\b/i, company: 'Medtronic' },
  { test: /^ifuse\b|^i-?fuse\b/i, company: 'SI-BONE' },
  { test: /^attune/i, company: 'DePuy Synthes' },
  { test: /^expedium/i, company: 'DePuy Synthes' },
  { test: /^viper/i, company: 'DePuy Synthes' },
  { test: /^pinnacle/i, company: 'DePuy Synthes' },
  { test: /^corail/i, company: 'DePuy Synthes' },
  { test: /^inhance/i, company: 'DePuy Synthes' },
  { test: /^orthocord|^truespan/i, company: 'DePuy Synthes' },
  { test: /\bmitek\b/i, company: 'DePuy Synthes' },
  { test: /^triathlon/i, company: 'Stryker' },
  { test: /^tritanium/i, company: 'Stryker' },
  { test: /^t2\b|^t2\s/i, company: 'Stryker' },
  { test: /^xia\b/i, company: 'Stryker' },
  { test: /^acre?e?a?d?\b|^acreo/i, company: 'Stryker' },
  { test: /^persona\b|^nexgen|^taperloc|^g7\b|^emphasys|^comprehensive\b/i, company: 'Zimmer Biomet' },
  { test: /^mobi-?c\b/i, company: 'Zimmer Biomet' },
  { test: /^creo\b/i, company: 'Globus Medical' },
  { test: /^secure-?c\b/i, company: 'Globus Medical' },
  { test: /^reline|^catalyft|^nuvasive|^simplify\b/i, company: 'NuVasive' },
  { test: /^prodisc/i, company: 'Centinel Spine' },
  { test: /^m6-?c\b|^m6\s+cervical/i, company: 'Orthofix' },
  { test: /^fiber(wire|tak)|^tightrope|^swivelock|^healix|^bipush|^pushlock/i, company: 'Arthrex' },
  { test: /^quickset/i, company: 'Graftys' },
  { test: /^gmk\b|sphere total knee/i, company: 'Medacta' },
  { test: /^biolox/i, company: 'CeramTec' },
  { test: /^eleos/i, company: 'Onkos Surgical' },
  { test: /^sign\b/i, company: 'SIGN Fracture Care' },
  { test: /^aequalis|^tornier/i, company: 'Stryker' },
  { test: /^equinoxe/i, company: 'Exactech' },
  { test: /^alti[yv]|reverse shoulder/i, company: 'Zimmer Biomet' },
];

/**
 * Collapse FDA size/SKU brand_name variants into one commercial product for ranking.
 * `filterName` is what we send back to openFDA brand search.
 */
const BRAND_ROLLUPS: Array<{ test: RegExp; filterName: string; displayName: string; company: string }> = [
  {
    test: /^mobi-?c\b|^implant\s+mobic\b/i,
    filterName: 'MOBI-C',
    displayName: 'Mobi-C Cervical Disc',
    company: 'Zimmer Biomet',
  },
  {
    test: /^prodisc[-\s]*c\b/i,
    filterName: 'PRODISC C',
    displayName: 'prodisc C',
    company: 'Centinel Spine',
  },
  {
    test: /^prodisc[-\s]*l\b/i,
    filterName: 'PRODISC L',
    displayName: 'prodisc L',
    company: 'Centinel Spine',
  },
  {
    test: /^simplify\b/i,
    filterName: 'SIMPLIFY',
    displayName: 'Simplify Cervical Artificial Disc',
    company: 'NuVasive',
  },
  {
    test: /^m6-?c\b|^m6\s+cervical/i,
    filterName: 'M6-C',
    displayName: 'M6-C Artificial Cervical Disc',
    company: 'Orthofix',
  },
  {
    test: /^secure-?c\b/i,
    filterName: 'SECURE-C',
    displayName: 'SECURE-C Cervical Artificial Disc',
    company: 'Globus Medical',
  },
  {
    test: /^prestige(\s+cervical|\s+disc|\s*®?\s*cervical)/i,
    filterName: 'PRESTIGE CERVICAL',
    displayName: 'PRESTIGE Cervical Disc',
    company: 'Medtronic',
  },
  {
    test: /^bryan\b/i,
    filterName: 'BRYAN CERVICAL',
    displayName: 'Bryan Cervical Disc',
    company: 'Medtronic',
  },
  {
    test: /^charit/i,
    filterName: 'CHARITE',
    displayName: 'CHARITÉ Artificial Disc',
    company: 'DePuy Synthes',
  },
  {
    test: /^activ[-\s]*l\b/i,
    filterName: 'ACTIV L',
    displayName: 'activL Artificial Disc',
    company: 'Aesculap',
  },
  {
    test: /^pcm\b/i,
    filterName: 'PCM CERVICAL',
    displayName: 'PCM Cervical Disc',
    company: 'NuVasive',
  },
  {
    test: /^superion\b|^vertiflex\b/i,
    filterName: 'SUPERION',
    displayName: 'Superion Indirect Decompression System',
    company: 'Boston Scientific',
  },
  {
    test: /^coflex\b/i,
    filterName: 'COFLEX',
    displayName: 'coflex Interlaminar Technology',
    company: 'Presidio Surgical',
  },
  {
    test: /^infuse\b/i,
    filterName: 'INFUSE',
    displayName: 'INFUSE Bone Graft',
    company: 'Medtronic',
  },
  {
    test: /^ifuse\b|^i-?fuse\b|^si[\s-]?bone\b/i,
    filterName: 'IFUSE',
    displayName: 'iFuse Implant System',
    company: 'SI-BONE',
  },
  {
    test: /^attune\b/i,
    filterName: 'ATTUNE',
    displayName: 'ATTUNE Knee System',
    company: 'DePuy Synthes',
  },
];

function resolveBrandRollup(name: string): {
  filterName: string;
  displayName: string;
  company: string;
} | null {
  const cleaned = sanitizeBrandForSearch(name);
  for (const row of BRAND_ROLLUPS) {
    if (row.test.test(cleaned)) {
      return { filterName: row.filterName, displayName: row.displayName, company: row.company };
    }
  }
  return null;
}

const TITLE_ACRONYMS = new Set([
  'CD',
  'II',
  'III',
  'IV',
  'TLIF',
  'PLIF',
  'ALIF',
  'XLIF',
  'OLIF',
  'ACDF',
  'RT',
  'LT',
  'PL',
  'T2',
  'G7',
  'GMK',
  'DJO',
  'CMS',
  'IM',
  'UKA',
  'TKA',
  'THA',
  'RSA',
  'DBM',
  'BMP',
  'PEEK',
  'UHMWPE',
  'SET',
  'SIGN',
  'KL',
]);

function smartTitleCase(input: string): string {
  return input
    .split(' ')
    .map((word) => {
      if (!word) return word;
      const bare = word.replace(/[^A-Za-z0-9]/g, '');
      const upper = bare.toUpperCase();
      if (TITLE_ACRONYMS.has(upper)) {
        return word.replace(bare, upper);
      }
      // Keep catalog / size tokens (5.5/6.0, KL, C-MNT)
      if (/[0-9]/.test(word)) return word;
      if (word === word.toUpperCase() && bare.length > 1) {
        return word.charAt(0) + word.slice(1).toLowerCase();
      }
      if (word === word.toLowerCase() && bare.length > 1) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ')
    .replace(/\bCd\b/g, 'CD')
    .replace(/\bIi\b/g, 'II')
    .replace(/\bIii\b/g, 'III')
    .replace(/\bNuvasive\b/g, 'NuVasive')
    .replace(/\bDepuy\b/g, 'DePuy')
    .replace(/\bModulex\b/g, 'ModuleX')
    .replace(/\bMetrx\b/g, 'METRx')
    .replace(/\bFibertak\b/g, 'FiberTak')
    .replace(/\bTightrope\b/g, 'TightRope')
    .replace(/\bOrthocord\b/g, 'OrthoCord')
    .replace(/\bTruespan\b/g, 'TrueSpan')
    .replace(/\bBiolox\b/g, 'BIOLOX');
}

export function shortDeviceLabel(name: string): string {
  let cleaned = name
    .replace(/[®™©¿�]+/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*[-–—:]+\s*/, '')
    .trim();

  cleaned = cleaned
    .replace(/, Semi-Constrained.*$/i, '')
    .replace(/, Cemented.*$/i, '')
    .replace(/, Uncemented.*$/i, '')
    .replace(/, Porous.*$/i, '')
    .replace(/ And Accessories$/i, '')
    .replace(/\s+System System$/i, ' System')
    .trim();

  cleaned = smartTitleCase(cleaned);

  // Prefer readable product names over catalog dumps
  if (cleaned.length <= 56) return cleaned;
  return `${cleaned.slice(0, 55).trim()}…`;
}

/** Display title: "Device — Company" when company is known. */
export function formatBrandTitle(name: string, company?: string | null): string {
  const product = shortDeviceLabel(name);
  if (!company) return product;
  const companyLower = company.toLowerCase();
  if (product.toLowerCase().includes(companyLower.split(/[\/+]/)[0].trim())) {
    return product;
  }
  return `${product} — ${company}`;
}

export function resolveCompanyFromBrandName(brand: string): string | null {
  const cleaned = sanitizeBrandForSearch(brand);
  for (const row of BRAND_FAMILY_COMPANY) {
    if (row.test.test(cleaned)) return row.company;
  }
  return null;
}

export function normalizeManufacturerName(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t || /^(unk|unknown|n\/?a|none|not (available|reported|provided))/i.test(t)) return null;

  const n = t.toUpperCase();
  if (/MEDOS|DEPUY|SYNTHES|JOHNSON\s*&\s*JOHNSON|\bJ&J\b|ETHICON|\bMITEK\b/.test(n)) {
    return 'DePuy Synthes';
  }
  if (/MEDTRONIC|WARSAW ORTHOPEDIC|SOFAMOR|DANETEK|KYPHON|\bMSD\b|DEGGENDORF/.test(n)) {
    return 'Medtronic';
  }
  if (/STRYKER|HOWMEDICA|MAKO|TORNIER/.test(n)) return 'Stryker';
  if (/ZIMMER|BIOMET/.test(n)) return 'Zimmer Biomet';
  if (/SMITH\s*&?\s*NEPHEW|SMITH AND NEPHEW/.test(n)) return 'Smith+Nephew';
  if (/ARTHREX/.test(n)) return 'Arthrex';
  if (/NUVASIVE/.test(n)) return 'NuVasive';
  if (/GLOBUS/.test(n)) return 'Globus Medical';
  if (/EXACTECH/.test(n)) return 'Exactech';
  if (/WRIGHT|MICROPORT/.test(n)) return 'Wright / MicroPort';
  if (/CONMED|LINVATEC/.test(n)) return 'CONMED';
  if (/ORTHOFIX|SEA\s*SPINE|SEASPINE/.test(n)) return 'Orthofix';
  if (/AESCULAP|B\.?\s*BRAUN/.test(n)) return 'Aesculap';
  if (/MEDACTA/.test(n)) return 'Medacta';
  if (/DJO|ENCORE|ENOVIS/.test(n)) return 'DJO / Enovis';
  if (/ONKOS/.test(n)) return 'Onkos Surgical';
  if (/CERAMTEC|BIOLOX/.test(n)) return 'CeramTec';
  if (/SIGN\b/.test(n)) return 'SIGN Fracture Care';
  if (/CORIN/.test(n)) return 'Corin';
  if (/LIMA/.test(n)) return 'LimaCorporate';

  // Strip legal suffixes for a readable company line
  const stripped = t
    .replace(/,?\s*(INC\.?|LLC\.?|LTD\.?|LTD|CORP\.?|CORPORATION|CO\.|GMBH|S\.?A\.?R\.?L\.?|AG|PLC)\s*$/i, '')
    .trim();
  if (stripped.length < 2 || stripped.length > 48) return null;
  return smartTitleCase(stripped);
}

const manufacturerByBrandCache = new Map<string, { expiresAt: number; value: string | null }>();

async function lookupManufacturerCompany(brand: string, baseSearch: string): Promise<string | null> {
  const curated = resolveCompanyFromBrandName(brand);
  if (curated) return curated;

  const cacheKey = sanitizeBrandForSearch(brand).toLowerCase();
  const cached = manufacturerByBrandCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const safe = sanitizeBrandForSearch(brand);
  if (!safe) {
    manufacturerByBrandCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: null });
    return null;
  }

  const search = `${baseSearch} AND device.brand_name:"${safe}"`;
  const { status, json } = await openFdaGet(search, {
    count: 'device.manufacturer_d_name.exact',
    limit: '5',
  });

  let company: string | null = null;
  if (status < 400 && !json.error) {
    for (const row of json.results || []) {
      const term = typeof row.term === 'string' ? row.term : '';
      company = normalizeManufacturerName(term);
      if (company) break;
    }
  }

  manufacturerByBrandCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: company });
  return company;
}

async function enrichBrandDevices(
  devices: MaudeTopDevice[],
  baseSearch: string
): Promise<MaudeTopDevice[]> {
  return mapPool(devices, 4, async (device) => {
    const company =
      device.company || (await lookupManufacturerCompany(device.name, baseSearch));
    return {
      ...device,
      company,
      // Keep curated rollup display names (e.g. "Mobi-C Cervical Disc").
      shortLabel: device.shortLabel || shortDeviceLabel(device.name),
      icon: device.icon || classifyDeviceIcon(device.name),
    };
  });
}

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
      company: brand.company,
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
  if (/\bhorizon\b|\bviper\b|\bexpedium\b|\bxia\b|\bsolera\b|\bmesal\b|\btlif\b|\bspinal\b|\bcervical\b|\bdisc\b|\bmobi-?c\b|\bprodisc\b|\bsimplify\b|\bm6-?c\b|\bsecure-?c\b|\bsuperion\b|\bcoflex\b|\bifuse\b|\binfuse\b/.test(n)) {
    return 'spine';
  }
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

/** openFDA rejects queries containing ® / ¿ / similar symbols in brand_name. */
function sanitizeBrandForSearch(brand: string): string {
  return brand
    .replace(/["\\]/g, '')
    .replace(/[®™©¿�]+/g, '')
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
  if (/^unk(\b|[-\s_])/i.test(t)) return false;
  if (/^unknown(\b|[-\s_])/i.test(t)) return false;
  if (/^n\/?a(\b|[-\s])/i.test(t)) return false;
  if (JUNK_BRAND_PHRASE.test(t)) return false;
  if (COMPANY_AS_BRAND.test(sanitizeBrandForSearch(t))) return false;
  // Catalog / collector noise, components without a commercial system name
  if (/^collect\./i.test(t)) return false;
  if (/^(closure top|single-inner setscrew|setscrew)$/i.test(t)) return false;
  if (/^(suture|anchor|screw|plate|rod|nail|wire|pin)$/i.test(t)) return false;
  if (/\b(applicator|inner shaft|outer shaft)\b/i.test(t)) return false;
  // Disc / implant components without a commercial system name
  if (/^(inferior|superior)\s+(plate|end\s*plate)/i.test(t)) return false;
  if (/^polyethylene\s+inlay/i.test(t)) return false;
  if (/^(end\s*plate|inlay|core|keel)(\s|$)/i.test(t)) return false;
  // SKU-like rows: "4K C-MNT SCP,4.0,30,167,MITEK"
  if (/^\d/.test(t) && (t.match(/,/g) || []).length >= 2) return false;
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
      labelParts.push(formatBrandTitle(brand, resolveCompanyFromBrandName(brand)));
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
    // High limit so size-SKU disc brands (Mobi-C, prodisc C, …) can be rolled up.
    limit: String(1000),
  });

  if (status === 404 || json.error?.code === 'NOT_FOUND') return [];
  if (status >= 400) {
    logger.warn('openFDA top-brands count failed', { status, message: json.error?.message });
    return [];
  }

  const rolled = new Map<string, MaudeTopDevice>();
  for (const row of json.results || []) {
    const rawName = typeof row.term === 'string' ? row.term.trim() : '';
    const count = typeof row.count === 'number' ? row.count : 0;
    if (!rawName || count <= 0) continue;

    const rollup = resolveBrandRollup(rawName);
    if (!rollup && !isUsableBrand(rawName)) continue;

    const name = rollup?.filterName || rawName;
    const key = sanitizeBrandForSearch(name).toLowerCase();
    if (!key) continue;

    const existing = rolled.get(key);
    if (existing) {
      existing.count += count;
      continue;
    }

    rolled.set(key, {
      name,
      count,
      icon: classifyDeviceIcon(rollup?.displayName || name),
      shortLabel: rollup?.displayName || shortDeviceLabel(name),
      company: rollup?.company || resolveCompanyFromBrandName(name),
      kind: 'brand',
    });
  }

  const devices = [...rolled.values()].sort((a, b) => b.count - a.count);
  const enriched = await enrichBrandDevices(devices.slice(0, limit), search);
  return enriched;
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
  company: string | null;
  count: number;
  icon: MaudeDeviceIcon;
  /** How the match ranked: concept (clinical phrase) | exact | prefix | contains */
  match: 'concept' | 'exact' | 'prefix' | 'contains';
  /** Human label when hit came from a clinical concept expansion */
  conceptLabel?: string;
};

const brandSearchCache = new Map<string, { expiresAt: number; value: MaudeBrandSearchHit[] }>();

/**
 * Clinical / colloquial phrases → openFDA device-class (or keyword) scopes.
 * Lets "cervical disc arthroplasty" return Mobi-C / prodisc C / Simplify / … instead of brand-prefix miss.
 */
type MaudeSearchConcept = {
  id: string;
  label: string;
  test: RegExp;
  clause: string;
  prefer?: RegExp;
  demote?: RegExp;
};

const SEARCH_CONCEPTS: MaudeSearchConcept[] = [
  {
    id: 'cervical-disc-arthroplasty',
    label: 'Cervical disc arthroplasty',
    test: /\b(cervical\s+(disc|tdr|adr|arthroplasty)|c-?adr|artificial\s+cervical\s+disc|cervical\s+artificial\s+disc)\b/i,
    // Stick to the disc-prosthesis class — "cervical + intervertebral" also matches ACDF cages.
    clause: DISC_ARTHROPLASTY,
    prefer: /\bmobi|prodisc[-\s]*c\b|simplify|m6-?c|secure-?c|prestige|pcm\b|bryan|discover|activ.?c|cervical|pcm\s+cervical/i,
    demote: /\bprodisc[-\s]*l\b|lumbar|activ.?l|charit[eé]|maverick|flexicore/i,
  },
  {
    id: 'lumbar-disc-arthroplasty',
    label: 'Lumbar disc arthroplasty',
    test: /\b(lumbar\s+(disc|tdr|adr|arthroplasty)|l-?adr|artificial\s+lumbar\s+disc|lumbar\s+artificial\s+disc)\b/i,
    clause: DISC_ARTHROPLASTY,
    prefer: /\bprodisc[-\s]*l\b|activ.?l|lumbar|charit[eé]|maverick|flexicore|orbitr|activ-l/i,
    demote: /\bmobi|prodisc[-\s]*c\b|simplify|m6-?c|secure|prestige|pcm\b|bryan|cervical/i,
  },
  {
    id: 'disc-arthroplasty',
    label: 'Disc arthroplasty',
    test: /\b((total\s+)?disc\s+(replacement|arthroplasty)|artificial\s+disc|tdr\b|adr\b|intervertebral\s+disc\s+prosthes)/i,
    clause: DISC_ARTHROPLASTY,
    prefer: /\bmobi|prodisc|simplify|m6|secure|prestige|pcm|bryan|activ|charit|disc/i,
  },
  {
    id: 'spinous-spacer',
    label: 'Interspinous spacer',
    test: /\b(interspinous|spinous\s+(process\s+)?spacer|superion|vertiflex|coflex|x-?stop|Wallis)\b/i,
    clause: SPINOUS_SPACER,
    prefer: /\bsuperion|vertiflex|coflex|x-?stop|wallis/i,
  },
  {
    id: 'si-fusion',
    label: 'SI joint fusion',
    test: /\b(si[- ]?(joint\s+)?fusion|sacroiliac|i-?fuse|ifuse|triangular\s+titanium)\b/i,
    clause: `(device.openfda.device_name:(sacro OR sacroiliac) OR device.brand_name:(IFUSE OR iFuse OR IFUSE OR SI-BONE OR Sacro))`,
    prefer: /\bifuse|i-?fuse|sacro|si-?bone|zyga|enthesis/i,
  },
  {
    id: 'infuse-rhbmp',
    label: 'rhBMP / INFUSE',
    test: /\b(infuse|rh\s*-?\s*bmp|bone\s+morphogenetic|bmp-?2)\b/i,
    clause: RHBMP_FILLER,
    prefer: /\binfuse|bmp|medtronic/i,
  },
  {
    id: 'kyphoplasty-vertebroplasty',
    label: 'Kyphoplasty / vertebroplasty',
    test: /\b(kypho(plasty)?|vertebro(plasty)?|vertebral\s+augmentation|balloon\s+kypho)\b/i,
    clause: `(device.openfda.device_name:(kypho OR vertebro OR "vertebral augmentation") OR device.brand_name:(Kyphon OR SpineJack OR AVAflex))`,
    prefer: /\bkyphon|spinejack|avaflex|medtronic|stryker|vertebro|kypho/i,
  },
  {
    id: 'pedicle-fixation',
    label: 'Pedicle screw fixation',
    test: /\b(pedicle\s+screw|spinal\s+fixation|thoracolumbar\s+fixation|rods?\s+and\s+screws?|posterior\s+fixation)\b/i,
    clause: `(device.openfda.device_name:(pedicle OR "spinal fixation" OR "thoracolumbosacral") OR device.brand_name:(HORIZON OR VIPER OR EXPEDIUM OR XIA OR CREO OR RELINE OR SOLERA))`,
    prefer: /\bhorizon|viper|expedium|xia|creo|reline|solera|vital|mesa|polaris/i,
  },
  {
    id: 'uka',
    label: 'Unicompartmental knee',
    test: /\b(uka|unicompartmental|partial\s+knee|uni\s+knee)\b/i,
    clause: `(${UKA_MOBILE_BEARING} OR (device.openfda.device_name:(unicompartmental OR "uni-compartmental")))`,
    prefer: /\boxford|zimmer|persona\s*partial|journey|physica|restoris|mako/i,
  },
  {
    id: 'mobile-bearing-knee',
    label: 'Mobile-bearing knee',
    test: /\b(mobile[- ]bearing(\s+knee)?|rotating\s+platform)\b/i,
    clause: `(${MOBILE_BEARING_KNEE} OR ${UKA_MOBILE_BEARING})`,
    prefer: /\battune|lcs|sigma|pfc|rotating|mobile/i,
  },
  {
    id: 'reverse-shoulder',
    label: 'Reverse shoulder arthroplasty',
    test: /\b(reverse\s+shoulder|rsa\b|reverse\s+total\s+shoulder)\b/i,
    clause: `(device.openfda.device_name:(shoulder AND (reverse OR humeral)) OR device.brand_name:(Equinoxe OR Aequalis OR AltiVate OR Comprehensive OR Inhance OR Tornier))`,
    prefer: /\bequinoxe|aequalis|altiv|comprehensive|inhance|tornier|reverse|delta/i,
  },
];

function normalizeSearchQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/[®™©¿�"'`]/g, '')
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveSearchConcepts(q: string): MaudeSearchConcept[] {
  const n = normalizeSearchQuery(q);
  if (n.length < 2) return [];
  const matched = SEARCH_CONCEPTS.filter((c) => c.test.test(n));
  // Prefer region-specific disc concepts over the generic "disc arthroplasty" catch-all
  const hasRegionalDisc = matched.some(
    (c) => c.id === 'cervical-disc-arthroplasty' || c.id === 'lumbar-disc-arthroplasty'
  );
  return matched.filter((c) => !(hasRegionalDisc && c.id === 'disc-arthroplasty'));
}

async function fetchBrandCounts(
  search: string,
  limit: number
): Promise<Array<{ name: string; count: number }>> {
  const { status, json } = await openFdaGet(search, {
    count: 'device.brand_name.exact',
    limit: String(Math.min(100, Math.max(20, limit))),
  });
  if (status === 404 || json.error?.code === 'NOT_FOUND') return [];
  if (status >= 400) {
    throw new Error(`openFDA error ${status}: ${(json.error?.message || '').slice(0, 160)}`);
  }
  const out: Array<{ name: string; count: number }> = [];
  for (const row of json.results || []) {
    const name = typeof row.term === 'string' ? row.term.trim() : '';
    const count = typeof row.count === 'number' ? row.count : 0;
    if (!isUsableBrand(name) || count <= 0) continue;
    out.push({ name, count });
  }
  return out;
}

function scoreConceptBrand(name: string, concept: MaudeSearchConcept): number {
  // Hard-drop demoted brands for regional disc queries (don't show cervical TDR under "lumbar…")
  if (concept.demote?.test(name) && concept.prefer) {
    // keep if also clearly preferred (rare); otherwise exclude from this concept pass
    if (!concept.prefer.test(name)) return -10000;
  }
  let score = 0;
  if (concept.prefer?.test(name)) score += 100;
  if (concept.demote?.test(name)) score -= 80;
  // Prefer rolled-up commercial families
  if (BRAND_ROLLUPS.some((r) => r.test.test(name))) score += 40;
  return score;
}

/**
 * Live brand autocomplete against openFDA.
 * Supports clinical phrases ("cervical disc arthroplasty") via concept expansion,
 * plus classic brand prefix / token matching.
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

  const cacheKey = `${specialty}|${safe.toLowerCase()}|${limit}|v2`;
  const cached = brandSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const concepts = resolveSearchConcepts(raw);
  const qLower = safe.toLowerCase();
  const tokens = qLower.split(/\s+/).filter((t) => t.length >= 2);

  const byKey = new Map<string, MaudeBrandSearchHit & { _score: number }>();

  const upsert = (
    name: string,
    count: number,
    match: MaudeBrandSearchHit['match'],
    score: number,
    conceptLabel?: string
  ) => {
    const key = sanitizeBrandForSearch(name).toLowerCase();
    if (!key) return;
    const existing = byKey.get(key);
    const hit: MaudeBrandSearchHit & { _score: number } = {
      name,
      shortLabel: (() => {
        const rollup = BRAND_ROLLUPS.find((r) => r.test.test(name));
        return rollup?.displayName || shortDeviceLabel(name);
      })(),
      company: resolveCompanyFromBrandName(name),
      count,
      icon: classifyDeviceIcon(name),
      match,
      conceptLabel,
      _score: score,
    };
    if (!existing || hit._score > existing._score || (hit._score === existing._score && hit.count > existing.count)) {
      byKey.set(key, hit);
    } else if (existing && count > existing.count) {
      existing.count = count;
    }
  };

  // 1) Clinical concept expansion (e.g. cervical / lumbar disc arthroplasty)
  for (const concept of concepts.slice(0, 2)) {
    const search = `(${specialtyDef.searchClause}) AND (${concept.clause})`;
    try {
      const rows = await fetchBrandCounts(search, 100);
      for (const row of rows) {
        const boost = scoreConceptBrand(row.name, concept);
        if (boost <= -10000) continue;
        upsert(row.name, row.count, 'concept', 1000 + boost + Math.min(row.count, 200), concept.label);
      }
      // Ensure well-known rollups for this concept appear even if FDA naming is noisy
      for (const rollup of BRAND_ROLLUPS) {
        if (concept.prefer && !concept.prefer.test(rollup.displayName) && !concept.prefer.test(rollup.filterName)) {
          continue;
        }
        if (concept.demote?.test(rollup.displayName)) continue;
        const already = [...byKey.values()].some(
          (h) => sanitizeBrandForSearch(h.name).toLowerCase().includes(rollup.filterName.toLowerCase().split(/\s+/)[0])
        );
        if (already) continue;
        // Light placeholder — real count filled if openFDA returned a sibling SKU
        upsert(rollup.filterName, 1, 'concept', 900 + scoreConceptBrand(rollup.displayName, concept), concept.label);
      }
    } catch {
      // Fall through to brand search
    }
  }

  // 2) Direct brand prefix / wildcard (classic autocomplete)
  try {
    const brandSearch = `${specialtyDef.searchClause} AND device.brand_name:${safe}*`;
    const brandRows = await fetchBrandCounts(brandSearch, 80);
    for (const row of brandRows) {
      const nameLower = row.name.toLowerCase();
      const cleanLower = sanitizeBrandForSearch(row.name).toLowerCase();
      let match: MaudeBrandSearchHit['match'] = 'contains';
      let score = 100;
      if (nameLower === qLower || cleanLower === qLower) {
        match = 'exact';
        score = 800;
      } else if (nameLower.startsWith(qLower) || cleanLower.startsWith(qLower)) {
        match = 'prefix';
        score = 600;
      } else if (nameLower.includes(qLower) || cleanLower.includes(qLower)) {
        match = 'contains';
        score = 400;
      } else if (cleanLower.split(/\s+/).some((t) => t.startsWith(qLower))) {
        match = 'prefix';
        score = 500;
      } else {
        continue;
      }
      upsert(row.name, row.count, match, score + Math.min(row.count, 100));
    }
  } catch {
    // ignore
  }

  // 3) Multi-token clinical/device_name fallback when no strong brand prefix hits
  //    e.g. "cervical cage", "pedicle screw" without matching a named concept perfectly
  if (tokens.length >= 2 && byKey.size < limit) {
    const deviceTokenClause = tokens
      .slice(0, 4)
      .map((t) => `device.openfda.device_name:${t.replace(/"/g, '')}`)
      .join(' AND ');
    try {
      const search = `(${specialtyDef.searchClause}) AND (${deviceTokenClause})`;
      const rows = await fetchBrandCounts(search, 60);
      for (const row of rows) {
        upsert(row.name, row.count, 'contains', 250 + Math.min(row.count, 80));
      }
    } catch {
      // ignore
    }
  }

  const rank = { concept: 0, exact: 1, prefix: 2, contains: 3 } as const;
  const ranked = [...byKey.values()].sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    const rd = rank[a.match] - rank[b.match];
    if (rd !== 0) return rd;
    if (b.count !== a.count) return b.count - a.count;
    return a.shortLabel.localeCompare(b.shortLabel);
  });

  // Collapse FDA size/SKU brand_name rows into one commercial product for the dropdown
  const collapsed: Array<MaudeBrandSearchHit & { _score: number }> = [];
  const seenRollup = new Set<string>();
  for (const hit of ranked) {
    const rollup = BRAND_ROLLUPS.find((r) => r.test.test(hit.name));
    const dedupeKey = rollup
      ? `rollup:${rollup.filterName.toLowerCase()}`
      : `name:${sanitizeBrandForSearch(hit.shortLabel).toLowerCase()}`;
    if (seenRollup.has(dedupeKey)) {
      const existing = collapsed.find((c) => {
        const r = BRAND_ROLLUPS.find((x) => x.test.test(c.name));
        const k = r
          ? `rollup:${r.filterName.toLowerCase()}`
          : `name:${sanitizeBrandForSearch(c.shortLabel).toLowerCase()}`;
        return k === dedupeKey;
      });
      if (existing) existing.count += hit.count;
      continue;
    }
    seenRollup.add(dedupeKey);
    if (rollup) {
      collapsed.push({
        ...hit,
        name: rollup.filterName,
        shortLabel: rollup.displayName,
        company: rollup.company || hit.company,
      });
    } else {
      collapsed.push(hit);
    }
  }

  const value: MaudeBrandSearchHit[] = collapsed.slice(0, limit).map(({ _score: _s, ...rest }) => rest);
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
          company: device.company,
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
  /** Cleaned product name. */
  shortLabel: string;
  company: string | null;
  /** "Device — Company" when company known. */
  displayTitle: string;
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
  title: string,
  total: number,
  eventTypes: MaudeCountTerm[],
  deviceProblems: MaudeCountTerm[],
  patientProblems: MaudeCountTerm[]
): string {
  const parts: string[] = [];
  parts.push(
    `${title} has ${total.toLocaleString()} MAUDE report${total === 1 ? '' : 's'} in this window.`
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

  const baseSearch = buildSearch({
    specialty: options.specialty,
    startCompact: window.startCompact,
    endCompact: window.endCompact,
  }).search;
  const company =
    resolveCompanyFromBrandName(brand) || (await lookupManufacturerCompany(brand, baseSearch));
  const shortLabel = shortDeviceLabel(brand);
  const displayTitle = formatBrandTitle(brand, company);

  const value: MaudeBrandSynopsis = {
    brand,
    shortLabel,
    company,
    displayTitle,
    label,
    specialty,
    startDate: window.startIso,
    endDate: window.endIso,
    totalReports,
    summary: buildSynopsisSummary(
      displayTitle,
      totalReports,
      eventTypes,
      deviceProblems,
      patientProblems
    ),
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
