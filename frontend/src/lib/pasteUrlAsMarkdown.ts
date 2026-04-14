import type { ClipboardEvent } from 'react';

export function clipboardTextAsSingleHttpUrl(raw: string): string | null {
  const t = raw.replace(/\u200b/g, '').trim();
  if (!t) return null;
  const lines = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length !== 1) return null;
  const line = lines[0];
  if (/\s/.test(line)) return null;
  let candidate = line;
  if (!/^https?:\/\//i.test(candidate) && /^www\./i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  if (!/^https?:\/\//i.test(candidate)) return null;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

export function markdownLinkLabelForUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '');
    const pathAndQuery = (u.pathname === '/' ? '' : u.pathname) + u.search;
    const combined = pathAndQuery ? `${host}${pathAndQuery}` : host;
    if (combined.length <= 80) return combined;
    return `${combined.slice(0, 77)}…`;
  } catch {
    return url.length > 80 ? `${url.slice(0, 77)}…` : url;
  }
}

function markdownLinkDestination(url: string): string {
  if (url.includes(')') || url.includes(' ') || url.includes('<') || url.includes('\n')) {
    return `<${url}>`;
  }
  return url;
}

export function markdownLinkFromUrl(url: string): string {
  const label = markdownLinkLabelForUrl(url);
  const dest = markdownLinkDestination(url);
  return `[${label}](${dest})`;
}

export function tryApplyUrlPasteToTextarea(
  e: ClipboardEvent<HTMLTextAreaElement>,
  currentValue: string,
  onInsert: (next: string) => void
): boolean {
  const url = clipboardTextAsSingleHttpUrl(e.clipboardData.getData('text/plain'));
  if (!url) return false;
  e.preventDefault();
  const ta = e.currentTarget;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? 0;
  const link = markdownLinkFromUrl(url);
  const next = currentValue.slice(0, start) + link + currentValue.slice(end);
  onInsert(next);
  window.setTimeout(() => {
    ta.focus();
    const pos = start + link.length;
    ta.setSelectionRange(pos, pos);
  }, 0);
  return true;
}
