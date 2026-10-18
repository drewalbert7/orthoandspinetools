/**
 * OrthoAndSpineTools proprietary Directory Score (ost-dir-v2)
 *
 * Dual objective (asymmetric):
 * 1) Utility — listing quality + vote-weighted surgeon discussion (identify strong options)
 * 2) MAUDE hazard — peer-normalized rising/volume signal (flag problems earlier)
 *
 * Final = Utility × (1 − λH) − μH   → polish cannot average away a hot surveillance signal.
 *
 * NOT clinical advice, FDA clearance, incidence rates, or a substitute for judgment.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  MAUDE_MIN_REPORTS_FOR_HAZARD,
  resolveMaudeSignalForImplant,
  type MaudeSignalLabel,
  type MaudeSignalSnapshot,
} from './implantMaudeSignal';
import { getMaudeDailyTrends } from './openFdaMaude';

export const RATING_VERSION = 'ost-dir-v2';

/** How hard MAUDE hazard multiplies down utility (0–1 scale on H). */
const HAZARD_MULTIPLIER = 0.55;
/** Additive point penalty at H=1. */
const HAZARD_ADDITIVE = 3.5;

type CatalogInput = {
  status: string;
  company: string | null;
  description: string | null;
  longDescription: string | null;
  indications: string | null;
  contraindications: string | null;
  aliasCount: number;
  productImageCount: number;
  xrayCount: number;
  otherImageCount: number;
  hasTechniqueGuide?: boolean;
};

export type CommentEvidence = {
  body: string;
  upvotes: number;
  downvotes: number;
  isDeleted: boolean;
};

export type ScoreFacet = {
  id: 'listing' | 'discussion' | 'maude' | 'utility' | 'summary';
  label: string;
  score: number | null;
  /** Short status for chips */
  status?: string;
  detail: string;
};

export type DirectoryScoreBreakdown = {
  version: typeof RATING_VERSION;
  catalogScore: number;
  communityScore: number | null;
  sampleN: number;
  communityWeight: number;
  utilityScore: number;
  maudeScore: number | null;
  maudeHazard: number | null;
  maudeSignal: MaudeSignalLabel;
  finalScore: number;
  summary: string;
  facets: ScoreFacet[];
  maude: MaudeSignalSnapshot | null;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Wilson score lower bound for binomial proportion (z≈1.96). */
function wilsonLowerBound(up: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;
  const phat = up / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = phat + z2 / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / denom);
}

function lenBoost(text: string | null | undefined, softCap: number, maxPts: number): number {
  if (!text) return 0;
  const n = text.trim().length;
  if (n <= 0) return 0;
  return maxPts * clamp(n / softCap, 0, 1);
}

/**
 * Listing / structural quality — completeness of the directory profile.
 * Intentionally NOT a clinical endorsement.
 */
export function computeCatalogScore(input: CatalogInput): number {
  let score = 4.6;

  if (input.status === 'verified') score += 1.05;
  else if (input.status === 'published') score += 0.4;

  if (input.company && input.company.trim().length >= 2) score += 0.25;

  score += lenBoost(input.description, 220, 0.35);
  score += lenBoost(input.longDescription, 900, 0.65);
  if (input.indications && input.indications.trim().length >= 40) score += 0.3;
  if (input.contraindications && input.contraindications.trim().length >= 40) score += 0.3;

  score += clamp(input.aliasCount, 0, 6) * 0.05;
  if (input.productImageCount > 0) score += 0.45;
  score += clamp(input.xrayCount, 0, 4) * 0.18;
  score += clamp(input.otherImageCount, 0, 3) * 0.08;
  if (input.hasTechniqueGuide) score += 0.45;

  return round1(clamp(score, 0, 10));
}

const POSITIVE_CUES: Array<[RegExp, number]> = [
  [/\bworkhorse\b/i, 0.55],
  [/\breliable\b/i, 0.4],
  [/\breproducible\b/i, 0.45],
  [/\bgood fixation\b/i, 0.5],
  [/\bsolid fixation\b/i, 0.5],
  [/\beasy to use\b|\buser[- ]friendly\b/i, 0.25],
  [/\bwell designed\b|\bwell-designed\b/i, 0.35],
  [/\bprefer(s|red)?\b.{0,40}\b(this|it)\b/i, 0.3],
  [/\bmy go[- ]to\b|\bgo to system\b/i, 0.5],
  [/\blow profile\b/i, 0.2],
  [/\bstable construct\b|\bconstruct stability\b/i, 0.4],
  [/\bgood option\b|\breasonable choice\b/i, 0.3],
  [/\bpredictable\b/i, 0.35],
  [/\bexcellent\b|\boutstanding\b/i, 0.35],
];

