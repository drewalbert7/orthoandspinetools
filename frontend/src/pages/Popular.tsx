import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiService, Post } from '../services/apiService';
import VoteButton from '../components/VoteButton';
import PostAttachments from '../components/PostAttachments';

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
          <span>Posted by u/{post.author.username}</span>
          <span>•</span>
          <span>{formatTimeAgo(new Date(post.createdAt))}</span>
        </div>

        {/* Post Title and Content */}
        <Link to={`/post/${post.id}`} className="block">
          <h3 className="text-lg font-medium text-gray-900 mb-2 hover:text-blue-600 transition-colors leading-tight">
            {post.title}
          </h3>
          <p className="text-gray-800 text-sm leading-relaxed mb-3 line-clamp-3">
            {post.content}
          </p>
        </Link>

        {/* Attachments Preview - Reddit Style */}
        <PostAttachments attachments={post.attachments} />

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
          <button className="flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.632-2.684 3 3 0 00-5.632 2.684zm0 9.316a3 3 0 105.632 2.684 3 3 0 00-5.632-2.684z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">Share</span>
          </button>
        </div>
      </div>
    </div>
  );
};

type SortOption = 'best' | 'hot' | 'newest' | 'top' | 'rising';

const Popular: React.FC = () => {
  const [sortBy, setSortBy] = useState<SortOption>('best');
  const [selectedCommunity, setSelectedCommunity] = useState<string>('all');

  // Fetch all communities for the filter dropdown
  const { data: communities } = useQuery({
    queryKey: ['communities'],
    queryFn: () => apiService.getCommunities(),
  });

  // Fetch posts based on sort and community filter
  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['popular-posts', sortBy, selectedCommunity],
    queryFn: () => {
      const params: any = { 
        limit: 25, 
        sort: sortBy 
      };
      
      if (selectedCommunity !== 'all') {
        params.community = selectedCommunity;
      }
      
      return apiService.getPosts(params);
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  const posts = postsData?.posts || [];

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'best', label: 'Best' },
    { value: 'hot', label: 'Hot' },
    { value: 'newest', label: 'New' },
    { value: 'top', label: 'Top' },
    { value: 'rising', label: 'Rising' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header with Sort Options */}
      <div className="bg-white border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Popular</h1>
          
          {/* Sort Dropdown */}
          <div className="flex items-center space-x-4">
            {/* Community Filter */}
            <div className="relative">
              <select
                value={selectedCommunity}
                onChange={(e) => setSelectedCommunity(e.target.value)}
                className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Communities</option>
                {communities?.map((community) => (
                  <option key={community.id} value={community.id}>
                    {community.name}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Posts Feed */}
      <div className="space-y-2 p-4">
        {postsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading posts...</span>
          </div>
        ) : posts.length > 0 ? (
          posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))
        ) : (
          <div className="bg-white border border-gray-200 p-6 text-center">
            <p className="text-gray-500">No posts available</p>
            <p className="text-sm text-gray-400 mt-2">
              {selectedCommunity !== 'all' 
                ? 'No posts in this community yet'
                : 'No posts available yet'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Popular;
