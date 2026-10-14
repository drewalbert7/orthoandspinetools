/**
 * OrthoAndSpineTools proprietary Directory Score (ost-dir-v1)
 *
 * Objective composite for implant listings — NOT clinical advice, FDA clearance,
 * or a substitute for surgeon judgment. Designed to resist spam and small-n noise.
 *
 * Components
 * ----------
 * 1) Catalog score (0–10): deterministic listing quality / verification / media richness.
 * 2) Community score (0–10): vote-weighted clinical-language stance from implant comments.
 * 3) Final score: Bayesian blend. Community weight grows with effective sample size
 *    (Wilson-weighted comments), capped so a handful of posts cannot dominate.
 *
 * Community stance uses a curated orthopedic lexicon (positive / negative cues) and
 * ignores marketing fluff. Comment weight uses Wilson lower bound of upvotes vs
 * total votes so low-confidence comments contribute little.
 */

import { prisma } from './prisma';

export const RATING_VERSION = 'ost-dir-v1';

/** Max absolute sway community can apply relative to a pure catalog baseline (points). */
const COMMUNITY_MAX_DELTA = 1.75;

/** Prior strength (pseudo-observations) pulling community toward neutral 5.0. */
const COMMUNITY_PRIOR_N = 4;

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
  /** Direct surgical technique / instructional sheet URL (prefer PDF) */
  hasTechniqueGuide?: boolean;
};

export type CommentEvidence = {
  body: string;
  upvotes: number;
  downvotes: number;
  isDeleted: boolean;
};

export type DirectoryScoreBreakdown = {
  version: typeof RATING_VERSION;
  catalogScore: number;
  communityScore: number | null;
  sampleN: number;
  communityWeight: number;
  finalScore: number;
  summary: string;
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
 * Catalog / structural quality — fully deterministic from listing fields.
 * Starts at a neutral baseline and awards points for verifiable completeness.
 */
export function computeCatalogScore(input: CatalogInput): number {
  let score = 4.8;

  if (input.status === 'verified') score += 1.0;
  else if (input.status === 'published') score += 0.45;

  if (input.company && input.company.trim().length >= 2) score += 0.25;

  score += lenBoost(input.description, 220, 0.35);
  score += lenBoost(input.longDescription, 900, 0.7);
  if (input.indications && input.indications.trim().length >= 40) score += 0.35;
  if (input.contraindications && input.contraindications.trim().length >= 40) score += 0.35;

  score += clamp(input.aliasCount, 0, 6) * 0.06;
  if (input.productImageCount > 0) score += 0.45;
  score += clamp(input.xrayCount, 0, 4) * 0.18;
  score += clamp(input.otherImageCount, 0, 3) * 0.08;
  if (input.hasTechniqueGuide) score += 0.4;

  return round1(clamp(score, 0, 10));
}

/** Orthopedic / implant lexicon — stance cues only (no brand names). */
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
];

/** Marketing / non-clinical noise that should dilute stance weight. */
const NOISE_CUES: RegExp[] = [
  /\bbuy now\b/i,
  /\bdiscount\b/i,
  /\bpromo(tion)?\b/i,
  /\bclick here\b/i,
  /\bhttp(s)?:\/\//i,
];

/**
 * Stance in [-1, 1]. Lexicon hits are capped so a single rant doesn't explode.
 * Legacy migrated reviews may include "(n/5)" — map that as a soft prior.
 */
export function commentStance(body: string): number {
  if (!body || !body.trim()) return 0;
  let score = 0;

  const star = body.match(/\((\d)\s*\/\s*5\)/);
  if (star) {
    const r = Number(star[1]);
    if (r >= 1 && r <= 5) score += (r - 3) / 2; // 1→-1, 3→0, 5→+1
  }

  for (const [re, w] of POSITIVE_CUES) {
    if (re.test(body)) score += w;
  }
  for (const [re, w] of NEGATIVE_CUES) {
    if (re.test(body)) score -= w;
  }

  const noiseHits = NOISE_CUES.reduce((n, re) => n + (re.test(body) ? 1 : 0), 0);
  if (noiseHits > 0) score *= 1 / (1 + noiseHits);

  // Length sanity: very short comments are weak evidence
  const len = body.trim().length;
  if (len < 40) score *= 0.45;
  else if (len < 80) score *= 0.75;

  return clamp(score, -1, 1);
}

