import { useMemo, useState } from 'react';
import { Bone, ChevronLeft, ChevronRight } from 'lucide-react';

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
  /** Prefer starting on product */
  className?: string;
};

/**
 * One large viewer + thumbnail strip for product / x-ray / diagram assets.
 */
export function ImplantMediaGallery({ brandName, images, className = '' }: Props) {
  const sorted = useMemo(() => {
    const order = { product: 0, xray: 1, diagram: 2 } as Record<string, number>;
    return [...images].sort(
      (a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9)
    );
  }, [images]);

  const startIdx = Math.max(
    0,
    sorted.findIndex((i) => i.kind === 'product')
  );
  const [index, setIndex] = useState(startIdx === -1 ? 0 : startIdx);
  const current = sorted[index] || null;
  const count = sorted.length;

  const go = (delta: number) => {
    if (count <= 1) return;
    setIndex((i) => (i + delta + count) % count);
  };

  if (count === 0) {
    return (
      <div
        className={`flex aspect-square w-full max-w-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 text-gray-400 ${className}`}
      >
        <Bone className="h-10 w-10" />
        <span className="text-xs">Product image coming soon</span>
      </div>
    );
  }

  return (
    <div id="gallery" className={`w-full max-w-[320px] ${className}`}>
      <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white">
        <img
          src={current!.url}
          alt={current!.alt || `${brandName} — ${kindLabel(current!.kind)}`}
          className="aspect-square w-full object-contain bg-white p-2"
        />
        <div className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
          {kindLabel(current!.kind)}
        </div>
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 text-gray-700 shadow hover:bg-white"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 text-gray-700 shadow hover:bg-white"
              aria-label="Next image"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
              {index + 1} / {count}
            </div>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {sorted.map((img, i) => (
            <button
              key={`${img.url}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-white ${
                i === index
                  ? 'border-blue-600 ring-1 ring-blue-600'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
              aria-label={`View ${kindLabel(img.kind)}`}
            >
              <img
                src={img.url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <span className="absolute bottom-0 inset-x-0 bg-black/55 text-center text-[8px] font-medium uppercase text-white">
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
    </div>
  );
}
