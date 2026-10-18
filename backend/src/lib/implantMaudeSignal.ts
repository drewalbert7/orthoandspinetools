/**
 * Peer-normalized MAUDE surveillance signal for Directory Score v2.
 * Uses the same brand search and 365-day window as the detail-page MAUDE snapshot,
 * plus cached specialty trend series for peer context.
 */

import {
  getMaudeBrandSynopsis,
  getMaudeDailyTrends,
  shortDeviceLabel,
  type MaudeBrandSeries,
  type MaudeDailyPoint,
} from './openFdaMaude';
import { logger } from '../utils/logger';

export type MaudeSignalLabel = 'quiet' | 'watch' | 'elevated' | 'unlinked' | 'insufficient';

export type MaudeSignalSnapshot = {
  linked: boolean;
  label: MaudeSignalLabel;
  /** 0 = quiet, 1 = alarming */
  hazard: number | null;
  /** 10 = quiet / favorable surveillance, 0 = hot */
  quietScore: number | null;
  recentTotal: number | null;
  priorTotal: number | null;
  changePct: number | null;
  risingScore: number | null;
  /** 0–1 within specialty peer set (1 = highest rising among peers) */
  peerRisingPercentile: number | null;
  /** 0–1 within specialty peer set (1 = highest recent volume) */
  peerVolumePercentile: number | null;
  peerCount: number;
  matchedBrand: string | null;
  windowLabel: string | null;
  /**
   * Total openFDA reports for the brand key in the same window and search the
   * detail-page MAUDE snapshot uses (synopsis totalReports). Score and snapshot
   * read one number, so they cannot disagree.
   */
  windowReports?: number | null;
};

/** Window the detail-page MAUDE snapshot uses (ImplantDetail.tsx synopsis query, days: 365). */
export const MAUDE_SIGNAL_WINDOW_DAYS = 365;
/** Recent vs prior halves inside that window (months, monthly grain for 365 days). */
export const MAUDE_SIGNAL_HALF_MONTHS = 6;
/**
 * Best MAUDE quiet score a linked device with reports in the window can get.
 * 10.0 would read as "no reports at all"; a device with reports never shows that.
 */
export const MAUDE_MAX_QUIET_WITH_REPORTS = 9.5;

/**
 * Minimum total report count (recent + prior) before MAUDE signal can lower a score.
 * Below this threshold, hazard is not applied (label = 'insufficient').
 */
export const MAUDE_MIN_REPORTS_FOR_HAZARD = 5;

function percentileRank(value: number, population: number[]): number {
  if (population.length === 0) return 0.5;
  const sorted = [...population].sort((a, b) => a - b);
  let below = 0;
  for (const v of sorted) {
    if (v < value) below += 1;
    else break;
  }
  // Mid-rank tie handling
  const equal = sorted.filter((v) => v === value).length;
  return (below + 0.5 * equal) / sorted.length;
}

/**
 * Map peer-normalized rising + volume into hazard ∈ [0,1].
 *
 * Velocity-first (critical): flat or declining report windows must stay quiet even
 * when peer rising-percentile looks mid/high (peers declining faster ≠ problem).
 * Elevated requires actual positive rising + peer outlier rank.
 * Low report counts are damped — don't panic on n≈1–2.
 *
 * CRITICAL: Below MAUDE_MIN_REPORTS_FOR_HAZARD, hazard cannot lower a score.
 * This prevents a device with 2 reports from being penalized vs. one with 7.
 */
