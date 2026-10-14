/** Direct surgical / operative technique PDF only — never HTML marketing pages. */
export function isTechniqueGuidePdfUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return /\.pdf$/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function techniqueGuideLabel(title?: string | null): string {
  const t = title?.trim();
  if (t && /\b(surgical|operative)\b/i.test(t) && /\btechnique\b/i.test(t)) return t;
  if (t && /\btechnique guide\b/i.test(t)) return t;
  return 'Surgical technique guide';
}
