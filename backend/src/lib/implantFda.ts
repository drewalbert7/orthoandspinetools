/**
 * FDA identifiers and page-title helpers shared by the implant API, Markdown twin and OG HTML.
 * Mirrors frontend/src/lib/implantFda.ts.
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

/** One verified FDA record, each with its own accessdata source link. */
export type FdaRecord = {
  number: string;
  pathway: FdaPathway;
  /** What this record covers, e.g. "One-level indication". */
  label: string | null;
  decisionDate: string | null;
  applicant: string | null;
  sourceUrl: string | null;
};

function isoDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = typeof v === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(v.trim()) : null;
  return m ? m[1] : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * All FDA records for a listing: the fda_records array when present (invalid entries dropped),
 * otherwise the single record from the fda_* columns. Never invents a record.
 */
export function implantFdaRecords(implant: {
  fdaNumber?: string | null;
  fdaDecisionDate?: Date | string | null;
  fdaApplicant?: string | null;
  fdaSourceUrl?: string | null;
  fdaRecords?: unknown;
}): FdaRecord[] {
  if (Array.isArray(implant.fdaRecords) && implant.fdaRecords.length > 0) {
    const out: FdaRecord[] = [];
    for (const raw of implant.fdaRecords) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const number = str(r.number)?.toUpperCase() || '';
      const pathway = fdaPathway(number);
      if (!pathway) continue;
      const url = str(r.sourceUrl);
      out.push({
        number,
        pathway,
        label: str(r.label),
        decisionDate: isoDate(r.decisionDate),
        applicant: str(r.applicant),
        sourceUrl: isFdaSourceUrl(url) ? url : null,
      });
    }
    if (out.length > 0) return out;
  }
  const number = str(implant.fdaNumber)?.toUpperCase() || '';
  const pathway = fdaPathway(number);
  if (!pathway) return [];
  const url = str(implant.fdaSourceUrl);
  return [
    {
      number,
      pathway,
      label: null,
      decisionDate: isoDate(implant.fdaDecisionDate),
      applicant: str(implant.fdaApplicant),
      sourceUrl: isFdaSourceUrl(url) ? url : null,
    },
  ];
}
