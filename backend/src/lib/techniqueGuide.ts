/**
 * Surgeon-facing technique links must be direct surgical / operative technique PDFs —
 * not marketing brochures, product catalogs, or HTML landing pages.
 */

const TECHNIQUE_TITLE =
  /\b(surgical\s*technique|operative\s*technique|technique\s*guide|stg|op\.?\s*tech)\b/i;

export function isDirectPdfUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return /\.pdf$/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function looksLikeTechniqueGuideTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return true; // empty title → UI defaults to Surgical technique guide
  return TECHNIQUE_TITLE.test(title);
}

/** Normalize / reject ingest+admin technique guide fields. */
export function normalizeTechniqueGuideFields(input: {
  url?: string | null;
  title?: string | null;
}): { techniqueGuideUrl: string | null; techniqueGuideTitle: string | null } {
  const url = input.url?.trim() || null;
  if (!url) {
    return { techniqueGuideUrl: null, techniqueGuideTitle: null };
  }
  if (!isDirectPdfUrl(url)) {
    throw new Error(
      'techniqueGuideUrl must be a direct https PDF of a surgical/operative technique guide (not a product webpage)'
    );
  }
  const title = input.title?.trim() || 'Surgical technique guide';
  if (!looksLikeTechniqueGuideTitle(title)) {
    throw new Error(
      'techniqueGuideTitle must identify a surgical/operative technique guide (not a brochure or catalog)'
    );
  }
  return { techniqueGuideUrl: url, techniqueGuideTitle: title };
}
