import { useEffect, useMemo, useState } from 'react';
import { Bone, ChevronLeft, ChevronRight, Expand, X, ZoomIn, ZoomOut } from 'lucide-react';

export type GalleryImage = {
  kind: string;
  url: string;
  alt?: string | null;
  attribution?: string | null;
  licenseNote?: string | null;
};

function kindLabel(kind: string) {
  if (kind === 'product') return 'Product';
  if (kind === 'xray') return 'X-ray';
  if (kind === 'diagram') return 'Diagram';
  return kind;
}

type Props = {
  brandName: string;
  images: GalleryImage[];
  className?: string;
};

/**
 * One large viewer + thumbnail strip for product / x-ray / diagram assets.
 * X-ray / diagram open in a lightbox with zoom.
 */
export function ImplantMediaGallery({ brandName, images, className = '' }: Props) {
  const sorted = useMemo(() => {
    const order = { product: 0, xray: 1, diagram: 2 } as Record<string, number>;
    return [...images].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  }, [images]);

  const startIdx = Math.max(0, sorted.findIndex((i) => i.kind === 'product'));
  const [index, setIndex] = useState(startIdx === -1 ? 0 : startIdx);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState(1);
  const current = sorted[index] || null;
  const count = sorted.length;
  const canExpand = current?.kind === 'xray' || current?.kind === 'diagram';

  const go = (delta: number) => {
    if (count <= 1) return;
    setIndex((i) => (i + delta + count) % count);
  };

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox, count]);

  useEffect(() => {
    setZoom(1);
  }, [index, lightbox]);

  if (count === 0) {
    return (
      <div
        className={`flex aspect-square w-full max-w-none flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 text-gray-400 sm:max-w-[280px] ${className}`}
      >
        <Bone className="h-10 w-10" />
        <span className="text-xs">Product image coming soon</span>
      </div>
    );
  }

  return (
    <div id="gallery" className={`w-full max-w-none sm:max-w-[320px] ${className}`}>
      <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white">
        <button
          type="button"
          className="block w-full cursor-zoom-in text-left disabled:cursor-default"
          onClick={() => {
            if (canExpand) setLightbox(true);
          }}
          disabled={!canExpand}
          aria-label={canExpand ? 'Expand image' : undefined}
        >
          <img
            src={current!.url}
            alt={current!.alt || `${brandName} — ${kindLabel(current!.kind)}`}
            className={`aspect-square w-full bg-white object-contain p-2 ${
              current!.kind === 'xray' ? 'bg-neutral-950 p-1' : ''
            }`}
          />
        </button>
        <div className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
          {kindLabel(current!.kind)}
        </div>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="touch-target absolute right-2 top-2 rounded bg-black/65 p-2 text-white hover:bg-black/80"
            aria-label="Open lightbox"
          >
            <Expand className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="touch-target absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-gray-700 shadow hover:bg-white"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="touch-target absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-gray-700 shadow hover:bg-white"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
              {index + 1} / {count}
            </div>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div
          id="gallery-thumbs"
          className="mt-2 flex scroll-mt-24 gap-1.5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] scrollbar-hide"
        >
          {sorted.map((img, i) => (
            <button
              key={`${img.url}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-white sm:h-14 sm:w-14 ${
                i === index
                  ? 'border-blue-600 ring-1 ring-blue-600'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
              aria-label={`View ${kindLabel(img.kind)}`}
            >
              <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
              <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[8px] font-medium uppercase text-white">
                {kindLabel(img.kind).slice(0, 4)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {(current?.attribution || current?.licenseNote) && (
        <p className="mt-1.5 text-[10px] leading-snug text-gray-400">
          {[current.attribution, current.licenseNote].filter(Boolean).join(' · ')}
        </p>
      )}

      {lightbox && current ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          role="dialog"
          aria-modal="true"
          aria-label={`${brandName} ${kindLabel(current.kind)}`}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 text-white">
            <p className="truncate text-sm font-medium">
              {brandName} · {kindLabel(current.kind)}
              {count > 1 ? ` · ${index + 1}/${count}` : ''}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded p-2 hover:bg-white/10"
                onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded p-2 hover:bg-white/10"
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded p-2 hover:bg-white/10"
                onClick={() => setLightbox(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
                  aria-label="Next"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            ) : null}
            <img
              src={current.url}
              alt={current.alt || `${brandName} — ${kindLabel(current.kind)}`}
              style={{ transform: `scale(${zoom})` }}
              className="max-h-full max-w-full object-contain transition-transform duration-150"
            />
          </div>
          {(current.attribution || current.licenseNote) && (
            <p className="px-4 pb-3 text-center text-[11px] text-white/60">
              {[current.attribution, current.licenseNote].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
