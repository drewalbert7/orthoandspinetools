import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

interface TimelineAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType?: string;
  mime_type?: string;
  path?: string;
  cloudinaryUrl?: string;
  optimizedUrl?: string;
  thumbnailUrl?: string;
  size?: number;
}

function inferMediaKind(mime: string, src: string): 'image' | 'video' | 'file' {
  const m = (mime || '').toLowerCase().trim();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (!src) return 'file';
  const u = src.toLowerCase();
  if (u.includes('cloudflarestream.com') || u.includes('videodelivery.net')) return 'video';
  if (u.includes('/image/upload') || u.includes('imagedelivery.net')) return 'image';
  if (u.includes('/video/upload')) return 'video';
  if (/\.(jpe?g|png|gif|webp|svg|avif|bmp|heic|heif)(\?|#|$)/i.test(u)) return 'image';
  if (/\.(mp4|webm|mov|m4v|ogv|m3u8)(\?|#|$)/i.test(u)) return 'video';
  return 'file';
}

function isCloudflareStreamUrl(src: string): boolean {
  const u = (src || '').toLowerCase();
  return u.includes('cloudflarestream.com') || u.includes('videodelivery.net');
}

function streamIframeSrc(src: string): string {
  try {
    const url = new URL(src);
    const parts = url.pathname.split('/').filter(Boolean);
    const uid = parts[0];
    if (uid && /^[a-f0-9]{32}$/i.test(uid)) {
      return `${url.origin}/${uid}/iframe`;
    }
  } catch {
    /* keep original */
  }
  if (src.includes('/iframe')) return src;
  return src;
}

function mediaSrc(attachment: TimelineAttachment): string {
  return (
    attachment.cloudinaryUrl ||
    attachment.path ||
    attachment.optimizedUrl ||
    attachment.thumbnailUrl ||
    attachment.filename ||
    ''
  );
}

interface PostAttachmentsProps {
  attachments?: TimelineAttachment[] | null;
  /** When set (e.g. feed cards), image preview links to the post; videos stay inline-playable. */
  postId?: string;
  /** Taller preview on post detail (Reddit-style full-width). */
  variant?: 'default' | 'detail';
}

type Enriched = { att: TimelineAttachment; src: string; kind: 'image' | 'video' | 'file' };

/** Reddit-style multi-image carousel: one image at a time with arrows, counter, and dots. */
const ImageCarousel: React.FC<{
  items: Enriched[];
  maxHeight: string;
  postId?: string;
  isDetail: boolean;
}> = ({ items, maxHeight, postId, isDetail }) => {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const total = items.length;
  const current = items[Math.min(index, total - 1)] ?? items[0];

  useEffect(() => {
    setIndex((i) => (i >= total ? 0 : i));
  }, [total]);

  const go = useCallback(
    (next: number) => {
      if (total <= 1) return;
      setIndex(((next % total) + total) % total);
    },
    [total]
  );

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const openCurrent = () => {
    if (postId) return;
    window.open(current.src, '_blank');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      stop(e);
      go(index - 1);
    } else if (e.key === 'ArrowRight') {
      stop(e);
      go(index + 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!postId) {
        stop(e);
        openCurrent();
      }
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchDeltaX.current = 0;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    touchDeltaX.current = (e.touches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = touchDeltaX.current;
    touchStartX.current = null;
    touchDeltaX.current = 0;
    if (Math.abs(dx) < 48) return;
    e.stopPropagation();
    if (dx < 0) go(index + 1);
    else go(index - 1);
  };

  const img = (
    <img
      src={current.src}
      alt=""
      className="w-full h-auto object-contain select-none"
      style={{ maxHeight }}
      loading={index === 0 ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
    />
  );

  return (
    <div
      className="relative bg-gray-100 rounded-md overflow-hidden group outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      role="region"
      aria-roledescription="carousel"
      aria-label={`Image ${index + 1} of ${total}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative flex items-center justify-center min-h-[10rem] bg-neutral-900/5">
        {postId ? (
          <Link
            to={`/post/${postId}`}
            className="block w-full focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            {img}
          </Link>
        ) : (
          <button
            type="button"
            className="block w-full cursor-zoom-in p-0 border-0 bg-transparent"
            onClick={(e) => {
              stop(e);
              openCurrent();
            }}
            aria-label="Open image"
          >
            {img}
          </button>
        )}

        <div
          className="absolute top-2 right-2 z-10 rounded-full bg-black/70 text-white text-[11px] sm:text-xs font-semibold tabular-nums px-2 py-0.5 pointer-events-none"
          aria-hidden
        >
          {index + 1}/{total}
        </div>

        <button
          type="button"
          aria-label="Previous image"
          className="absolute left-1.5 sm:left-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 transition-opacity opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white touch-target"
          onClick={(e) => {
            stop(e);
            go(index - 1);
          }}
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          type="button"
          aria-label="Next image"
          className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 transition-opacity opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white touch-target"
          onClick={(e) => {
            stop(e);
            go(index + 1);
          }}
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {total > 1 ? (
        <div
          className={`flex items-center justify-center gap-1.5 py-2 bg-white border-t border-gray-100 ${
            isDetail ? 'py-2.5' : ''
          }`}
          role="tablist"
          aria-label="Image slides"
        >
          {items.map((item, i) => (
            <button
              key={item.att.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to image ${i + 1}`}
              className={`h-1.5 rounded-full transition-all touch-target ${
                i === index ? 'w-4 bg-gray-800' : 'w-1.5 bg-gray-300 hover:bg-gray-400'
              }`}
              onClick={(e) => {
                stop(e);
                setIndex(i);
              }}
            />
          ))}
        </div>
      ) : null}

      {/* Prefetch neighbors for snappier swipes */}
      <div className="sr-only" aria-hidden>
        {items.map((item, i) =>
          Math.abs(i - index) === 1 ? <img key={`preload-${item.att.id}`} src={item.src} alt="" /> : null
        )}
      </div>
    </div>
  );
};

const PostAttachments: React.FC<PostAttachmentsProps> = ({ attachments, postId, variant = 'default' }) => {
  const isDetail = variant === 'detail';
  const rootMb = isDetail ? 'mb-6' : 'mb-3';
  const singleMaxH = isDetail ? '80vh' : 'min(42vh, 420px)';
  const videoMaxH = isDetail ? '80vh' : 'min(42vh, 420px)';
  const list = attachments ?? [];
  if (list.length === 0) {
    return null;
  }

  const enriched: Enriched[] = list.map((att) => {
    const src = mediaSrc(att);
    const mimeRaw = att.mimeType ?? att.mime_type ?? '';
    const kind = inferMediaKind(mimeRaw, src);
    return { att, src, kind };
  });

  const available = enriched.filter((e) => e.src);
  if (available.length === 0) {
    return (
      <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        Media unavailable for this post.
      </div>
    );
  }

  let firstOrdered: Enriched | undefined;
  for (const att of list) {
    const e = available.find((x) => x.att.id === att.id);
    if (e) {
      firstOrdered = e;
      break;
    }
  }
  if (!firstOrdered) firstOrdered = available[0];

  const imageItems = list
    .map((att) => enriched.find((e) => e.att.id === att.id))
    .filter((e): e is Enriched => !!e && e.kind === 'image' && !!e.src);

  const videoItems = list
    .map((att) => enriched.find((e) => e.att.id === att.id))
    .filter((e): e is Enriched => !!e && e.kind === 'video' && !!e.src);

  if (imageItems.length === 0 && videoItems.length > 0) {
    const primaryVideo = videoItems[0];
    const mediaSrcV = primaryVideo.src;
    const extraAfterVideo = list.length > 1;
    const useStreamPlayer = isCloudflareStreamUrl(mediaSrcV);
    return (
      <div className={rootMb}>
        <div className="relative bg-gray-100 rounded-md overflow-hidden">
          {useStreamPlayer ? (
            <iframe
              src={streamIframeSrc(mediaSrcV)}
              title="Video"
              className="w-full rounded-md border-0"
              style={{ maxHeight: videoMaxH, aspectRatio: '16 / 9', minHeight: isDetail ? 280 : 160 }}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          ) : (
            <video
              src={mediaSrcV}
              className="w-full h-auto object-contain rounded-md"
              controls
              playsInline
              preload="metadata"
              style={{ maxHeight: videoMaxH }}
            />
          )}
          {postId && (
            <div className="px-2 py-1.5 border-t border-gray-200 bg-white/90">
              <Link
                to={`/post/${postId}`}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                View post
              </Link>
            </div>
          )}
        </div>
        {extraAfterVideo && (
          <div className="text-xs text-gray-500 mt-2 text-center">
            +{list.length - 1} more attachment{list.length - 1 !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    );
  }

  if (imageItems.length >= 2) {
    const nonImageExtra = list.length - imageItems.length;
    return (
      <div className={rootMb}>
        <ImageCarousel
          items={imageItems}
          maxHeight={singleMaxH}
          postId={postId}
          isDetail={isDetail}
        />
        {nonImageExtra > 0 ? (
          <div className="text-xs text-gray-500 mt-2 text-center">
            +{nonImageExtra} more attachment{nonImageExtra !== 1 ? 's' : ''}
          </div>
        ) : null}
      </div>
    );
  }

  if (imageItems.length === 1) {
    const lone = imageItems[0];
    const mediaSrcSingle = lone.src;
    const extraCount = list.filter((a) => a.id !== lone.att.id).length;
    return (
      <div className={rootMb}>
        <div className="relative">
          {postId ? (
            <Link
              to={`/post/${postId}`}
              className="relative bg-gray-100 rounded-md overflow-hidden block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <img
                src={mediaSrcSingle}
                alt=""
                className="w-full h-auto object-contain hover:opacity-95 transition-opacity rounded-md"
                style={{ maxHeight: singleMaxH }}
                loading="lazy"
                decoding="async"
              />
            </Link>
          ) : (
            <div
              className="relative bg-gray-100 rounded-md overflow-hidden cursor-pointer"
              onClick={() => window.open(mediaSrcSingle, '_blank')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  window.open(mediaSrcSingle, '_blank');
                }
              }}
              role="button"
              tabIndex={0}
            >
              <img
                src={mediaSrcSingle}
                alt=""
                className="w-full h-auto object-contain hover:opacity-95 transition-opacity rounded-md"
                style={{ maxHeight: singleMaxH }}
                loading="lazy"
                decoding="async"
              />
            </div>
          )}
        </div>
        {extraCount > 0 ? (
          <div className="text-xs text-gray-500 mt-2 text-center">
            +{extraCount} more attachment{extraCount !== 1 ? 's' : ''}
          </div>
        ) : null}
      </div>
    );
  }

  const attachment = firstOrdered.att;
  const mediaSrcSingle = firstOrdered.src;
  const kind = firstOrdered.kind;
  const sizeKb = (attachment.size ?? 0) / 1024;

  return (
    <div className={rootMb}>
      <div className="relative">
        {kind === 'image' ? (
          postId ? (
            <Link
              to={`/post/${postId}`}
              className="relative bg-gray-100 rounded-md overflow-hidden block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <img
                src={mediaSrcSingle}
                alt=""
                className="w-full h-auto object-contain hover:opacity-95 transition-opacity rounded-md"
                style={{ maxHeight: singleMaxH }}
                loading="lazy"
                decoding="async"
              />
            </Link>
          ) : (
            <div
              className="relative bg-gray-100 rounded-md overflow-hidden cursor-pointer"
              onClick={() => window.open(mediaSrcSingle, '_blank')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  window.open(mediaSrcSingle, '_blank');
                }
              }}
              role="button"
              tabIndex={0}
            >
              <img
                src={mediaSrcSingle}
                alt=""
                className="w-full h-auto object-contain hover:opacity-95 transition-opacity rounded-md"
                style={{ maxHeight: singleMaxH }}
                loading="lazy"
                decoding="async"
              />
            </div>
          )
        ) : (
          <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
            <div className="flex items-center space-x-3">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{attachment.originalName}</p>
                <p className="text-xs text-gray-500">{sizeKb.toFixed(1)} KB</p>
              </div>
              <a
                href={mediaSrcSingle}
                download={attachment.originalName}
                className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors flex-shrink-0"
              >
                Download
              </a>
            </div>
          </div>
        )}
      </div>
      {list.length > 1 && (
        <div className="text-xs text-gray-500 mt-2 text-center">
          +{list.length - 1} more attachment{list.length - 1 !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default PostAttachments;
