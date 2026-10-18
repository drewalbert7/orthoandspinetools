/** Mirror of backend/src/lib/implantSafetySignal.ts SafetySignal (API payload). */
export type SafetyConfidence = 'high' | 'medium' | 'low' | 'insufficient';

export type SafetySignalPayload = {
  version: string;
  score: number | null;
  confidence: SafetyConfidence;
  notes: string[];
  counts: {
    death: number;
    injury: number;
    malfunction: number;
    other: number;
    total: number;
    breaks: number;
  };
  severityIndex: number | null;
  categoryIndex: number | null;
  shrunkIndex: number | null;
  shrinkWeight: number | null;
  relative: number | null;
  breakShare: number | null;
  categoryBreakShare: number | null;
  recallFactor: number;
  priorStrength: number;
  categoryReports: number;
  categoryBrands: number;
  categories: Array<{ code: string; name?: string | null; share: number; brandCount: number; reports: number }>;
  recalls: Array<{
    id: string;
    classification: 'Class I' | 'Class II' | 'Class III';
    date: string | null;
    firm: string | null;
    product: string;
    reason: string | null;
    url: string;
  }>;
  trend: { recentTotal: number; priorTotal: number; months: Array<{ month: string; count: number }> };
  sources: Array<{ label: string; url: string }>;
  pulledAt: string;
  windowStart: string;
  windowEnd: string;
};

export const SAFETY_SIGNAL_LABEL = 'Reported safety signal (FDA MAUDE)';

export const SAFETY_SIGNAL_NOTE =
  'MAUDE reports are voluntary and there is no count of implants in use, so this is a reporting signal, not a failure rate.';

export function confidenceLabel(c: SafetyConfidence | undefined | null): string {
  if (c === 'high') return 'High confidence';
  if (c === 'medium') return 'Medium confidence';
  if (c === 'low') return 'Low confidence';
  return 'Insufficient data';
}

/** Only api.fda.gov and accessdata.fda.gov links are shown as sources. */
export function isOpenFdaSourceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'api.fda.gov' || u.hostname === 'www.accessdata.fda.gov');
  } catch {
    return false;
  }
}

export function pulledDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}