/** Evidence weight from votes — Wilson LB of upvote ratio × soft volume factor. */
export function commentWeight(upvotes: number, downvotes: number): number {
  const up = Math.max(0, upvotes);
  const down = Math.max(0, downvotes);
  const total = up + down;
  if (total === 0) {
    // Brand-new comment: tiny prior weight so it can participate lightly
    return 0.2;
  }
  const wilson = wilsonLowerBound(up, total);
  const volume = Math.log2(1 + total);
  // Penalize contested threads (≈50/50) via wilson already; amplify clear consensus
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
    // Near-zero stance still adds a little sample size but little pull
    const effectiveW = w * (0.35 + 0.65 * Math.abs(stance));
    weightedStance += stance * effectiveW;
    weightSum += effectiveW;
  }

  if (weightSum <= 0) return { score: null, sampleN: 0 };

  // Bayesian shrink toward neutral (stance 0 → score 5)
  const priorStance = 0;
  const n = weightSum;
  const posteriorStance =
    (weightedStance + COMMUNITY_PRIOR_N * priorStance) / (n + COMMUNITY_PRIOR_N);

  const score = round1(clamp(5 + posteriorStance * 4.2, 0, 10));
  return { score, sampleN: round1(n) };
}

/**
 * Blend catalog + community. Community weight = n / (n + k), capped in score space.
 */
export function blendDirectoryScore(
  catalogScore: number,
  communityScore: number | null,
  sampleN: number
): { finalScore: number; communityWeight: number; summary: string } {
  const catalog = clamp(catalogScore, 0, 10);

  if (communityScore == null || sampleN <= 0) {
    return {
      finalScore: round1(catalog),
      communityWeight: 0,
      summary: `OST Directory Score ${round1(catalog)}/10 — catalog factors only (no weighted community evidence yet). Not medical advice.`,
    };
  }

  // Smooth weight: reaches ~0.45 at sampleN≈5, ~0.62 at 10
  const rawW = sampleN / (sampleN + 6);
  const communityWeight = clamp(rawW, 0, 0.42);

  let blended = catalog * (1 - communityWeight) + communityScore * communityWeight;

  // Hard cap on community delta vs catalog to keep objectivity
  const delta = blended - catalog;
  if (Math.abs(delta) > COMMUNITY_MAX_DELTA) {
    blended = catalog + Math.sign(delta) * COMMUNITY_MAX_DELTA;
  }

  const finalScore = round1(clamp(blended, 0, 10));
  const lean =
    communityScore >= 6.2 ? 'favorable' : communityScore <= 3.8 ? 'cautious' : 'mixed';
  const summary = `OST Directory Score ${finalScore}/10 (v1) — catalog ${round1(catalog)}, community ${round1(
    communityScore
  )} (${lean}, n≈${round1(sampleN)}). Vote-weighted comment evidence; not medical advice.`;

  return { finalScore, communityWeight: round1(communityWeight), summary };
}

export function scoreFromParts(
  catalogInput: CatalogInput,
  comments: CommentEvidence[]
): DirectoryScoreBreakdown {
  const catalogScore = computeCatalogScore(catalogInput);
  const { score: communityScore, sampleN } = computeCommunityScore(comments);
  const { finalScore, communityWeight, summary } = blendDirectoryScore(
    catalogScore,
    communityScore,
    sampleN
  );
  return {
    version: RATING_VERSION,
    catalogScore,
    communityScore,
    sampleN,
    communityWeight,
    finalScore,
    summary,
  };
}

/** Load implant + comments and persist score fields. Respects aiRatingLocked. */
export async function recomputeImplantDirectoryScore(implantId: string): Promise<DirectoryScoreBreakdown | null> {
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
  const otherImageCount = implant.images.filter((i) => i.kind !== 'product' && i.kind !== 'xray').length;

  const comments: CommentEvidence[] = implant.comments.map((c) => ({
    body: c.body,
    isDeleted: c.isDeleted,
    upvotes: c.votes.filter((v) => v.value === 1).length,
    downvotes: c.votes.filter((v) => v.value === -1).length,
  }));

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
    comments
  );

  await prisma.implant.update({
    where: { id: implantId },
    data: {
      catalogScore: breakdown.catalogScore,
      communityScore: breakdown.communityScore,
      ratingSampleN: breakdown.sampleN,
      ratingVersion: breakdown.version,
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

/** Backfill scores for all public implants (safe to re-run). */
export async function recomputeAllImplantDirectoryScores(): Promise<number> {
  const rows = await prisma.implant.findMany({
    where: { status: { in: ['published', 'verified'] } },
    select: { id: true },
  });
  let n = 0;
  for (const row of rows) {
    await recomputeImplantDirectoryScore(row.id);
    n += 1;
  }
  return n;
}