const NEGATIVE_CUES: Array<[RegExp, number]> = [
  [/\bsubsidence\b/i, 0.55],
  [/\bloosen(ing|ed|s)?\b/i, 0.5],
  [/\bbroke\b|\bbreakage\b|\bfractured screw\b/i, 0.6],
  [/\brevision\b.{0,30}\b(for|due|because)\b/i, 0.45],
  [/\bhigh failure\b|\bfailure rate\b/i, 0.55],
  [/\bpoor fixation\b|\blost fixation\b/i, 0.55],
  [/\bdifficult to use\b|\bsteep learning\b/i, 0.3],
  [/\bavoid\b.{0,20}\b(this|it|system)\b/i, 0.5],
  [/\bunreliable\b|\bunpredictable\b/i, 0.45],
  [/\bpseudarthrosis\b|\bnonunion\b/i, 0.4],
  [/\bmigration\b|\bmalposition\b/i, 0.35],
  [/\bset screw issues?\b|\bcrosslink problems?\b/i, 0.35],
  [/\bwish .{0,20}hadn'?t\b|\bregret\b/i, 0.4],
  [/\brecall\b|\bliability\b|\blawsuit\b/i, 0.5],
];

const NOISE_CUES: RegExp[] = [
  /\bbuy now\b/i,
  /\bdiscount\b/i,
  /\bpromo(tion)?\b/i,
  /\bclick here\b/i,
  /\bhttp(s)?:\/\//i,
];

export function commentStance(body: string): number {
  if (!body || !body.trim()) return 0;
  let score = 0;

  const star = body.match(/\((\d)\s*\/\s*5\)/);
  if (star) {
    const r = Number(star[1]);
    if (r >= 1 && r <= 5) score += (r - 3) / 2;
  }

  for (const [re, w] of POSITIVE_CUES) {
    if (re.test(body)) score += w;
  }
  for (const [re, w] of NEGATIVE_CUES) {
    if (re.test(body)) score -= w;
  }

  const noiseHits = NOISE_CUES.reduce((n, re) => n + (re.test(body) ? 1 : 0), 0);
  if (noiseHits > 0) score *= 1 / (1 + noiseHits);

  const len = body.trim().length;
  if (len < 40) score *= 0.45;
  else if (len < 80) score *= 0.75;

  return clamp(score, -1, 1);
}

export function commentWeight(upvotes: number, downvotes: number): number {
  const up = Math.max(0, upvotes);
  const down = Math.max(0, downvotes);
  const total = up + down;
  if (total === 0) return 0.2;
  const wilson = wilsonLowerBound(up, total);
  const volume = Math.log2(1 + total);
  return clamp(0.15 + wilson * (0.85 + 0.35 * volume), 0.05, 3.5);
}

export function computeCommunityScore(comments: CommentEvidence[]): {
  score: number | null;
  sampleN: number;
} {
  const live = comments.filter((c) => !c.isDeleted && c.body.trim().length > 0);
  if (!live.length) return { score: null, sampleN: 0 };

  let weightedStance = 0;
  let weightSum = 0;

  for (const c of live) {
    const stance = commentStance(c.body);
    const w = commentWeight(c.upvotes, c.downvotes);
    const effectiveW = w * (0.35 + 0.65 * Math.abs(stance));
    weightedStance += stance * effectiveW;
    weightSum += effectiveW;
  }

  if (weightSum <= 0) return { score: null, sampleN: 0 };

  const n = weightSum;
  const posteriorStance = weightedStance / (n + 4);
  const score = round1(clamp(5 + posteriorStance * 4.2, 0, 10));
  return { score, sampleN: round1(n) };
}

/**
 * Utility: excellence prior from listing + discussion.
 * Without discussion, shrink listing toward neutral 5 — complete pages ≠ great implants.
 */
export function computeUtilityScore(
  listingScore: number,
  discussionScore: number | null,
  sampleN: number
): { utility: number; communityWeight: number } {
  const L = clamp(listingScore, 0, 10);
  if (discussionScore == null || sampleN <= 0) {
    const utility = round1(clamp(0.52 * L + 0.48 * 5.0, 0, 10));
    return { utility, communityWeight: 0 };
  }
  const w = clamp(sampleN / (sampleN + 8), 0, 0.58);
  const utility = round1(clamp(L * (1 - w) + discussionScore * w, 0, 10));
  return { utility, communityWeight: round1(w) };
}

/**
 * Asymmetric combine: hazard multiplies and subtracts so rising MAUDE cannot be averaged away.
 * Quiet / insufficient / unlinked → no penalty (utility stands).
 * Watch → partial; Elevated → full force.
 */
export function applyMaudeHazard(
  utility: number,
  hazard: number | null,
  signal: MaudeSignalLabel = 'insufficient'
): number {
  const U = clamp(utility, 0, 10);
  if (hazard == null || signal === 'quiet' || signal === 'unlinked' || signal === 'insufficient') {
    return round1(U);
  }
  const raw = clamp(hazard, 0, 1);
  const H = signal === 'watch' ? raw * 0.55 : raw;
  const final = U * (1 - HAZARD_MULTIPLIER * H) - HAZARD_ADDITIVE * H;
  return round1(clamp(final, 0, 10));
}

function maudeFacetDetail(m: MaudeSignalSnapshot): string {
  if (!m.linked) return 'No MAUDE brand key linked, so the surveillance facet is unavailable.';
  const win = m.windowLabel ? m.windowLabel.replace(/mo$/, ' mo') : '12 mo';
  const count =
    m.windowReports != null
      ? `${m.windowReports} report${m.windowReports === 1 ? '' : 's'} in the last ${win} (same count as the MAUDE snapshot)`
      : null;
  if (m.label === 'insufficient' || m.hazard == null) {
    if (m.windowReports == null) return 'MAUDE data unavailable for this brand key right now.';
    if (m.windowReports < MAUDE_MIN_REPORTS_FOR_HAZARD) {
      return `${count}. Fewer than ${MAUDE_MIN_REPORTS_FOR_HAZARD} reports, so no score.`;
    }
    return `${count}. Not enough specialty peers to compare against, so no score.`;
  }
  const bits = [
    count,
    m.recentTotal != null && m.priorTotal != null
      ? `last 6 mo ${m.recentTotal} vs earlier ${m.priorTotal}`
      : null,
    m.peerRisingPercentile != null
      ? `rising peer pctl ${Math.round(m.peerRisingPercentile * 100)}%`
      : null,
  ].filter(Boolean);
  return bits.join(' · ');
}

export function scoreFromParts(
  catalogInput: CatalogInput,
  comments: CommentEvidence[],
  maude: MaudeSignalSnapshot
): DirectoryScoreBreakdown {
  const catalogScore = computeCatalogScore(catalogInput);
  const { score: communityScore, sampleN } = computeCommunityScore(comments);
  const { utility, communityWeight } = computeUtilityScore(
    catalogScore,
    communityScore,
    sampleN
  );
  const finalScore = applyMaudeHazard(utility, maude.hazard, maude.label);

  const maudeScore = maude.quietScore;
  const maudeSignal = maude.label;

  const facets: ScoreFacet[] = [
    {
      id: 'listing',
      label: 'Listing quality',
      score: catalogScore,
      status: catalogInput.status === 'verified' ? 'Verified profile' : 'Published profile',
      detail:
        'Completeness: verification, descriptions, media, surgical technique PDF, aliases. Not clinical performance.',
    },
    {
      id: 'discussion',
      label: 'Surgeon discussion',
      score: communityScore,
      status:
        communityScore == null
          ? 'No weighted comments yet'
          : communityScore >= 6.2
            ? 'Favorable'
            : communityScore <= 3.8
              ? 'Cautious'
              : 'Mixed',
      detail:
        sampleN > 0
          ? `Vote-weighted clinical lexicon · effective n≈${round1(sampleN)}`
          : 'Needs member comments with clinical language to move utility.',
    },
    {
      id: 'maude',
      label: 'MAUDE surveillance',
      score: maudeScore,
      status:
        maudeSignal === 'elevated'
          ? 'Elevated signal'
          : maudeSignal === 'watch'
            ? 'Watch'
            : maudeSignal === 'quiet'
              ? 'Quiet vs peers'
              : maudeSignal === 'unlinked'
                ? 'Not linked'
                : 'Insufficient data',
      detail: maudeFacetDetail(maude),
    },
    {
      id: 'utility',
      label: 'Utility (pre-hazard)',
      score: utility,
      detail: 'Listing + discussion blend (discussion grows with evidence).',
    },
    {
      id: 'summary',
      label: 'Directory Score',
      score: finalScore,
      detail:
        maude.hazard == null ||
        maudeSignal === 'quiet' ||
        maudeSignal === 'unlinked' ||
        maudeSignal === 'insufficient'
          ? `Utility ${utility} — MAUDE hazard not applied (${maudeSignal}).`
          : maudeSignal === 'watch'
            ? `Utility ${utility} × partial watch hazard ${round1(maude.hazard)}.`
            : `Utility ${utility} × elevated hazard ${round1(maude.hazard)} (asymmetric).`,
    },
  ];

  const maudeBit =
    maudeSignal === 'elevated'
      ? 'MAUDE elevated vs peers'
      : maudeSignal === 'watch'
        ? 'MAUDE watch'
        : maudeSignal === 'quiet'
          ? 'MAUDE quiet vs peers'
          : maudeSignal === 'unlinked'
            ? 'MAUDE unlinked'
            : 'MAUDE insufficient';

  const summary = `OST Directory Score ${finalScore}/10 (${RATING_VERSION}) — utility ${utility} (listing ${catalogScore}${
    communityScore != null ? `, discussion ${communityScore}` : ''
  }) · ${maudeBit}. Editorial composite — not medical advice or FDA judgment.`;

  return {
    version: RATING_VERSION,
    catalogScore,
    communityScore,
    sampleN,
    communityWeight,
    utilityScore: utility,
    maudeScore,
    maudeHazard: maude.hazard,
    maudeSignal,
    finalScore,
    summary,
    facets,
    maude,
  };
}

/** @deprecated use scoreFromParts with MAUDE snapshot — kept for unit tests of catalog/community */
export function blendDirectoryScore(
  catalogScore: number,
  communityScore: number | null,
  sampleN: number
): { finalScore: number; communityWeight: number; summary: string } {
  const { utility, communityWeight } = computeUtilityScore(
    catalogScore,
    communityScore,
    sampleN
  );
  return {
    finalScore: utility,
    communityWeight,
    summary: `Utility ${utility}/10 (listing ${catalogScore}${
      communityScore != null ? `, discussion ${communityScore}` : ''
    }).`,
  };
}

export async function recomputeImplantDirectoryScore(
  implantId: string
): Promise<DirectoryScoreBreakdown | null> {
  const implant = await prisma.implant.findUnique({
    where: { id: implantId },
    include: {
      aliases: { select: { id: true } },
      images: { select: { kind: true } },
      comments: {
        where: { isDeleted: false },
        select: {
          body: true,
          isDeleted: true,
          votes: { select: { value: true } },
        },
      },
    },
  });
  if (!implant) return null;

  const productImageCount = implant.images.filter((i) => i.kind === 'product').length;
  const xrayCount = implant.images.filter((i) => i.kind === 'xray').length;
  const otherImageCount = implant.images.filter(
    (i) => i.kind !== 'product' && i.kind !== 'xray'
  ).length;

  const comments: CommentEvidence[] = implant.comments.map((c) => ({
    body: c.body,
    isDeleted: c.isDeleted,
    upvotes: c.votes.filter((v) => v.value === 1).length,
    downvotes: c.votes.filter((v) => v.value === -1).length,
  }));

  const maude = await resolveMaudeSignalForImplant({
    maudeBrandKey: implant.maudeBrandKey,
    specialty: implant.specialty,
    days: 365,
  });

  const breakdown = scoreFromParts(
    {
      status: implant.status,
      company: implant.company,
      description: implant.description,
      longDescription: implant.longDescription,
      indications: implant.indications,
      contraindications: implant.contraindications,
      aliasCount: implant.aliases.length,
      productImageCount,
      xrayCount,
      otherImageCount,
      hasTechniqueGuide: Boolean(implant.techniqueGuideUrl?.trim()),
    },
    comments,
    maude
  );

  await prisma.implant.update({
    where: { id: implantId },
    data: {
      catalogScore: breakdown.catalogScore,
      communityScore: breakdown.communityScore,
      ratingSampleN: breakdown.sampleN,
      ratingVersion: breakdown.version,
      utilityScore: breakdown.utilityScore,
      maudeScore: breakdown.maudeScore,
      maudeHazard: breakdown.maudeHazard,
      maudeSignal: breakdown.maudeSignal,
      scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      ...(implant.aiRatingLocked
        ? {}
        : {
            aiRating: breakdown.finalScore,
            aiSummary: breakdown.summary,
            aiRatedAt: new Date(),
          }),
    },
  });

  return breakdown;
}

export async function recomputeAllImplantDirectoryScores(): Promise<number> {
  const rows = await prisma.implant.findMany({
    where: { status: { in: ['published', 'verified'] } },
    select: { id: true, specialty: true },
    orderBy: [{ specialty: 'asc' }, { brandName: 'asc' }],
  });

  // Prefetch specialty MAUDE peer panels once (shared cache), paced to avoid FDA 429s.
  const specialties = [...new Set(rows.map((r) => r.specialty || 'spine'))];
  for (const spec of specialties) {
    try {
      await getMaudeDailyTrends({
        specialty: spec === 'all' ? undefined : spec,
        days: 365,
        includeBrandSeries: true,
      });
    } catch {
      /* best-effort warm */
    }
    await new Promise((r) => setTimeout(r, 4000));
  }

  let n = 0;
  for (const row of rows) {
    await recomputeImplantDirectoryScore(row.id);
    n += 1;
    // Each implant now reads its own brand synopsis + series (same as the snapshot); pace openFDA.
    if (n < rows.length) await new Promise((r) => setTimeout(r, 1500));
  }
  return n;
}
