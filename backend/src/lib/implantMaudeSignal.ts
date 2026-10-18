/**
 * MAUDE facet for the Directory Score: the Reported safety signal (FDA MAUDE).
 * Uses the same brand search and 365-day window as the detail-page MAUDE snapshot.
 * Scoring lives in implantSafetySignal.ts (pure) and is documented in
 * docs/implant-safety-signal.md. Inputs come from implantSafetyData.ts (openFDA).
 */

import { shortDeviceLabel } from './openFdaMaude';
import { fetchSafetySignalInput } from './implantSafetyData';
import {
  MIN_DEVICE_REPORTS,
  SAFETY_WINDOW_DAYS,
  computeSafetySignal,
  safetyLabel,
  type SafetySignal,
} from './implantSafetySignal';
import { logger } from '../utils/logger';

export type MaudeSignalLabel = 'quiet' | 'watch' | 'elevated' | 'unlinked' | 'insufficient';

export type MaudeSignalSnapshot = {
  linked: boolean;
  label: MaudeSignalLabel;
  /** 0 = quiet, 1 = alarming (1 minus score / 10). Null when there is no score. */
  hazard: number | null;
  /** Reported safety signal score 0 to 10 (higher = quieter vs category). Null = Insufficient data. */
  quietScore: number | null;
  recentTotal: number | null;
  priorTotal: number | null;
  changePct: number | null;
  matchedBrand: string | null;
  windowLabel: string | null;
  /** Total reports in the same window and search the MAUDE snapshot uses. */
  windowReports?: number | null;
  /** Full safety signal breakdown (counts, baseline, recalls, sources). */
  safety?: SafetySignal | null;
  /** Set when openFDA could not be read. */
  error?: string | null;
};

/** Window the detail-page MAUDE snapshot uses (ImplantDetail.tsx synopsis query, days: 365). */
export const MAUDE_SIGNAL_WINDOW_DAYS = SAFETY_WINDOW_DAYS;
/** Recent vs prior split inside that window (months). */
export const MAUDE_SIGNAL_HALF_MONTHS = 6;
/** Minimum reports in the window before any score is shown. */
export const MAUDE_MIN_REPORTS_FOR_HAZARD = MIN_DEVICE_REPORTS;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Recent vs earlier split of a monthly series: the last N months vs every month
 * before them, so recent + prior adds up to the whole window.
 */
export function splitHalves(
  series: Array<{ count: number }>,
  halfMonths = MAUDE_SIGNAL_HALF_MONTHS
): { recentTotal: number; priorTotal: number } {
  const cut = Math.max(0, series.length - halfMonths);
  const sum = (a: Array<{ count: number }>) => a.reduce((s, p) => s + p.count, 0);
  return { recentTotal: sum(series.slice(cut)), priorTotal: sum(series.slice(0, cut)) };
}

function emptySnapshot(linked: boolean, label: MaudeSignalLabel): MaudeSignalSnapshot {
  return {
    linked,
    label,
    hazard: null,
    quietScore: null,
    recentTotal: null,
    priorTotal: null,
    changePct: null,
    matchedBrand: null,
    windowLabel: null,
    windowReports: null,
    safety: null,
    error: null,
  };
}

/** Pure: turn a computed safety signal into the Directory Score MAUDE facet snapshot. */
export function snapshotFromSafety(brandLabel: string, safety: SafetySignal): MaudeSignalSnapshot {
  const { label, hazard } = safetyLabel(safety);
  const { recentTotal, priorTotal } = splitHalves(safety.trend.months);
  const changePct =
    priorTotal === 0 ? (recentTotal > 0 ? 100 : 0) : ((recentTotal - priorTotal) / priorTotal) * 100;
  return {
    linked: true,
    label,
    hazard,
    quietScore: safety.score,
    recentTotal,
    priorTotal,
    changePct: round1(changePct),
    matchedBrand: brandLabel,
    windowLabel: `${Math.round(MAUDE_SIGNAL_WINDOW_DAYS / 30.4)}mo`,
    windowReports: safety.counts.total,
    safety,
    error: null,
  };
}

/**
 * Resolve the MAUDE facet for an implant using the SAME brand key, specialty and
 * 365-day window as the detail-page MAUDE snapshot (getMaudeBrandSynopsis).
 */
export async function resolveMaudeSignalForImplant(options: {
  maudeBrandKey: string | null | undefined;
  specialty: string;
  company?: string | null;
  fdaApplicant?: string | null;
  fdaNumbers?: string[];
}): Promise<MaudeSignalSnapshot> {
  const key = options.maudeBrandKey?.trim() || '';
  if (!key) return emptySnapshot(false, 'unlinked');

  const specialty =
    !options.specialty || options.specialty === 'all' ? undefined : options.specialty;

  try {
    const input = await fetchSafetySignalInput({
      maudeBrandKey: key,
      specialty,
      company: options.company,
      fdaApplicant: options.fdaApplicant,
      fdaNumbers: options.fdaNumbers,
    });
    return snapshotFromSafety(shortDeviceLabel(key), computeSafetySignal(input));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('MAUDE safety signal resolve failed', { key, specialty, message });
    return { ...emptySnapshot(true, 'insufficient'), matchedBrand: shortDeviceLabel(key), error: message };
  }
}
