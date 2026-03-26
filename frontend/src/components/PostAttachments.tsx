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
  if (/\.(jpe?g|png|gif|webp|svg|avif|bmp)(\?|#|$)/i.test(u)) return 'image';
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(u)) return 'video';
  return 'file';
}

interface PostAttachmentsProps {
  attachments?: TimelineAttachment[] | null;
  /** When set (e.g. feed cards), image preview links to the post; videos stay inline-playable. */
  postId?: string;
}

const PostAttachments: React.FC<PostAttachmentsProps> = ({ attachments, postId }) => {
  const list = attachments ?? [];
  if (list.length === 0) {
    return null;
  }

  return (
    <div className="mb-3">
      {list.slice(0, 1).map((attachment) => {
        const mediaSrc =
          attachment.optimizedUrl ||
          attachment.thumbnailUrl ||
          attachment.cloudinaryUrl ||
          attachment.path ||
          attachment.filename;
        const mimeRaw = attachment.mimeType ?? attachment.mime_type ?? '';
        const kind = inferMediaKind(mimeRaw, mediaSrc);
        const sizeKb = (attachment.size ?? 0) / 1024;

        if (!mediaSrc) {
          return (
            <div key={attachment.id} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Media unavailable for “{attachment.originalName}”
            </div>
          );
        }

        return (
          <div key={attachment.id} className="relative">
            {kind === 'image' ? (
              postId ? (
                <Link
                  to={`/post/${postId}`}
                  className="relative bg-gray-100 rounded-md overflow-hidden block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <img
                    src={mediaSrc}
                    alt={attachment.originalName}
                    className="w-full h-auto object-contain hover:opacity-95 transition-opacity rounded-md"
                    style={{ maxHeight: '600px' }}
                    loading="lazy"
                    decoding="async"
                  />
                </Link>
              ) : (
                <div
                  className="relative bg-gray-100 rounded-md overflow-hidden cursor-pointer"
                  onClick={() => window.open(mediaSrc, '_blank')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      window.open(mediaSrc, '_blank');
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <img
                    src={mediaSrc}
                    alt={attachment.originalName}
                    className="w-full h-auto object-contain hover:opacity-95 transition-opacity rounded-md"
                    style={{ maxHeight: '600px' }}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              )
            ) : kind === 'video' ? (
              <div className="relative bg-gray-100 rounded-md overflow-hidden">
                <video
                  src={mediaSrc}
                  className="w-full h-auto object-contain rounded-md"
                  controls
                  playsInline
                  preload="metadata"
                  style={{ maxHeight: '600px' }}
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
            ) : (
              <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
                <div className="flex items-center space-x-3">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{attachment.originalName}</p>
                    <p className="text-xs text-gray-500">{sizeKb.toFixed(1)} KB</p>
                  </div>
                  <a
                    href={mediaSrc}
                    download={attachment.originalName}
                    className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors flex-shrink-0"
                  >
                    Download
                  </a>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {list.length > 1 && (
        <div className="text-xs text-gray-500 mt-2 text-center">
          +{list.length - 1} more attachment{list.length - 1 !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default PostAttachments;
