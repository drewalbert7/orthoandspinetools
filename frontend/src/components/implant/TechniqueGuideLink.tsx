import { FileText } from 'lucide-react';

type Props = {
  url: string;
  title?: string | null;
  /** Compact control for directory list rows */
  compact?: boolean;
  className?: string;
};

function isPdfUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return /\.pdf$/i.test(path);
  } catch {
    return /\.pdf(\?|#|$)/i.test(url);
  }
}

/**
 * Opens the manufacturer surgical technique / instructional sheet.
 * Prefers direct PDF links so surgeons land on the document, not a marketing page.
 */
export function TechniqueGuideLink({ url, title, compact = false, className = '' }: Props) {
  const pdf = isPdfUrl(url);
  const label = title?.trim() || (pdf ? 'Technique PDF' : 'Technique guide');
  const shortLabel = pdf ? 'PDF' : 'Guide';

  if (compact) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={`${label} (opens ${pdf ? 'PDF' : 'document'})`}
        aria-label={`${label} — open ${pdf ? 'PDF' : 'document'} in new tab`}
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800 ${className}`}
      >
        <FileText className="h-4 w-4" aria-hidden />
        <span className="sr-only">{shortLabel}</span>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 transition-colors hover:border-blue-400 hover:bg-blue-100 ${className}`}
    >
      <FileText className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block leading-tight">{label}</span>
        <span className="block text-[10px] font-medium uppercase tracking-wide text-blue-700/80">
          {pdf ? 'Direct PDF · opens in new tab' : 'Opens in new tab'}
        </span>
      </span>
    </a>
  );
}
