import React, { useState } from 'react';
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

const CommentModerationMenu: React.FC<CommentModerationMenuProps> = ({
  commentId,
  postId,
  communityId,
  onDelete,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [permissions, setPermissions] = useState<any>(null);

  // Fetch moderation permissions
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

  // Delete comment mutation
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

  // Check if user can moderate this comment
  const canModerate = React.useMemo(() => {
    if (!user || !permissions) return false;
    
    // Admin can moderate everything
    if (permissions.isAdmin) return true;
    
    // Check if user is moderator of this community
    const isModerator = permissions.moderatedCommunities?.some(
      (m: any) => m.communityId === communityId
    );
    
    // Check if user owns this community
    const isOwner = permissions.ownedCommunities?.some(
      (c: any) => c.id === communityId
    );
    
    return isModerator || isOwner;
  }, [user, permissions, communityId]);

  if (!canModerate) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
        title="Moderation options"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20">
            <div className="py-1">
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Delete Comment</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CommentModerationMenu;

