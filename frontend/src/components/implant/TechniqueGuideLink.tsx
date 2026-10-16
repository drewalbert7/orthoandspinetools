import { FileText } from 'lucide-react';
import { isTechniqueGuidePdfUrl, techniqueGuideLabel } from '../../lib/techniqueGuide';

type Props = {
  url: string;
  title?: string | null;
  /** Compact control for directory list rows */
  compact?: boolean;
  className?: string;
};

/**
 * Opens a manufacturer surgical / operative technique guide PDF.
 * Non-PDF URLs are not rendered (no marketing landing pages).
 */
export function TechniqueGuideLink({ url, title, compact = false, className = '' }: Props) {
  if (!isTechniqueGuidePdfUrl(url)) return null;

  const label = techniqueGuideLabel(title);

  if (compact) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={`${label} (PDF)`}
        aria-label={`${label} — open PDF in new tab`}
        onClick={(e) => e.stopPropagation()}
        className={`touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800 ${className}`}
      >
        <FileText className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">STG</span>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`touch-target inline-flex w-full items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-900 transition-colors hover:border-blue-400 hover:bg-blue-100 sm:w-auto sm:py-2 ${className}`}
    >
      <FileText className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block leading-tight">{label}</span>
        <span className="block text-[10px] font-medium uppercase tracking-wide text-blue-700">
          Surgical technique PDF · not a brochure
        </span>
      </span>
    </a>
  );
}
