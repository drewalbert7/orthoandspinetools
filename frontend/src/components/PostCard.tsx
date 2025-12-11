import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Post, apiService } from '../services/apiService';
import ModerationMenu from './ModerationMenu';
import ShareButton from './ShareButton';
import toast from 'react-hot-toast';

interface PostCardProps {
  post: Post;
  onVote?: (postId: string, voteType: 'upvote' | 'downvote') => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, onVote }) => {
  const [isVoting, setIsVoting] = useState(false);
  const queryClient = useQueryClient();

  const handleVote = async (voteType: 'upvote' | 'downvote') => {
    if (isVoting) return;
    
    setIsVoting(true);
    try {
      // For now, just simulate voting
      console.log(`Voting ${voteType} on post ${post.id}`);
      if (onVote) {
        onVote(post.id, voteType);
      }
    } catch (error) {
      console.error('Error voting:', error);
    } finally {
      setIsVoting(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      if (!dateString) return 'unknown';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'unknown';
      
      const now = new Date();
      const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
      
      if (diffInHours < 1) return 'now';
      if (diffInHours < 24) return `${diffInHours}h`;
      if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d`;
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'unknown';
    }
  };

  const getPostTypeColor = (type: string) => {
    switch (type) {
      case 'case_study': return 'bg-green-100 text-green-800';
      case 'tool_review': return 'bg-blue-100 text-blue-800';
      case 'question': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPostTypeLabel = (type: string) => {
    switch (type) {
      case 'case_study': return 'Case Study';
      case 'tool_review': return 'Tool Review';
      case 'question': return 'Question';
      default: return 'Discussion';
    }
  };

  const upvotes = (post as any).upvotes ?? (post.votes?.filter(v => v.value === 1).length || 0);
  const downvotes = (post as any).downvotes ?? (post.votes?.filter(v => v.value === -1).length || 0);
  const netScore = upvotes - downvotes;

  return (
    <div className="bg-white hover:bg-gray-50 border border-gray-200 rounded-md mb-2 overflow-hidden transition-colors shadow-sm">
      <div className="flex">
        {/* Voting Section */}
        <div className="flex flex-col items-center py-2 px-2 bg-gray-50 w-12">
          <button
            onClick={() => handleVote('upvote')}
            disabled={isVoting}
            className={`p-1 rounded-md hover:bg-gray-200 transition-colors ${
              post.userVote === 'upvote' ? 'text-orange-500' : 'text-gray-600 hover:text-orange-400'
            }`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <span className={`text-xs font-bold py-1 ${
            netScore > 0 ? 'text-orange-500' : netScore < 0 ? 'text-blue-500' : 'text-gray-600'
          }`}>
            {netScore > 1000 ? `${(netScore/1000).toFixed(1)}k` : netScore}
          </span>
          <button
            onClick={() => handleVote('downvote')}
            disabled={isVoting}
            className={`p-1 rounded-md hover:bg-gray-200 transition-colors ${
              post.userVote === 'downvote' ? 'text-blue-500' : 'text-gray-600 hover:text-blue-400'
            }`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Content Section */}
        <div className="flex-1 p-3 md:p-4 min-w-0">
          {/* Header - Reddit Style */}
          <div className="flex items-center space-x-2 text-xs text-gray-600 mb-2">
            <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">r</span>
            </div>
            {post.community ? (
              <Link 
                to={`/community/${post.community.id || post.communityId}`}
                className="font-semibold hover:underline text-white text-sm"
              >
                o/{post.community.name || 'Unknown'}
              </Link>
            ) : (
              <span className="font-semibold text-white text-sm">o/Unknown</span>
            )}
            <span>•</span>
            <span>Posted by</span>
            {post.author ? (
              <Link to={`/user/${post.author.username || 'unknown'}`} className="hover:underline text-gray-700">
                u/{post.author.username || 'unknown'}
              </Link>
            ) : (
              <span className="text-gray-700">u/unknown</span>
            )}
            <span>•</span>
            <span>{formatDate(post.createdAt)}</span>
            {post.type && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${getPostTypeColor(post.type)}`}>
                {getPostTypeLabel(post.type)}
              </span>
            )}
          </div>

          {/* Title - Larger and more prominent */}
          <Link to={`/post/${post.id}`} className="block mb-2 md:mb-3">
            <h2 className="text-lg md:text-xl font-semibold text-white hover:text-blue-400 transition-colors leading-tight">
              {post.title}
            </h2>
          </Link>

          {/* Content Preview */}
          {post.content && (
            <div className="text-sm text-gray-800 mb-3 md:mb-4 leading-relaxed">
              {post.content.length > 200 ? `${post.content.substring(0, 200)}...` : post.content}
            </div>
          )}

          {/* Tags */}
          {post.tags && Array.isArray(post.tags) && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {post.tags
                .filter((postTag) => postTag && postTag.tag && postTag.tag.name) // Filter out invalid tags
                .map((postTag) => (
                  <span
                    key={postTag.id || `tag-${postTag.tag.id}`}
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={
                      postTag.tag.color && /^#[0-9A-Fa-f]{6}$/.test(postTag.tag.color)
                        ? { backgroundColor: postTag.tag.color, color: 'white' }
                        : { backgroundColor: '#E5E7EB', color: '#374151' }
                    }
                  >
                    {postTag.tag.name}
                  </span>
                ))}
            </div>
          )}

          {/* Actions Bar - Reddit Style */}
          <div className="flex items-center space-x-4 text-xs">
            <Link 
              to={`/post/${post.id}`}
              className="flex items-center space-x-1 text-gray-600 hover:text-blue-700 hover:bg-gray-100 px-2 py-1 rounded-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>{post._count?.comments ?? 0} Comments</span>
            </Link>
            <ShareButton
              url={`/post/${post.id}`}
              title={post.title}
              type="post"
            />
            <button className="flex items-center space-x-1 text-gray-600 hover:text-blue-700 hover:bg-gray-100 px-2 py-1 rounded-md transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <span>Save</span>
            </button>
            {post.community && (post.community.id || post.communityId) && (
              <ModerationMenu
                postId={post.id}
                communityId={post.community.id || post.communityId}
                isLocked={post.isLocked}
                isPinned={post.isPinned}
                onDelete={async () => {
                  try {
                    await apiService.deletePost(post.id);
                    queryClient.invalidateQueries({ queryKey: ['posts'] });
                    toast.success('Post deleted');
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to delete post');
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostCard;
