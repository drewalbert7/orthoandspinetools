import React from 'react';
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
  if (u.includes('/image/upload')) return 'image';
  if (u.includes('/video/upload')) return 'video';
  if (/\.(jpe?g|png|gif|webp|svg|avif|bmp|heic|heif)(\?|#|$)/i.test(u)) return 'image';
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(u)) return 'video';
  return 'file';
}

function mediaSrc(attachment: TimelineAttachment): string {
  // Prefer canonical delivery URL from upload; optimized/thumbnail are SDK-derived and used to 404 when version was wrong (nested public_id + forced v1).
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

const PostAttachments: React.FC<PostAttachmentsProps> = ({ attachments, postId, variant = 'default' }) => {
  const isDetail = variant === 'detail';
  const rootMb = isDetail ? 'mb-6' : 'mb-3';
  const singleMaxH = isDetail ? '80vh' : '600px';
  const videoMaxH = isDetail ? '80vh' : '600px';
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

  const renderImageTile = (item: Enriched, opts: { overlayPlus?: number; tileClass?: string }) => {
    const { overlayPlus, tileClass = '' } = opts;
    const inner = (
      <>
        <img
          src={item.src}
          alt=""
          className="absolute inset-0 w-full h-full object-cover hover:opacity-95 transition-opacity"
          loading="lazy"
          decoding="async"
        />
        {overlayPlus != null && overlayPlus > 0 ? (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-lg sm:text-2xl font-semibold tabular-nums">
            +{overlayPlus}
          </div>
        ) : null}
      </>
    );
    const boxClass = `relative bg-gray-100 overflow-hidden rounded-md aspect-[4/3] ${tileClass}`;
    if (postId) {
      return (
        <Link
          key={item.att.id}
          to={`/post/${postId}`}
          className={`${boxClass} block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
        >
          {inner}
        </Link>
      );
    }
    return (
      <div
        key={item.att.id}
        className={`${boxClass} cursor-pointer`}
        onClick={() => window.open(item.src, '_blank')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.open(item.src, '_blank');
          }
        }}
        role="button"
        tabIndex={0}
      >
        {inner}
      </div>
    );
  };

  if (imageItems.length === 0 && videoItems.length > 0) {
    const primaryVideo = videoItems[0];
    const mediaSrcV = primaryVideo.src;
    const extraAfterVideo = list.length > 1;
    return (
      <div className={rootMb}>
        <div className="relative bg-gray-100 rounded-md overflow-hidden">
          <video
            src={mediaSrcV}
            className="w-full h-auto object-contain rounded-md"
            controls
            playsInline
            preload="metadata"
            style={{ maxHeight: videoMaxH }}
          />
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
    const show = imageItems.slice(0, 4);
    const shownIds = new Set(show.map((s) => s.att.id));
    const moreCount = list.filter((a) => !shownIds.has(a.id)).length;
    const hiddenImageCount = Math.max(0, imageItems.length - 4);
    const overlayOnLast = show.length === 4 && hiddenImageCount > 0 ? hiddenImageCount : undefined;
    const footerMore = moreCount - hiddenImageCount;

    return (
      <div className={rootMb}>
        <div
          className={`grid gap-0.5 rounded-md overflow-hidden bg-gray-100 ${
            show.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {show.map((item, idx) => {
            const isThirdOfThree = show.length === 3 && idx === 2;
            const tileClass = isThirdOfThree ? 'col-span-2 aspect-[21/9]' : '';
            const overlayPlus = idx === 3 ? overlayOnLast : undefined;
            return renderImageTile(item, { overlayPlus, tileClass });
          })}
        </div>
        {footerMore > 0 ? (
          <div className="text-xs text-gray-500 mt-2 text-center">
            +{footerMore} more attachment{footerMore !== 1 ? 's' : ''}
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
