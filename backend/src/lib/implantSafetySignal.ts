/**
 * Reported safety signal (FDA MAUDE), ost-safety-v1. Pure scoring core, no I/O.
 *
 * Formula, prior and thresholds are documented in docs/implant-safety-signal.md.
 * Keep that file and these constants in sync.
 *
 * MAUDE reports are voluntary and there is no implant denominator, so this is a
 * reporting signal relative to the device's own FDA product-code category, never a
 * failure rate.
 */

export const SAFETY_SIGNAL_VERSION = 'ost-safety-v1';

/** Window for MAUDE counts (same 365 days as the detail-page MAUDE snapshot). */
export const SAFETY_WINDOW_DAYS = 365;
/** Recall lookback (recalls are rare; a 12-month window would miss most of them). */
export const RECALL_LOOKBACK_MONTHS = 60;

/** Fewer device reports than this in the window: Insufficient data, no score. */
export const MIN_DEVICE_REPORTS = 5;
/** Category baseline needs at least this many reports across the device's product codes. */
export const MIN_CATEGORY_REPORTS = 50;
/** Category baseline needs at least this many distinct brands in one product code. */
export const MIN_CATEGORY_BRANDS = 3;
/** A product code joins the baseline when it holds at least this share of the device's reports. */
export const MIN_CODE_SHARE = 0.05;
/** At most this many product codes per device. */
export const MAX_CODES = 5;

/** Per-report severity weights by MAUDE event_type. Death > serious injury > malfunction. */
export const SEVERITY_WEIGHTS = {
  death: 10,
  injury: 4,
  malfunction: 1,
  other: 0.5,
} as const;
/** Extra weight for a report that names a device break or fracture (product_problems). */
export const BREAK_WEIGHT = 3;

/** Prior strength: the category mix counts as this many pseudo-reports. */
export const PRIOR_STRENGTH_K = 25;

/** Multiplier per distinct recall event in the lookback, by FDA recall class. */
export const RECALL_FACTORS = { 'Class I': 0.5, 'Class II': 0.75, 'Class III': 0.92 } as const;
/** Any Class I recall in the lookback caps the score here. */
export const CLASS_I_CAP = 4;
/** Best score a device with reports can reach (10.0 would read as "no reports at all"). */
export const MAX_SCORE_WITH_REPORTS = 9.5;

export type SeverityCounts = {
  death: number;
  injury: number;
  malfunction: number;
  other: number;
  /** Sum of event types (same count as the MAUDE snapshot). */
  total: number;
  /** Reports whose product_problems include Break or Fracture. */
  breaks: number;
};

export type CategoryCode = {
  code: string;
  /** Device name FDA uses for the product code, when known. */
  name?: string | null;
  /** Share of this device's reports filed under the code (0 to 1). */
  share: number;
  /** All brands' reports under the code in the same window. */
  counts: SeverityCounts;
  /** Distinct brand names reported under the code in the window. */
  brandCount: number;
};

export type RecallClass = keyof typeof RECALL_FACTORS;

export type RecallEvent = {
  id: string;
  classification: RecallClass;
  date: string | null;
  firm: string | null;
  product: string;
  reason: string | null;
  url: string;
};

export type SafetySource = { label: string; url: string };

export type SafetyConfidence = 'high' | 'medium' | 'low' | 'insufficient';

export type SafetySignalInput = {
  device: SeverityCounts;
  categories: CategoryCode[];
  recalls: RecallEvent[];
  trend: { recentTotal: number; priorTotal: number; months: Array<{ month: string; count: number }> };
  sources: SafetySource[];
  pulledAt: string;
  windowStart: string;
  windowEnd: string;
};

export type SafetySignal = {
  version: typeof SAFETY_SIGNAL_VERSION;
  score: number | null;
  confidence: SafetyConfidence;
  /** Why the score is null or why confidence was lowered. */
  notes: string[];
  counts: SeverityCounts;
  severityIndex: number | null;
  categoryIndex: number | null;
  shrunkIndex: number | null;
  /** N / (N + k): how much of the posterior comes from the device's own reports. */
  shrinkWeight: number | null;
  relative: number | null;
  breakShare: number | null;
  categoryBreakShare: number | null;
  shrunkBreakShare: number | null;
  breakCap: number | null;
  recallFactor: number;
  priorStrength: number;
  categoryReports: number;
  categoryBrands: number;
  codeCoverage: number;
  /** Device reports as a share of its own baseline (high means it shapes its own baseline). */
  selfShare: number | null;
  categories: Array<Pick<CategoryCode, 'code' | 'name' | 'share' | 'brandCount'> & { reports: number }>;
  recalls: RecallEvent[];
  trend: SafetySignalInput['trend'];
  sources: SafetySource[];
  pulledAt: string;
  windowStart: string;
  windowEnd: string;
};

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Mean severity weight per report. */
export function severityIndex(c: SeverityCounts): number {
  if (c.total <= 0) return 0;
  const w =
    SEVERITY_WEIGHTS.death * c.death +
    SEVERITY_WEIGHTS.injury * c.injury +
    SEVERITY_WEIGHTS.malfunction * c.malfunction +
    SEVERITY_WEIGHTS.other * c.other +
    BREAK_WEIGHT * c.breaks;
  return w / c.total;
}

/** Beta/Gamma style shrinkage: (N * x + k * prior) / (N + k). */
export function shrink(deviceValue: number, n: number, prior: number, k = PRIOR_STRENGTH_K): number {
  return (n * deviceValue + k * prior) / (n + k);
}

