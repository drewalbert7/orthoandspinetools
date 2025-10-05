import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, Comment } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';

const PostDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [commentSort, setCommentSort] = useState('best');
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Fetch post details
  const { data: post, isLoading: postLoading, error: postError } = useQuery({
    queryKey: ['post', id],
    queryFn: () => apiService.getPost(id!),
    enabled: !!id,
  });

  // Fetch comments
  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ['comments', id],
    queryFn: () => apiService.getComments(id!),
    enabled: !!id,
  });

  // Fetch community data for sidebar
  const { data: communityData, isLoading: communityLoading } = useQuery({
    queryKey: ['community', post?.community?.id],
    queryFn: () => apiService.getCommunity(post!.community.id),
    enabled: !!post?.community?.id,
  });

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: ({ postId, voteType }: { postId: string; voteType: 'upvote' | 'downvote' }) =>
      apiService.votePost(postId, voteType === 'upvote' ? 1 : -1),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: ({ content, parentId }: { content: string; parentId?: string }) =>
      apiService.createComment(id!, content, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
      setNewComment('');
    },
  });

  // Vote comment mutation
  const voteCommentMutation = useMutation({
    mutationFn: ({ commentId, voteType }: { commentId: string; voteType: 'upvote' | 'downvote' }) =>
      apiService.voteComment(commentId, voteType === 'upvote' ? 1 : -1),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
    },
  });

  const handleVote = (voteType: 'upvote' | 'downvote') => {
    if (!user) {
      navigate('/login');
      return;
    }
    voteMutation.mutate({ postId: id!, voteType });
  };

  const handleCommentVote = (commentId: string, voteType: 'upvote' | 'downvote') => {
    if (!user) {
      navigate('/login');
      return;
    }
    voteCommentMutation.mutate({ commentId, voteType });
  };

  const handleSubmitComment = () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!newComment.trim()) return;
    
    createCommentMutation.mutate({ content: newComment.trim() });
  };

  const handleSubmitReply = (parentId: string) => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!replyContent.trim()) return;
    
    createCommentMutation.mutate({ content: replyContent.trim(), parentId });
    setReplyContent('');
    setReplyingTo(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'now';
    if (diffInHours < 24) return `${diffInHours}h`;
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d`;
    return date.toLocaleDateString();
  };

  const renderComment = (comment: Comment, depth = 0) => {
    const upvotes = comment.upvotes ?? (comment.votes?.filter(v => v.type === 'upvote').length || 0);
    const downvotes = comment.downvotes ?? (comment.votes?.filter(v => v.type === 'downvote').length || 0);
    const netScore = upvotes - downvotes;

    // Generate a colorful avatar based on username
    const getAvatarColor = (username: string) => {
      const colors = [
        'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 
        'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'
      ];
      const index = username.charCodeAt(0) % colors.length;
      return colors[index];
    };

    return (
      <div key={comment.id} className={`${depth > 0 ? 'ml-6 border-l-2 border-gray-200 pl-4' : ''}`}>
        <div className="mb-4">
          {/* Comment Header */}
          <div className="flex items-center space-x-2 text-xs text-gray-500 mb-1">
            <div className={`w-6 h-6 ${getAvatarColor(comment.author.username)} rounded-full flex items-center justify-center`}>
              <span className="text-white text-xs font-bold">
                {comment.author.username.charAt(0).toUpperCase()}
              </span>
            </div>
            <Link to={`/user/${comment.author.username}`} className="hover:underline text-gray-700 font-medium">
              {comment.author.username}
            </Link>
            <span>{formatDate(comment.createdAt)}</span>
          </div>

          {/* Comment Content */}
          <div className="text-gray-800 leading-relaxed mb-2">
            {comment.content}
          </div>

          {/* Comment Actions */}
          <div className="flex items-center space-x-4 text-xs">
            {/* Voting Section */}
            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
              <button
                onClick={() => handleCommentVote(comment.id, 'upvote')}
                className={`p-1 rounded-md hover:bg-gray-200 transition-colors ${
                  comment.userVote === 'upvote' ? 'text-orange-500' : 'text-gray-600 hover:text-orange-400'
                }`}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </button>
              <span className={`text-xs font-bold px-1 ${
                netScore > 0 ? 'text-orange-500' : netScore < 0 ? 'text-blue-500' : 'text-gray-600'
              }`}>
                {netScore > 1000 ? `${(netScore/1000).toFixed(1)}k` : netScore}
              </span>
              <button
                onClick={() => handleCommentVote(comment.id, 'downvote')}
                className={`p-1 rounded-md hover:bg-gray-200 transition-colors ${
                  comment.userVote === 'downvote' ? 'text-blue-500' : 'text-gray-600 hover:text-blue-400'
                }`}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Reply Button */}
            <button
              onClick={() => setReplyingTo(comment.id)}
              className="flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Reply</span>
            </button>

            {/* Award Button */}
            <button className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </button>

            {/* Share Button */}
            <button className="flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.632-2.684 3 3 0 00-5.632 2.684zm0 9.316a3 3 0 105.632 2.684 3 3 0 00-5.632-2.684z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Share</span>
            </button>
          </div>
        </div>

        {/* Reply Form */}
        {replyingTo === comment.id && (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-2 ml-12">
            <div className="mb-3">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="What are your thoughts?"
                className="w-full p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleSubmitReply(comment.id)}
                disabled={!replyContent.trim() || createCommentMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createCommentMutation.isPending ? 'Posting...' : 'Reply'}
              </button>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setReplyContent('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Nested Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2">
            {comment.replies.map((reply) => renderComment(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (postLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded mb-4"></div>
        </div>
      </div>
    );
  }

  if (postError || !post) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Post not found</h1>
          <p className="text-gray-600 mb-4">The post you're looking for doesn't exist or has been removed.</p>
          <Link to="/" className="text-blue-600 hover:text-blue-800">
            Go back to home
          </Link>
        </div>
      </div>
    );
  }

  const upvotes = post.upvotes ?? (post.votes?.filter(v => v.type === 'upvote').length || 0);
  const downvotes = post.downvotes ?? (post.votes?.filter(v => v.type === 'downvote').length || 0);
  const netScore = upvotes - downvotes;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex gap-6">
        {/* Main Content */}
        <div className="flex-1">

          {/* Main Post */}
          <div className="bg-white border border-gray-200 rounded-md mb-4 overflow-hidden">
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  {/* Back Button */}
                  <button
                    onClick={() => navigate(-1)}
                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {/* User Avatar */}
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">o</span>
                  </div>

                  {/* Community, Username, and Timestamp */}
                  <div className="flex flex-col">
                    <div className="flex items-center space-x-2 text-sm">
                      <Link 
                        to={`/community/${post.community.id}`}
                        className="font-semibold hover:underline text-gray-900"
                      >
                        o/{post.community.name}
                      </Link>
                      <span className="text-gray-500">•</span>
                      <span className="text-gray-500">{formatDate(post.createdAt)}</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      <Link to={`/user/${post.author.username}`} className="hover:underline text-gray-700">
                        {post.author.username}
                      </Link>
                    </div>
                  </div>
                </div>

                {/* More Options Menu */}
                <div className="relative">
                  <button 
                    onClick={() => setShowMoreOptions(!showMoreOptions)}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                  
                  {/* Dropdown Menu */}
                  {showMoreOptions && (
                    <div className="absolute right-0 top-10 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                      <div className="py-1">
                        <button className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600">
                          <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 00-15 0v5h5l-5 5-5-5h5v-5a7.5 7.5 0 0115 0v5z" />
                          </svg>
                          Follow post
                        </button>
                        <div className="border-t border-gray-100"></div>
                        <button className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                          Save
                        </button>
                        <button className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                          Hide
                        </button>
                        <button className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                          </svg>
                          Report
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Title */}
              <h1 className="text-2xl font-bold text-gray-900 mb-4 leading-tight">
                {post.title}
              </h1>

              {/* Content */}
              {post.content && (
                <div className="text-gray-800 leading-relaxed mb-6 whitespace-pre-wrap">
                  {post.content}
                </div>
              )}

            {/* Actions */}
            <div className="flex items-center space-x-4 text-sm">
              {/* Voting Section */}
              <div className="flex items-center bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                <button
                  onClick={() => handleVote('upvote')}
                  disabled={voteMutation.isPending}
                  className={`p-1 rounded-md hover:bg-gray-200 transition-colors ${
                    post.userVote === 'upvote' ? 'text-orange-500' : 'text-gray-600 hover:text-orange-400'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                <span className={`text-sm font-bold px-2 ${
                  netScore > 0 ? 'text-orange-500' : netScore < 0 ? 'text-blue-500' : 'text-gray-600'
                }`}>
                  {netScore > 1000 ? `${(netScore/1000).toFixed(1)}k` : netScore}
                </span>
                <button
                  onClick={() => handleVote('downvote')}
                  disabled={voteMutation.isPending}
                  className={`p-1 rounded-md hover:bg-gray-200 transition-colors ${
                    post.userVote === 'downvote' ? 'text-blue-500' : 'text-gray-600 hover:text-blue-400'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Comments */}
              <button className="flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-sm font-medium text-gray-700">{post._count?.comments ?? 0}</span>
              </button>

              {/* Awards */}
              <button className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </button>

              {/* Share */}
              <button className="flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.632-2.684 3 3 0 00-5.632 2.684zm0 9.316a3 3 0 105.632 2.684 3 3 0 00-5.632-2.684z" />
                </svg>
                <span className="text-sm font-medium text-gray-700">Share</span>
              </button>
            </div>
            </div>
          </div>

          {/* Comment Input */}
          {user && (
            <div className="bg-white border border-gray-200 rounded-md p-4 mb-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Share your thoughts"
                    className="w-full p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end mt-3">
                <button
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || createCommentMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {createCommentMutation.isPending ? 'Posting...' : 'Comment'}
                </button>
              </div>
            </div>
          )}

          {/* Comments Section */}
          <div className="space-y-4">
            {/* Sort and Search */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">
                  {post._count?.comments ?? 0} Comments
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Sort by:</span>
                  <select
                    value={commentSort}
                    onChange={(e) => setCommentSort(e.target.value)}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="best">Best</option>
                    <option value="top">Top</option>
                    <option value="new">New</option>
                    <option value="old">Old</option>
                    <option value="controversial">Controversial</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-sm text-gray-600">Search Comments</span>
              </div>
            </div>
            
            {commentsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-white border border-gray-200 rounded-md p-4">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : comments && comments.length > 0 ? (
              <div className="space-y-2">
                {comments.map((comment) => renderComment(comment))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p>No comments yet. Be the first to share your thoughts!</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-80 space-y-4">
          {/* Community Info */}
          <div className="bg-white border border-gray-200 rounded-md p-4">
            {communityLoading ? (
              <div className="animate-pulse">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                  <div className="h-8 bg-gray-200 rounded w-16"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                  <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                </div>
                <div className="mt-4 space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex justify-between">
                      <div className="h-3 bg-gray-200 rounded w-16"></div>
                      <div className="h-3 bg-gray-200 rounded w-12"></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-2 mb-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-bold">o</span>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">o/{post.community.name}</h2>
              </div>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                Joined
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              {communityData?.description || `A community for ${post.community.name.toLowerCase()} professionals to share tools, discuss cases, and network.`}
            </p>
            <div className="space-y-2 text-sm text-gray-500">
              <div className="flex justify-between">
                <span>Created</span>
                <span>{communityData?.createdAt ? new Date(communityData.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Nov 28, 2024'}</span>
              </div>
              <div className="flex justify-between">
                <span>Type</span>
                <span className="text-green-600">Public</span>
              </div>
              <div className="flex justify-between">
                <span>Members</span>
                <span>{communityData?.memberCount ? communityData.memberCount.toLocaleString() : '0'}</span>
              </div>
              <div className="flex justify-between">
                <span>Posts</span>
                <span>{communityData?.postCount ? communityData.postCount.toLocaleString() : '0'}</span>
              </div>
              <div className="flex justify-between">
                <span>Weekly visitors</span>
                <span>{communityData?.weeklyVisitors ? communityData.weeklyVisitors.toLocaleString() : '0'}</span>
              </div>
              <div className="flex justify-between">
                <span>Weekly contributions</span>
                <span>{communityData?.weeklyContributions ? communityData.weeklyContributions.toLocaleString() : '0'}</span>
              </div>
            </div>
              </>
            )}
          </div>

          {/* User Flair */}
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">USER FLAIR</h3>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
                <span className="text-gray-600 text-xs font-bold">?</span>
              </div>
              <span className="text-sm text-gray-600">{user?.username || 'Anonymous'}</span>
            </div>
          </div>

          {/* Community Rules */}
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">o/{post.community.name.toUpperCase()} RULES</h3>
            <div className="space-y-2">
              {[
                'Relevance',
                'Professional conduct',
                'No spam or self-promotion',
                'Respect patient privacy',
                'Evidence-based discussions',
                'Be courteous and positive'
              ].map((rule, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{index + 1}. {rule}</span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          {/* Moderators */}
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">MODERATORS</h3>
              <button className="text-xs text-blue-600 hover:text-blue-800">Message Mods</button>
            </div>
            <div className="space-y-2">
              {[
                'admin',
                'moderator1',
                'moderator2',
                'AutoModerator'
              ].map((mod, index) => (
                <div key={index} className="flex items-center space-x-2 text-sm">
                  <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">m</span>
                  </div>
                  <span className="text-gray-600">u/{mod}</span>
                  {index === 0 && <span className="text-xs text-green-600">Verified</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostDetail;