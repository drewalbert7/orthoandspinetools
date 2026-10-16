/**
 * Peer-normalized MAUDE surveillance signal for Directory Score v2.
 * Uses cached specialty trend series (same pipeline as /maude) — no extra openFDA spam.
 */

import { getMaudeDailyTrends, type MaudeTrendingBrand } from './openFdaMaude';
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
};

function normBrand(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function brandsMatch(a: string, b: string): boolean {
  const na = normBrand(a);
  const nb = normBrand(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  // Token overlap (e.g. "prodisc c" vs "prodisc-c cervical…")
  const ta = new Set(na.split(' ').filter((t) => t.length > 1));
  const tb = nb.split(' ').filter((t) => t.length > 1);
  if (ta.size === 0 || tb.length === 0) return false;
  const hit = tb.filter((t) => ta.has(t)).length;
  return hit >= Math.min(2, ta.size) || (hit === 1 && (ta.has(nb) || tb.includes(na)));
}

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
 */
export function hazardFromPeerStats(input: {
  risingScore: number;
  recentTotal: number;
  priorTotal: number;
  peerRisingPercentile: number;
  peerVolumePercentile: number;
}): { hazard: number; label: MaudeSignalLabel; quietScore: number } {
  const n = input.recentTotal + input.priorTotal;
  const risingP = clamp01(input.peerRisingPercentile);
  const volumeP = clamp01(input.peerVolumePercentile);
  const rs = input.risingScore;

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

  // Small-n damping
  if (n < 2) hazard *= 0.2;
  else if (n < 5) hazard *= 0.45;
  else if (n < 10) hazard *= 0.7;

  hazard = clamp01(hazard);

  const quietScore = round1(10 * (1 - hazard));
  let label: MaudeSignalLabel;
  if (n < 3 && hazard < 0.35) label = 'insufficient';
  else if (rs > 0 && hazard >= 0.55) label = 'elevated';
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

function findBrandRow(
  key: string,
  trending: MaudeTrendingBrand[]
): MaudeTrendingBrand | null {
  const exact = trending.find(
    (t) => brandsMatch(t.name, key) || brandsMatch(t.shortLabel, key)
  );
  return exact || null;
}

/**
 * Resolve MAUDE peer signal for an implant's maudeBrandKey within specialty trends.
 */
export async function resolveMaudeSignalForImplant(options: {
  maudeBrandKey: string | null | undefined;
  specialty: string;
  days?: number;
}): Promise<MaudeSignalSnapshot> {
  const key = options.maudeBrandKey?.trim() || '';
  if (!key) {
    return {
      linked: false,
      label: 'unlinked',
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
    };
  }

  const specialty =
    !options.specialty || options.specialty === 'all' ? undefined : options.specialty;
  const days = options.days ?? 365;

  try {
    const trends = await getMaudeDailyTrends({
      specialty,
      days,
      includeBrandSeries: true,
    });
    const trending = trends.trendingBrands || [];
    const peers = trending.filter((t) => t.risingScore > -500);
    const row = findBrandRow(key, peers);

    if (!row || peers.length < 3) {
      // Linked key but not in specialty top-brand panel — treat as insufficient peer context
      return {
        linked: true,
        label: 'insufficient',
        hazard: null,
        quietScore: null,
        recentTotal: row?.recentTotal ?? null,
        priorTotal: row?.priorTotal ?? null,
        changePct: row?.changePct ?? null,
        risingScore: row?.risingScore ?? null,
        peerRisingPercentile: null,
        peerVolumePercentile: null,
        peerCount: peers.length,
        matchedBrand: row?.name ?? null,
        windowLabel: row?.windowLabel ?? null,
      };
    }

    const risingPop = peers.map((p) => p.risingScore);
    const volumePop = peers.map((p) => p.recentTotal);
    const peerRisingPercentile = percentileRank(row.risingScore, risingPop);
    const peerVolumePercentile = percentileRank(row.recentTotal, volumePop);
    const { hazard, label, quietScore } = hazardFromPeerStats({
      risingScore: row.risingScore,
      recentTotal: row.recentTotal,
      priorTotal: row.priorTotal,
      peerRisingPercentile,
      peerVolumePercentile,
    });

    return {
      linked: true,
      label,
      hazard,
      quietScore,
      recentTotal: row.recentTotal,
      priorTotal: row.priorTotal,
      changePct: row.changePct,
      risingScore: row.risingScore,
      peerRisingPercentile: round1(peerRisingPercentile * 100) / 100,
      peerVolumePercentile: round1(peerVolumePercentile * 100) / 100,
      peerCount: peers.length,
      matchedBrand: row.name,
      windowLabel: row.windowLabel,
    };
  } catch (err) {
    logger.warn('MAUDE signal resolve failed', {
      key,
      specialty,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      linked: true,
      label: 'insufficient',
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
    };
  }
}
