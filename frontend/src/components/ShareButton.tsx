import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

interface ShareButtonProps {
  url: string;
  title?: string;
  type?: 'post' | 'comment';
  className?: string;
  size?: 'sm' | 'md';
}

const IconX = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const IconFacebook = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const IconLinkedIn = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const menuItemClass =
  'w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-100/90 flex items-center gap-3 rounded-lg mx-1 transition-colors';

/** Above sticky header (z-40), sidebar overlay (z-50), and react-hot-toast (default 9999). */
const Z_SHARE_BACKDROP = 11500;
const Z_SHARE_MENU = 11510;

const ShareButton: React.FC<ShareButtonProps> = ({
  url,
  title,
  type = 'post',
  className: _className = '',
  size: _size = 'md',
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const shareMenuId = useId();

  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  const shareText = title || `Check out this ${type} on OrthoAndSpineTools`;

  useLayoutEffect(() => {
    if (!showMenu || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 260;
    const menuHeight = 360;
    const gutter = 10;

    let left = rect.left;
    let top = rect.bottom + gutter;

    if (left + menuWidth > window.innerWidth - gutter) {
      left = window.innerWidth - menuWidth - gutter;
    }
    if (left < gutter) {
      left = gutter;
    }

    if (top + menuHeight > window.innerHeight - gutter) {
      top = rect.top - menuHeight - gutter;
    }
    if (top < gutter) {
      top = gutter;
    }

    setMenuPosition({ top, left });
  }, [showMenu]);

  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setShowMenu(false);
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showMenu]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success('Link copied to clipboard!');
      setShowMenu(false);
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = fullUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        toast.success('Link copied to clipboard!');
        setShowMenu(false);
      } catch (fallbackErr) {
        toast.error('Failed to copy link');
      }
      document.body.removeChild(textArea);
    }
  };

  const shareToX = () => {
    const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(fullUrl)}`;
    window.open(xUrl, '_blank', 'noopener,noreferrer,width=550,height=420');
    setShowMenu(false);
  };

  const shareToFacebook = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}`;
    window.open(facebookUrl, '_blank', 'noopener,noreferrer,width=550,height=420');
    setShowMenu(false);
  };

  const shareToLinkedIn = () => {
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(fullUrl)}`;
    window.open(linkedInUrl, '_blank', 'noopener,noreferrer,width=550,height=420');
    setShowMenu(false);
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent(shareText);
    const body = encodeURIComponent(`Check out this ${type}: ${fullUrl}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setShowMenu(false);
  };

  const useNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareText,
          text: shareText,
          url: fullUrl,
        });
        setShowMenu(false);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast.error('Failed to share');
        }
      }
    } else {
      copyToClipboard();
    }
  };

  const iconSize = 'w-4 h-4 shrink-0';
  const baseButtonClass =
    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200/90 bg-white shadow-sm hover:shadow hover:border-gray-300 hover:bg-gray-50/80 transition-all text-gray-800';

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu((prev) => !prev);
  };

  return (
    <>
      <div ref={buttonRef} className="relative inline-block">
        <button onClick={handleButtonClick} type="button" className={baseButtonClass}>
          <svg className={`${iconSize} text-gray-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.632-2.684 3 3 0 00-5.632 2.684zm0 9.316a3 3 0 105.632 2.684 3 3 0 00-5.632-2.684z"
            />
          </svg>
          <span className="text-sm font-medium">Share</span>
        </button>
      </div>

      {showMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 bg-black/25 backdrop-blur-[1px]"
              onClick={() => setShowMenu(false)}
              style={{ zIndex: Z_SHARE_BACKDROP }}
              aria-hidden
            />

            <div
              ref={menuRef}
              id={shareMenuId}
              data-share-menu
              role="menu"
              aria-label="Share"
              className="fixed w-[260px] rounded-xl border border-gray-200/90 bg-white/95 shadow-xl shadow-gray-900/10 ring-1 ring-black/5 py-1.5"
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
                zIndex: Z_SHARE_MENU,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" onClick={copyToClipboard} className={menuItemClass} role="menuitem">
                <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span>Copy link</span>
              </button>

              {'share' in navigator && (
                <button type="button" onClick={useNativeShare} className={menuItemClass} role="menuitem">
                  <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  <span>Share via device…</span>
                </button>
              )}

              <div className="my-1.5 mx-2 h-px bg-gray-200" />

              <button type="button" onClick={shareToX} className={menuItemClass} role="menuitem">
                <IconX className={`${iconSize} text-gray-900`} />
                <span>Post on X</span>
              </button>

              <button type="button" onClick={shareToFacebook} className={menuItemClass} role="menuitem">
                <IconFacebook className={`${iconSize} text-[#1877F2]`} />
                <span>Share on Facebook</span>
              </button>

              <button type="button" onClick={shareToLinkedIn} className={menuItemClass} role="menuitem">
                <IconLinkedIn className={`${iconSize} text-[#0A66C2]`} />
                <span>Share on LinkedIn</span>
              </button>

              <button type="button" onClick={shareViaEmail} className={menuItemClass} role="menuitem">
                <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span>Email</span>
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  );
};

export default ShareButton;
