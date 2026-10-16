/**
 * Slim vs full implant JSON shapes for directory scale.
 * List/related cards: product thumb only, no SEO body / AI summary blobs.
 * Detail cards: full media + score metadata.
 */

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

/** Directory / related strip — keep payload small for pagination at scale. */
export function toImplantListCard(implant: ImplantCardSource) {
  const product = pickProduct(implant.images);
  const imageCount = implant._count.images ?? implant.images.length;
  const commentCount = implant._count.comments ?? 0;
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
    aiRating: implant.aiRating ?? null,
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
    seoTitle: implant.seoTitle ?? null,
    seoDescription: implant.seoDescription ?? null,
    status: implant.status,
    maudeBrandKey: implant.maudeBrandKey,
    techniqueGuideUrl: implant.techniqueGuideUrl ?? null,
    techniqueGuideTitle: implant.techniqueGuideTitle ?? null,
    aiRating: implant.aiRating ?? null,
    aiSummary: implant.aiSummary ?? null,
    aiRatedAt: implant.aiRatedAt ? implant.aiRatedAt.toISOString() : null,
    catalogScore: implant.catalogScore ?? null,
    communityScore: implant.communityScore ?? null,
    ratingSampleN: implant.ratingSampleN ?? null,
    ratingVersion: implant.ratingVersion ?? null,
    aiRatingLocked: Boolean(implant.aiRatingLocked),
    utilityScore: implant.utilityScore ?? null,
    maudeScore: implant.maudeScore ?? null,
    maudeHazard: implant.maudeHazard ?? null,
    maudeSignal: implant.maudeSignal ?? null,
    scoreBreakdown: implant.scoreBreakdown ?? null,
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
