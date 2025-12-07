import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import Comment from './Comment';
import { Comment as CommentType } from '../types';

interface CommentListProps {
  postId: string;
  communityId?: string;
}

const CommentList: React.FC<CommentListProps> = ({ postId, communityId }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch comments
  const { data: comments, isLoading, error } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => apiService.getComments(postId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Transform API comments to match our types
  const transformedComments: CommentType[] = (comments || []).map(comment => ({
    ...comment,
    isDeleted: comment.isDeleted || false,
    voteScore: comment.voteScore || 0,
    upvotes: comment.upvotes || 0,
    downvotes: comment.downvotes || 0,
    userVote: comment.userVote || null,
    _count: comment._count || { replies: 0, votes: 0 },
    post: comment.post || { id: postId, title: '' },
    author: {
      ...comment.author,
      isEmailVerified: (comment.author as any).isEmailVerified || false,
    },
    votes: (comment.votes || []).map(vote => ({
      id: vote.id,
      commentId: comment.id,
      userId: vote.userId,
      type: vote.value === 1 ? 'upvote' : 'downvote',
      user: {
        id: vote.userId,
        username: (vote as any).user?.username || '',
      },
      createdAt: vote.createdAt,
    })),
    replies: (comment.replies || []).map(reply => ({
      ...reply,
      isDeleted: reply.isDeleted || false,
      voteScore: reply.voteScore || 0,
      upvotes: reply.upvotes || 0,
      downvotes: reply.downvotes || 0,
      userVote: reply.userVote || null,
      _count: reply._count || { replies: 0, votes: 0 },
      post: reply.post || { id: postId, title: '' },
      author: {
        ...reply.author,
        isEmailVerified: (reply.author as any).isEmailVerified || false,
      },
      votes: (reply.votes || []).map(vote => ({
        id: vote.id,
        commentId: reply.id,
        userId: vote.userId,
        type: vote.value === 1 ? 'upvote' : 'downvote',
        user: {
          id: vote.userId,
          username: (vote as any).user?.username || '',
        },
        createdAt: vote.createdAt,
      })),
      replies: [] // Flatten replies for now
    }))
  }));

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: (data: { postId: string; content: string; parentId?: string }) =>
      apiService.createComment(data.postId, data.content, data.parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      setNewComment('');
    },
  });

  // Vote on comment mutation
  const voteCommentMutation = useMutation({
    mutationFn: (data: { commentId: string; voteType: 'upvote' | 'downvote' }) =>
      apiService.voteComment(data.commentId, data.voteType === 'upvote' ? 1 : -1),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    },
  });

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !user) return;
    
    setIsSubmitting(true);
    try {
      await createCommentMutation.mutateAsync({
        postId,
        content: newComment,
      });
    } catch (error) {
      console.error('Error creating comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = async (parentId: string, content: string) => {
    if (!user) return;
    
    try {
      await createCommentMutation.mutateAsync({
        postId,
        content,
        parentId,
      });
    } catch (error) {
      console.error('Error replying to comment:', error);
      throw error;
    }
  };

  const handleVote = (commentId: string, voteType: 'upvote' | 'downvote') => {
    if (!user) return;
    
    voteCommentMutation.mutate({ commentId, voteType });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-md p-4">
            <div className="animate-pulse">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-20 h-4 bg-gray-200 rounded"></div>
                <div className="w-16 h-4 bg-gray-200 rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="w-full h-4 bg-gray-200 rounded"></div>
                <div className="w-3/4 h-4 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-600">Failed to load comments. Please try again.</p>
      </div>
    );
  }

  const topLevelComments = transformedComments.filter(comment => !(comment as any).parent);

  return (
    <div className="space-y-4">
      {/* Comment Form */}
      {user && (
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">
                {user.username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="What are your thoughts?"
                className="w-full p-3 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
                rows={4}
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || isSubmitting}
                  className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? 'Posting...' : 'Comment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comments Count */}
      <div className="text-sm text-gray-600">
        {topLevelComments.length} {topLevelComments.length === 1 ? 'comment' : 'comments'}
      </div>

      {/* Comments List */}
      {topLevelComments.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-8 text-center">
          <p className="text-gray-500">No comments yet. Be the first to comment!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {topLevelComments.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              onReply={handleReply}
              onVote={handleVote}
              communityId={communityId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentList;
