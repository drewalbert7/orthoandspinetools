import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Comment as CommentType } from '../types';
import { formatDistanceToNow } from 'date-fns';
import CommentModerationMenu from './CommentModerationMenu';

interface CommentProps {
  comment: CommentType;
  onReply: (parentId: string, content: string) => void;
  onVote: (commentId: string, voteType: 'upvote' | 'downvote') => void;
  depth?: number;
  maxDepth?: number;
  communityId?: string;
}

const Comment: React.FC<CommentProps> = ({ 
  comment, 
  onReply, 
  onVote, 
  depth = 0, 
  maxDepth = 5,
  communityId
}) => {
  const { user } = useAuth();
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReplies, setShowReplies] = useState(depth < 2); // Auto-expand first 2 levels

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onReply(comment.id, replyContent);
      setReplyContent('');
      setIsReplying(false);
      setShowReplies(true);
    } catch (error) {
      console.error('Error replying to comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = (voteType: 'upvote' | 'downvote') => {
    onVote(comment.id, voteType);
  };

  const canReply = depth < maxDepth;
  const hasReplies = comment.replies && comment.replies.length > 0;

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l-2 border-gray-200 pl-4' : ''}`}>
      {/* Comment Content */}
      <div className="bg-white border border-gray-200 rounded-md mb-2">
        <div className="flex">
          {/* Voting Section */}
          <div className="flex flex-col items-center p-2 bg-gray-50">
            <button
              onClick={() => handleVote('upvote')}
              className={`p-1 rounded hover:bg-gray-200 transition-colors ${
                comment.userVote === 'upvote' ? 'text-orange-500' : 'text-gray-400'
              }`}
              disabled={!user}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <span className={`text-xs font-medium ${
              comment.voteScore > 0 ? 'text-orange-500' : 
              comment.voteScore < 0 ? 'text-blue-500' : 'text-gray-500'
            }`}>
              {comment.voteScore}
            </span>
            <button
              onClick={() => handleVote('downvote')}
              className={`p-1 rounded hover:bg-gray-200 transition-colors ${
                comment.userVote === 'downvote' ? 'text-blue-500' : 'text-gray-400'
              }`}
              disabled={!user}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Comment Body */}
          <div className="flex-1 p-3">
            {/* Author and Meta */}
            <div className="flex items-center space-x-2 text-xs text-gray-500 mb-2">
              <span className="font-medium text-gray-900">u/{comment.author.username}</span>
              {comment.author.specialty && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  {comment.author.specialty}
                </span>
              )}
              <span>•</span>
              <span>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
            </div>

            {/* Comment Content */}
            <div className="text-sm text-gray-900 mb-3">
              {comment.content}
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-4 text-xs text-gray-500">
              {canReply && user && (
                <button
                  onClick={() => setIsReplying(!isReplying)}
                  className="hover:text-gray-700 transition-colors"
                >
                  Reply
                </button>
              )}
              <button className="hover:text-gray-700 transition-colors">
                Share
              </button>
              <button className="hover:text-gray-700 transition-colors">
                Report
              </button>
              {hasReplies && (
                <button
                  onClick={() => setShowReplies(!showReplies)}
                  className="hover:text-gray-700 transition-colors"
                >
                  {showReplies ? 'Hide' : 'Show'} {comment._count.replies} replies
                </button>
              )}
              {communityId && (
                <CommentModerationMenu
                  commentId={comment.id}
                  postId={comment.post.id}
                  communityId={communityId}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reply Form */}
      {isReplying && user && (
        <div className="ml-4 mb-4">
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="What are your thoughts?"
              className="w-full p-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
              rows={3}
            />
            <div className="flex justify-end space-x-2 mt-2">
              <button
                onClick={() => setIsReplying(false)}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReply}
                disabled={!replyContent.trim() || isSubmitting}
                className="px-3 py-1 text-sm bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Posting...' : 'Reply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nested Replies */}
      {hasReplies && showReplies && (
        <div className="space-y-2">
          {comment.replies.map((reply) => (
            <Comment
              key={reply.id}
              comment={reply}
              onReply={onReply}
              onVote={onVote}
              depth={depth + 1}
              maxDepth={maxDepth}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Comment;
