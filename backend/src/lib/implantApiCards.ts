/**
 * Slim vs full implant JSON shapes for directory scale.
 * List/related cards: product thumb only, no SEO body / AI summary blobs.
 * Detail cards: full media + score metadata.
 */
import { cleanImplantSeoTitle, implantFdaRecords } from './implantFda';

export type ImplantImageRow = {
  kind: string;
  url: string;
  alt: string | null;
  sortOrder?: number;
  attribution?: string | null;
  licenseNote?: string | null;
};

export type ImplantCardSource = {
  id: string;
  slug: string;
  brandName: string;
  systemName: string | null;
  company: string | null;
  specialty: string;
  anatomy: string | null;
  deviceClass: string;
  description: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  status: string;
  maudeBrandKey: string | null;
  techniqueGuideUrl?: string | null;
  techniqueGuideTitle?: string | null;
  fdaNumber?: string | null;
  fdaDecisionDate?: Date | null;
  fdaApplicant?: string | null;
  fdaMaterials?: string | null;
  fdaSourceUrl?: string | null;
  fdaRecords?: unknown;
  aiRating?: number | null;
  aiSummary?: string | null;
  aiRatedAt?: Date | null;
  catalogScore?: number | null;
  communityScore?: number | null;
  ratingSampleN?: number | null;
  ratingVersion?: string | null;
  aiRatingLocked?: boolean;
  utilityScore?: number | null;
  maudeScore?: number | null;
  maudeHazard?: number | null;
  maudeSignal?: string | null;
  scoreBreakdown?: unknown;
  memberRatingAvg?: number | null;
  images: ImplantImageRow[];
  _count: { reviews: number; comments?: number; images?: number };
};

function pickProduct(images: ImplantImageRow[]) {
  const sorted = [...images].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return sorted.find((i) => i.kind === 'product') || sorted[0] || null;
}

/** Directory / related strip: keep payload small for pagination at scale. */
/** openFDA brand strings sometimes carry a mis-encoded trademark sign ("VOYAGER\u00bf"). Drop it. */
export function stripFdaMojibake(text: string): string {
  return text.replace(/[\u00bf\ufffd]/g, '').replace(/[ \t]{2,}/g, ' ');
}

/** True when a stored breakdown carries the evidence block of the Reported safety signal. */
export function hasSafetyEvidence(breakdown: unknown): boolean {
  if (!breakdown || typeof breakdown !== 'object') return false;
  const maude = (breakdown as Record<string, unknown>).maude;
  if (!maude || typeof maude !== 'object') return false;
  const safety = (maude as Record<string, unknown>).safety;
  return Boolean(safety && typeof safety === 'object');
}

/**
 * Rows scored before the MAUDE fix stored a 10.0 facet for insufficient data and the raw
 * openFDA brand string. Rows scored before the safety signal (ost-dir-v2) carry a MAUDE
 * number without the severity, baseline and source evidence. Never serve any of these as
 * a number, even before the next recompute: they read Insufficient data.
 */
export function sanitizeScoreBreakdown(breakdown: unknown, maudeSignal: string | null | undefined): unknown {
  if (!breakdown || typeof breakdown !== 'object') return breakdown ?? null;
  const b = breakdown as Record<string, unknown>;
  const signal = (typeof b.maudeSignal === 'string' ? b.maudeSignal : null) || maudeSignal;
  const linked = signal !== 'unlinked';
  const insufficient = signal === 'insufficient' || (linked && !hasSafetyEvidence(b));
  const facets = Array.isArray(b.facets)
    ? (b.facets as Array<Record<string, unknown>>).map((f) => {
        if (!f || typeof f !== 'object') return f;
        const detail = typeof f.detail === 'string' ? stripFdaMojibake(f.detail) : f.detail;
        if (f.id === 'maude' && insufficient) {
          return { ...f, detail, score: null, status: 'Insufficient data' };
        }
        return { ...f, detail };
      })
    : b.facets;
  let maude = b.maude;
  if (maude && typeof maude === 'object') {
    const m = { ...(maude as Record<string, unknown>) };
    if (typeof m.matchedBrand === 'string') m.matchedBrand = stripFdaMojibake(m.matchedBrand);
    if (insufficient) m.quietScore = null;
    maude = m;
  }
  return { ...b, ...(insufficient ? { maudeScore: null } : {}), facets, maude };
}

