import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiService, Post } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import VoteButton from '../components/VoteButton';
import PostAttachments from '../components/PostAttachments';
import PostPollBlock from '../components/PostPollBlock';
import ShareButton from '../components/ShareButton';
import VerifiedPhysicianInline from '../components/VerifiedPhysicianInline';

// PostCard component for displaying individual posts
const PostCard: React.FC<{ post: Post }> = ({ post }) => {
  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    
    if (diffInMinutes < 1) return 'now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInHours < 24) return `${diffInHours}h`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-white border border-gray-200 hover:border-gray-300 transition-colors">
      {/* Content Section */}
      <div className="p-3">
        {/* Post Header */}
        <div className="flex items-center space-x-1 text-xs text-gray-500 mb-1">
          <Link 
            to={`/community/${post.community.slug}`}
            className="font-medium text-gray-900 hover:underline flex items-center space-x-1"
          >
            {post.community.profileImage ? (
              <img 
                src={post.community.profileImage} 
                alt={post.community.name}
                className="w-4 h-4 rounded-full object-cover"
              />
            ) : (
              <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">o</span>
              </div>
            )}
            <span>o/{post.community.name}</span>
          </Link>
          <span>•</span>
          <span className="inline-flex items-center flex-wrap gap-x-0">
            Posted by u/{post.author.username}
            {post.author.isVerifiedPhysician && <VerifiedPhysicianInline />}
          </span>
          <span>•</span>
          <span>{formatTimeAgo(new Date(post.createdAt))}</span>
        </div>

        {/* Post Title and Content */}
        <Link to={`/post/${post.id}`} className="block">
          <h3 className="text-lg font-medium text-gray-900 mb-2 hover:text-blue-600 transition-colors leading-tight">
            {post.title}
          </h3>
          {post.type === 'link' && post.linkUrl && (
            <p className="text-sm text-blue-600 mb-2 line-clamp-1 break-all">
              {(() => {
                try {
                  return new URL(post.linkUrl).hostname.replace(/^www\./, '');
                } catch {
                  return post.linkUrl;
                }
              })()}
            </p>
          )}
          {post.content ? (
            <p className="text-gray-800 text-sm leading-relaxed mb-3 line-clamp-3">
              {post.content}
            </p>
          ) : null}
        </Link>

        {post.type === 'poll' && Array.isArray(post.pollOptions) && (
          <PostPollBlock
            postId={post.id}
            pollOptions={post.pollOptions}
            pollEndsAt={post.pollEndsAt}
            pollVoteCounts={post.pollVoteCounts}
            userPollVoteIndex={post.userPollVoteIndex}
            pollClosed={post.pollClosed}
            compact
          />
        )}

        {/* Attachments Preview - Reddit Style */}
        <PostAttachments attachments={post.attachments ?? []} postId={post.id} />

        {/* Action Bar with Voting - Reddit Style */}
        <div className="flex items-center space-x-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
          {/* Voting Section - Using VoteButton Component */}
          <VoteButton
            postId={post.id}
            initialVoteScore={post.voteScore || 0}
            initialUserVote={post.userVote || null}
            size="sm"
          />

          {/* Comments */}
          <Link 
            to={`/post/${post.id}`}
            className="flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{post._count?.comments || 0}</span>
          </Link>

          {/* Awards */}
          <button className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </button>

          {/* Share */}
          <ShareButton
            url={`/post/${post.id}`}
            title={post.title}
            type="post"
          />
        </div>
      </div>
    </div>
  );
};

const Home: React.FC = () => {
  const { user } = useAuth();

  // Home should be a global feed across all communities.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['posts', 'home'],
    queryFn: () => apiService.getPosts({ limit: 20, sort: 'newest' }),
    staleTime: 30 * 1000, // 30 seconds - shorter cache for vote freshness
    refetchOnWindowFocus: true, // Refetch when user switches back to tab
  });

  // If global feed fetch fails for any reason, logged-in users can still see their feed.
  const { data: feedFallbackData, isLoading: feedFallbackLoading } = useQuery({
    queryKey: ['feed', 'home', 'fallback'],
    queryFn: () => apiService.getFeed({ limit: 20, sort: 'newest' }),
    enabled: !!user && isError,
    staleTime: 30 * 1000,
  });

  const posts = data?.posts?.length
    ? data.posts
    : (feedFallbackData?.posts || []);

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4">
      {/* Posts Feed */}
      <div className="space-y-2 p-2 sm:p-4">
        {(isLoading || feedFallbackLoading) ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading posts...</span>
          </div>
        ) : isError && posts.length === 0 ? (
          <div className="bg-white border border-red-200 p-6 text-center">
            <p className="text-red-600 font-medium">Could not load posts</p>
            <p className="text-sm text-gray-500 mt-2">
              {error instanceof Error ? error.message : 'Please refresh and try again.'}
            </p>
          </div>
        ) : posts.length > 0 ? (
          posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))
        ) : (
          <div className="bg-white border border-gray-200 p-6 text-center">
            <p className="text-gray-500">No posts available yet</p>
            <p className="text-sm text-gray-400 mt-2">Be the first to share something with the community!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;