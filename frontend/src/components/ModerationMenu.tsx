import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface ModerationMenuProps {
  postId: string;
  communityId: string;
  isLocked?: boolean;
  isPinned?: boolean;
  onDelete?: () => void;
}

const Z_MOD_BACKDROP = 11480;
const Z_MOD_MENU = 11490;

const ModerationMenu: React.FC<ModerationMenuProps> = ({
  postId,
  communityId,
  isLocked = false,
  isPinned = false,
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

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => apiService.lockPost(postId, locked),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success(isLocked ? 'Post unlocked' : 'Post locked');
      setIsOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to lock/unlock post');
    },
  });

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) => apiService.pinPost(postId, pinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success(isPinned ? 'Post unpinned' : 'Post pinned');
      setIsOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to pin/unpin post');
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
    const menuHeight = 220;
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
        aria-label="Moderation options"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            lockMutation.mutate(!isLocked);
          }}
          disabled={lockMutation.isPending}
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
          role="menuitem"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={
                isLocked
                  ? 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z'
                  : 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z'
              }
            />
          </svg>
          <span>{isLocked ? 'Unlock Post' : 'Lock Post'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            pinMutation.mutate(!isPinned);
          }}
          disabled={pinMutation.isPending}
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
          role="menuitem"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
          <span>{isPinned ? 'Unpin Post' : 'Pin Post'}</span>
        </button>

        <div className="border-t border-gray-200 my-1" />

        <button
          type="button"
          onClick={() => {
            if (window.confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
              if (onDelete) {
                onDelete();
              }
              setIsOpen(false);
            }
          }}
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
          <span>Delete Post</span>
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
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

export default ModerationMenu;