export function hazardFromPeerStats(input: {
  risingScore: number;
  recentTotal: number;
  priorTotal: number;
  peerRisingPercentile: number;
  peerVolumePercentile: number;
  /** Snapshot report count for the whole window; when given, gates on it too. */
  windowReports?: number;
}): { hazard: number; label: MaudeSignalLabel; quietScore: number | null } {
  const n = Math.max(input.recentTotal + input.priorTotal, input.windowReports ?? 0);
  const risingP = clamp01(input.peerRisingPercentile);
  const volumeP = clamp01(input.peerVolumePercentile);
  const rs = input.risingScore;

  // Below minimum threshold: no hazard applied and no score (label = 'insufficient').
  // Never return 10.0 here: too few reports is "Insufficient data", not "quiet".
  if (n < MAUDE_MIN_REPORTS_FOR_HAZARD) {
    return {
      hazard: 0,
      label: 'insufficient',
      quietScore: null,
    };
  }

  let hazard: number;

  if (rs <= 0) {
    // Flat / declining: no problem signal. Tiny volume presence for facet display only.
    hazard = 0.1 * volumeP + 0.06 * Math.max(0, risingP - 0.55);
    if (rs < -20) hazard *= 0.45;
    else if (rs < 0) hazard *= 0.7;
  } else {
    // Positive rising: peer rank + magnitude; volume secondary (workhorses ≠ auto-fail)
    const magnitude = clamp01(rs / (rs + 90)); // ~0.53 at rs=100, ~0.69 at rs=200
    hazard =
      0.52 * Math.pow(risingP, 1.2) +
      0.28 * magnitude +
      0.2 * Math.pow(volumeP, 1.05);
    if (risingP >= 0.8 && rs >= 50) hazard = Math.min(1, hazard + 0.1);
    if (risingP >= 0.9 && rs >= 120) hazard = Math.min(1, hazard + 0.08);
  }

  // Gradual ramp for reports between threshold and 10
  if (n < 10) {
    const ramp = (n - MAUDE_MIN_REPORTS_FOR_HAZARD) / (10 - MAUDE_MIN_REPORTS_FOR_HAZARD);
    hazard *= 0.5 + 0.5 * ramp;
  }

  hazard = clamp01(hazard);

  const quietScore = Math.min(MAUDE_MAX_QUIET_WITH_REPORTS, round1(10 * (1 - hazard)));
  let label: MaudeSignalLabel;
  if (rs > 0 && hazard >= 0.55) label = 'elevated';
  else if (rs > 0 && hazard >= 0.32) label = 'watch';
  else label = 'quiet';

  return { hazard, label, quietScore };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function sumCounts(points: MaudeDailyPoint[]): number {
  return points.reduce((acc, p) => acc + p.count, 0);
}

/**
 * Recent vs earlier split of the window's monthly series: the last N months vs every month
 * before them, so recent + prior adds up to the whole window (same total as the snapshot).
 */
export function splitHalves(
  series: MaudeDailyPoint[],
  halfMonths = MAUDE_SIGNAL_HALF_MONTHS
): { recentTotal: number; priorTotal: number } {
  const cut = Math.max(0, series.length - halfMonths);
  return { recentTotal: sumCounts(series.slice(cut)), priorTotal: sumCounts(series.slice(0, cut)) };
}

/** Same rising formula as computeTrendingBrands in openFdaMaude.ts (monthly smoothing 2). */
export function risingScoreFor(recentTotal: number, priorTotal: number): number {
  if (recentTotal === 0 && priorTotal === 0) return -1000;
  const smooth = 2;
  const velocity = (recentTotal - priorTotal) / (priorTotal + smooth);
  const volumeFactor = Math.log2(recentTotal + priorTotal + 2);
  let rs = velocity * volumeFactor * 100;
  if (priorTotal === 0 && recentTotal > 0) rs += 25 + recentTotal * 2;
  return rs;
}

export type MaudePeerWindow = { recentTotal: number; priorTotal: number; windowTotal: number };

function emptySnapshot(linked: boolean, label: MaudeSignalLabel): MaudeSignalSnapshot {
  return {
    linked,
    label,
    hazard: null,
    quietScore: null,
    recentTotal: null,
    priorTotal: null,
    changePct: null,
    risingScore: null,
    peerRisingPercentile: null,
    peerVolumePercentile: null,
    peerCount: 0,
    matchedBrand: null,
    windowLabel: null,
    windowReports: null,
  };
}

/**
 * Pure core of the MAUDE facet. Inputs all come from one brand search and one window:
 * windowReports is the snapshot count, recent/prior are halves of that same window.
 * Peers are specialty top brands measured over the same window and halves.
 */
export function buildMaudeSignal(input: {
  brandLabel: string;
  windowReports: number;
  recentTotal: number;
  priorTotal: number;
  peers: MaudePeerWindow[];
}): MaudeSignalSnapshot {
  const windowLabel = `${Math.round(MAUDE_SIGNAL_WINDOW_DAYS / 30.4)}mo`;
  const { windowReports, recentTotal, priorTotal } = input;
  const changePct =
    priorTotal === 0 ? (recentTotal > 0 ? 100 : 0) : ((recentTotal - priorTotal) / priorTotal) * 100;
  const risingScore = risingScoreFor(recentTotal, priorTotal);
  const base: MaudeSignalSnapshot = {
    ...emptySnapshot(true, 'insufficient'),
    recentTotal,
    priorTotal,
    changePct: round1(changePct),
    risingScore: round1(risingScore),
    peerCount: input.peers.length,
    matchedBrand: input.brandLabel,
    windowLabel,
    windowReports,
  };

  // Too few reports in the snapshot window, or no peer panel to compare against.
  if (windowReports < MAUDE_MIN_REPORTS_FOR_HAZARD || input.peers.length < 3) {
    return base;
  }

  const risingPop = input.peers.map((p) => risingScoreFor(p.recentTotal, p.priorTotal));
  const volumePop = input.peers.map((p) => p.windowTotal);
  const peerRisingPercentile = percentileRank(risingScore, risingPop);
  const peerVolumePercentile = percentileRank(windowReports, volumePop);
  const { hazard, label, quietScore } = hazardFromPeerStats({
    risingScore,
    recentTotal,
    priorTotal,
    // Gate on the snapshot count so a high-count brand can never fall into the
    // low-count branch because its halves were thin.
    windowReports,
    peerRisingPercentile,
    peerVolumePercentile,
  });

  return {
    ...base,
    label,
    hazard: label === 'insufficient' ? null : hazard,
    quietScore,
    peerRisingPercentile: round1(peerRisingPercentile * 100) / 100,
    peerVolumePercentile: round1(peerVolumePercentile * 100) / 100,
  };
}

function peerWindowsFrom(brandSeries: MaudeBrandSeries[]): MaudePeerWindow[] {
  return brandSeries
    .map((b) => ({ ...splitHalves(b.series), windowTotal: sumCounts(b.series) }))
    .filter((p) => p.windowTotal > 0);
}

/**
 * Resolve the MAUDE facet for an implant using the SAME brand key, specialty and
 * 365-day window as the detail-page MAUDE snapshot (getMaudeBrandSynopsis).
 */
export async function resolveMaudeSignalForImplant(options: {
  maudeBrandKey: string | null | undefined;
  specialty: string;
  days?: number;
}): Promise<MaudeSignalSnapshot> {
  const key = options.maudeBrandKey?.trim() || '';
  if (!key) return emptySnapshot(false, 'unlinked');

  const specialty =
    !options.specialty || options.specialty === 'all' ? undefined : options.specialty;
  const days = MAUDE_SIGNAL_WINDOW_DAYS;

  try {
    const [synopsis, brandTrend, specialtyTrend] = await Promise.all([
      getMaudeBrandSynopsis({ brand: key, specialty, days }),
      getMaudeDailyTrends({ specialty, days, brand: key, includeBrandSeries: false }),
      getMaudeDailyTrends({ specialty, days, includeBrandSeries: true }),
    ]);
    const { recentTotal, priorTotal } = splitHalves(brandTrend.series);
    return buildMaudeSignal({
      brandLabel: shortDeviceLabel(key),
      windowReports: synopsis.totalReports,
      recentTotal,
      priorTotal,
      peers: peerWindowsFrom(specialtyTrend.brandSeries || []),
    });
  } catch (err) {
    logger.warn('MAUDE signal resolve failed', {
      key,
      specialty,
      message: err instanceof Error ? err.message : String(err),
    });
    return emptySnapshot(true, 'insufficient');
  }
}