/** Relative severity R to a 0 to 10 score: 5 at the category mean, higher is quieter. */
export function scoreFromRelative(r: number): number {
  return 10 / (1 + r * r);
}

export function recallFactor(recalls: RecallEvent[]): number {
  return recalls.reduce((f, r) => f * (RECALL_FACTORS[r.classification] ?? 1), 1);
}

/** Pick product codes holding at least MIN_CODE_SHARE of the device's reports, largest first. */
export function selectCodes(codes: CategoryCode[]): CategoryCode[] {
  return [...codes]
    .filter((c) => c.share >= MIN_CODE_SHARE && c.counts.total > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, MAX_CODES);
}

/** Share-weighted category baseline across the device's product codes. */
export function categoryBaseline(codes: CategoryCode[]): {
  index: number;
  breakShare: number;
  reports: number;
  brands: number;
  coverage: number;
} {
  const coverage = codes.reduce((s, c) => s + c.share, 0);
  if (coverage <= 0) return { index: 0, breakShare: 0, reports: 0, brands: 0, coverage: 0 };
  const index = codes.reduce((s, c) => s + c.share * severityIndex(c.counts), 0) / coverage;
  const breakShare =
    codes.reduce((s, c) => s + c.share * (c.counts.breaks / Math.max(1, c.counts.total)), 0) / coverage;
  return {
    index,
    breakShare,
    reports: codes.reduce((s, c) => s + c.counts.total, 0),
    brands: codes.reduce((m, c) => Math.max(m, c.brandCount), 0),
    coverage,
  };
}

export function computeSafetySignal(input: SafetySignalInput): SafetySignal {
  const d = input.device;
  const n = d.total;
  const codes = selectCodes(input.categories);
  const base = categoryBaseline(codes);
  const notes: string[] = [];
  const rf = recallFactor(input.recalls);

  const out: SafetySignal = {
    version: SAFETY_SIGNAL_VERSION,
    score: null,
    confidence: 'insufficient',
    notes,
    counts: d,
    severityIndex: n > 0 ? round(severityIndex(d), 3) : null,
    categoryIndex: base.reports > 0 ? round(base.index, 3) : null,
    shrunkIndex: null,
    shrinkWeight: null,
    relative: null,
    breakShare: n > 0 ? round(d.breaks / n, 3) : null,
    categoryBreakShare: base.reports > 0 ? round(base.breakShare, 3) : null,
    shrunkBreakShare: null,
    breakCap: null,
    recallFactor: round(rf, 3),
    priorStrength: PRIOR_STRENGTH_K,
    categoryReports: base.reports,
    categoryBrands: base.brands,
    codeCoverage: round(base.coverage, 3),
    selfShare: null,
    categories: codes.map((c) => ({
      code: c.code,
      name: c.name ?? null,
      share: round(c.share, 3),
      brandCount: c.brandCount,
      reports: c.counts.total,
    })),
    recalls: input.recalls,
    trend: input.trend,
    sources: input.sources,
    pulledAt: input.pulledAt,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  };

  if (n < MIN_DEVICE_REPORTS) {
    notes.push(`Fewer than ${MIN_DEVICE_REPORTS} MAUDE reports in the window.`);
    return out;
  }
  if (codes.length === 0 || base.reports < MIN_CATEGORY_REPORTS || base.index <= 0) {
    notes.push(`No product-code baseline with at least ${MIN_CATEGORY_REPORTS} reports.`);
    return out;
  }
  if (base.brands < MIN_CATEGORY_BRANDS) {
    notes.push(`Fewer than ${MIN_CATEGORY_BRANDS} brands in the product-code baseline.`);
    return out;
  }

  const sDev = severityIndex(d);
  const sPost = shrink(sDev, n, base.index);
  const r = sPost / base.index;
  const pPost = shrink(d.breaks / n, n, base.breakShare);
  const breakCap = 10 * (1 - pPost);
  let score = Math.min(scoreFromRelative(r), breakCap, MAX_SCORE_WITH_REPORTS);
  score *= rf;
  if (input.recalls.some((x) => x.classification === 'Class I')) score = Math.min(score, CLASS_I_CAP);
  const selfShare =
    codes.reduce((s, c) => s + c.share * n, 0) / Math.max(1, base.reports);

  let confidence: SafetyConfidence;
  if (n >= 100 && base.reports >= 1000 && base.coverage >= 0.8) confidence = 'high';
  else if (n >= 25 && base.reports >= 200 && base.coverage >= 0.5) confidence = 'medium';
  else confidence = 'low';
  if (selfShare > 0.5 && confidence !== 'low') {
    confidence = confidence === 'high' ? 'medium' : 'low';
    notes.push('The device makes up more than half of its own baseline, so confidence is lowered.');
  }

  return {
    ...out,
    score: round(Math.max(0, score), 1),
    confidence,
    shrunkIndex: round(sPost, 3),
    shrinkWeight: round(n / (n + PRIOR_STRENGTH_K), 3),
    relative: round(r, 3),
    shrunkBreakShare: round(pPost, 3),
    breakCap: round(breakCap, 2),
    selfShare: round(selfShare, 3),
  };
}

/** Directory Score coupling: label and hazard from the safety score. */
export function safetyLabel(s: SafetySignal): {
  label: 'quiet' | 'watch' | 'elevated' | 'insufficient';
  hazard: number | null;
} {
  if (s.score == null) return { label: 'insufficient', hazard: null };
  const hazard = round(1 - s.score / 10, 3);
  if (s.score < 3.5) return { label: 'elevated', hazard };
  if (s.score < 5) return { label: 'watch', hazard };
  return { label: 'quiet', hazard };
}
