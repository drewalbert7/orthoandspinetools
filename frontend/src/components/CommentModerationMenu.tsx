import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface CommentModerationMenuProps {
  commentId: string;
  postId: string;
  communityId: string;
  onDelete?: () => void;
}

const Z_MOD_BACKDROP = 11480;
const Z_MOD_MENU = 11490;

const CommentModerationMenu: React.FC<CommentModerationMenuProps> = ({
  commentId,
  postId,
  communityId,
  onDelete,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [permissions, setPermissions] = useState<any>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const perms = await apiService.getModerationPermissions();
        setPermissions(perms);
      } catch (error) {
        // User might not have permissions, that's okay
      }
    };
    if (user) {
      fetchPermissions();
    }
  }, [user]);

  const deleteMutation = useMutation({
    mutationFn: () => apiService.deleteComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Comment deleted');
      setIsOpen(false);
      if (onDelete) {
        onDelete();
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete comment');
    },
  });

  const canModerate = React.useMemo(() => {
    if (!user) return false;
    if (user.isAdmin) return true;
    if (!permissions) return false;
    if (permissions.isAdmin) return true;

    const isModerator = permissions.moderatedCommunities?.some(
      (m: any) => m.communityId === communityId
    );

    const isOwner = permissions.ownedCommunities?.some((c: any) => c.id === communityId);

    return isModerator || isOwner;
  }, [user, permissions, communityId]);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 80;
    const gutter = 8;

    let left = rect.right - menuWidth;
    let top = rect.bottom + gutter;

    if (left < gutter) left = gutter;
    if (left + menuWidth > window.innerWidth - gutter) {
      left = window.innerWidth - menuWidth - gutter;
    }

    if (top + menuHeight > window.innerHeight - gutter) {
      top = rect.top - menuHeight - gutter;
    }
    if (top < gutter) top = gutter;

    setMenuPos({ top, left });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setIsOpen(false);
    };

    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [isOpen]);

  if (!canModerate) {
    return null;
  }

  const menu = isOpen && typeof document !== 'undefined' && (
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: Z_MOD_BACKDROP }}
        onClick={() => setIsOpen(false)}
        aria-hidden
      />
      <div
        ref={menuRef}
        className="fixed w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1 ring-1 ring-black/5"
        style={{ top: menuPos.top, left: menuPos.left, zIndex: Z_MOD_MENU }}
        role="menu"
        aria-label="Comment moderation"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
          role="menuitem"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          <span>Delete Comment</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <div ref={anchorRef} className="relative inline-flex">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
          title="Moderation options"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </button>
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
};

export default CommentModerationMenu;