export function toImplantListCard(implant: ImplantCardSource) {
  const product = pickProduct(implant.images);
  const imageCount = implant._count.images ?? implant.images.length;
  const commentCount = implant._count.comments ?? 0;
  const score = implant.aiRating ?? null;
  return {
    id: implant.id,
    slug: implant.slug,
    brandName: implant.brandName,
    systemName: implant.systemName,
    company: implant.company,
    specialty: implant.specialty,
    anatomy: implant.anatomy,
    deviceClass: implant.deviceClass,
    status: implant.status,
    techniqueGuideUrl: implant.techniqueGuideUrl ?? null,
    techniqueGuideTitle: implant.techniqueGuideTitle ?? null,
    aiRating: score, // Backward-compatible alias
    directoryScore: score, // New canonical name
    memberRatingAvg: implant.memberRatingAvg ?? null,
    reviewCount: implant._count.reviews,
    commentCount,
    imageCount,
    galleryExtraCount: Math.max(0, imageCount - (product ? 1 : 0)),
    productImage: product
      ? { url: product.url, alt: product.alt, kind: product.kind }
      : null,
  };
}

/** Full profile card fields (detail still adds long body, images, comments). */
export function toImplantDetailBase(implant: ImplantCardSource) {
  const sortedImages = [...implant.images].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );
  const product = pickProduct(sortedImages);
  const xrayCount = sortedImages.filter((i) => i.kind === 'xray').length;
  const otherCount = sortedImages.filter((i) => i.kind !== 'product').length;
  const commentCount = implant._count.comments ?? 0;
  const score = implant.aiRating ?? null;
  const summary = implant.aiSummary ?? null;
  const ratedAt = implant.aiRatedAt ? implant.aiRatedAt.toISOString() : null;
  return {
    id: implant.id,
    slug: implant.slug,
    brandName: implant.brandName,
    systemName: implant.systemName,
    company: implant.company,
    specialty: implant.specialty,
    anatomy: implant.anatomy,
    deviceClass: implant.deviceClass,
    description: implant.description,
    seoTitle: cleanImplantSeoTitle(implant.seoTitle),
    seoDescription: implant.seoDescription ?? null,
    status: implant.status,
    maudeBrandKey: implant.maudeBrandKey,
    techniqueGuideUrl: implant.techniqueGuideUrl ?? null,
    techniqueGuideTitle: implant.techniqueGuideTitle ?? null,
    fdaNumber: implant.fdaNumber ?? null,
    fdaDecisionDate: implant.fdaDecisionDate
      ? implant.fdaDecisionDate.toISOString().slice(0, 10)
      : null,
    fdaApplicant: implant.fdaApplicant ?? null,
    fdaMaterials: implant.fdaMaterials ?? null,
    fdaSourceUrl: implant.fdaSourceUrl ?? null,
    fdaRecords: implantFdaRecords(implant),
    // Backward-compatible aliases
    aiRating: score,
    aiSummary: summary,
    aiRatedAt: ratedAt,
    // New canonical names
    directoryScore: score,
    scoreSummary: summary,
    scoreUpdatedAt: ratedAt,
    catalogScore: implant.catalogScore ?? null,
    communityScore: implant.communityScore ?? null,
    ratingSampleN: implant.ratingSampleN ?? null,
    ratingVersion: implant.ratingVersion ?? null,
    aiRatingLocked: Boolean(implant.aiRatingLocked),
    utilityScore: implant.utilityScore ?? null,
    maudeScore:
      implant.maudeSignal === 'insufficient' || !hasSafetyEvidence(implant.scoreBreakdown)
        ? null
        : (implant.maudeScore ?? null),
    maudeHazard: implant.maudeHazard ?? null,
    maudeSignal: implant.maudeSignal ?? null,
    scoreBreakdown: sanitizeScoreBreakdown(implant.scoreBreakdown, implant.maudeSignal),
    memberRatingAvg: implant.memberRatingAvg ?? null,
    reviewCount: implant._count.reviews,
    commentCount,
    imageCount: sortedImages.length,
    xrayCount,
    galleryExtraCount: Math.max(0, otherCount),
    productImage: product
      ? { url: product.url, alt: product.alt, kind: product.kind }
      : null,
    markdownPath: `/implants/${implant.slug}.md`,
    methodologyPath: '/implants/methodology',
  };
}

/** Prisma include: product thumb only (list / related). */
export const productImageInclude = {
  where: { kind: 'product' as const },
  orderBy: { sortOrder: 'asc' as const },
  take: 1,
  select: {
    kind: true,
    url: true,
    alt: true,
    sortOrder: true,
  },
};

export const listCountSelect = {
  reviews: true,
  comments: { where: { isDeleted: false } },
  images: true,
} as const;
