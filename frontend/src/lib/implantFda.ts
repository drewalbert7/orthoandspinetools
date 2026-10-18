/**
 * FDA identifiers and page-title helpers shared by the implant API, Markdown twin and OG HTML.
 * Mirrors backend/src/lib/implantFda.ts.
 */

export type FdaPathway = '510(k)' | 'PMA' | 'De Novo';

/** Pathway from the FDA number prefix: K = 510(k), P = PMA, DEN = De Novo. Unknown returns null. */
export function fdaPathway(fdaNumber: string | null | undefined): FdaPathway | null {
  const n = (fdaNumber || '').trim().toUpperCase();
  if (/^DEN\d{6}$/.test(n)) return 'De Novo';
  if (/^K\d{6}$/.test(n)) return '510(k)';
  if (/^P\d{6}$/.test(n)) return 'PMA';
  return null;
}

/** Only accessdata.fda.gov (or api.fda.gov) links count as an FDA source. */
export function isFdaSourceUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)fda\.gov$/i.test(u.hostname);
  } catch {
    return false;
  }
}

const LEGACY_TITLE_SUFFIX = /\s*[\u2014\u2013-]\s*OrthoAndSpineTools Directory\s*$/i;
const SITE_SUFFIX = /\s*\|\s*OrthoAndSpineTools\s*$/i;

/**
 * Stored implant SEO titles used to end in a dash plus "OrthoAndSpineTools Directory", and
 * the SPA then appended " | OrthoAndSpineTools" again. Normalize to "<title> | Implant Directory"
 * without the site name (callers add it once).
 */
export function cleanImplantSeoTitle(title: string | null | undefined): string | null {
  const t = (title || '').trim();
  if (!t) return null;
  return t.replace(LEGACY_TITLE_SUFFIX, ' | Implant Directory').replace(SITE_SUFFIX, '').trim();
}

export function defaultImplantSeoTitle(brandName: string): string {
  return `${brandName} implant | Implant Directory`;
}

/** "2007-12-17" from an ISO date or timestamp, without a timezone shift. */
export function fdaDateLabel(value: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec((value || '').trim());
  return m ? m[1] : null;
}

/** One verified FDA record from the API (backend implantFdaRecords). */
export type FdaRecord = {
  number: string;
  pathway: FdaPathway;
  label: string | null;
  decisionDate: string | null;
  applicant: string | null;
  sourceUrl: string | null;
};
