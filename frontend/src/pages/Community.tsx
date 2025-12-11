import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiService, Post, Community } from '../services/apiService';
import VoteButton from '../components/VoteButton';
import ShareButton from '../components/ShareButton';
import { useAuth } from '../contexts/AuthContext';
import PostAttachments from '../components/PostAttachments';

const CommunityPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'popular' | 'controversial'>('newest');

  // Fetch community details
  const { data: communityData, isLoading: communityLoading } = useQuery<Community>({
    queryKey: ['community', slug],
    queryFn: () => apiService.getCommunity(slug!),
    enabled: !!slug,
  });

  // Fetch posts for this community
  const { data: postsData, isLoading: postsLoading } = useQuery<Post[]>({
    queryKey: ['posts', 'community', slug, sortBy],
    queryFn: () => apiService.getPosts({ community: slug!, sort: sortBy }).then((res) => res.posts),
    enabled: !!slug,
  });


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'now';
    if (diffInHours < 24) return `${diffInHours} hr. ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays} days ago`;
    return date.toLocaleDateString();
  };


  if (communityLoading || postsLoading) {
    return (
      <div className="max-w-6xl mx-auto px-3 sm:px-4">
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading community...</span>
        </div>
      </div>
    );
  }

  const community = communityData;
  const posts = postsData || [];

  if (!community) {
    return (
      <div className="max-w-6xl mx-auto px-3 sm:px-4">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Community not found</h1>
          <p className="text-gray-600 mb-4">The community "o/{slug}" doesn't exist.</p>
          <Link to="/" className="text-blue-600 hover:text-blue-800">
            Go back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4">
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Main Content */}
        <div className="flex-1">
          {/* Community Header */}
          <div className="bg-white border border-gray-200 rounded-md mb-4">
            {/* Banner */}
            <div className="h-32 relative">
              {community.bannerImage ? (
                <img 
                  src={community.bannerImage} 
                  alt={`${community.name} banner`}
                  className="w-full h-32 object-cover"
                />
              ) : (
                <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600"></div>
              )}
              <div className="absolute bottom-0 left-6 transform translate-y-1/2">
                <div className="w-20 h-20 bg-white rounded-full border-4 border-white flex items-center justify-center">
                  {community.profileImage ? (
                    <img 
                      src={community.profileImage} 
                      alt={community.name}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-xl">o/</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Community Info */}
            <div className="pt-12 pb-4 px-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">o/{community.name}</h1>
                  <p className="text-gray-600">{community.description}</p>
                </div>
                <div className="flex items-center space-x-3">
                  <Link 
                    to="/create-post" 
                    className="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors font-medium"
                  >
                    + Create Post
                  </Link>
                  <button className="px-4 py-2 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM4.5 19.5a2.5 2.5 0 01-2.5-2.5V6a2.5 2.5 0 012.5-2.5h15A2.5 2.5 0 0122 6v11a2.5 2.5 0 01-2.5 2.5h-15z" />
                    </svg>
                  </button>
                  {/* Settings button for community owners/moderators/admins */}
                  {user && (community.ownerId === user.id || community.moderators?.some(mod => mod.userId === user.id) || user.isAdmin) && (
                    <Link 
                      to={`/community/${community.slug}/settings`}
                      className="px-4 py-2 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
                      title="Community Settings"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </Link>
                  )}
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors font-medium">
                    Joined
                  </button>
                </div>
              </div>
            </div>

            {/* Feed Controls */}
            <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="newest">New</option>
                  <option value="oldest">Oldest</option>
                  <option value="popular">Popular</option>
                  <option value="controversial">Controversial</option>
                </select>
                <div className="flex items-center space-x-1">
                  <button className="p-1 hover:bg-gray-100 rounded">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>
                  <button className="p-1 hover:bg-gray-100 rounded">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Posts Feed */}
          <div className="space-y-4">
            {posts.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-md p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No posts yet</h3>
                <p className="text-gray-600 mb-4">Be the first to share something in o/{community.name}!</p>
                <Link 
                  to="/create-post" 
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Post
                </Link>
              </div>
            ) : (
              posts.map((post) => (
                <div key={post.id} className="bg-white border border-gray-200 rounded-md overflow-hidden">
                  {/* Post Header */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">o/</span>
                      </div>
                      <span>o/{community.name}</span>
                      <span>•</span>
                      <span>Posted by u/{post.author?.username || 'Unknown'}</span>
                      <span>•</span>
                      <span>{formatDate(post.createdAt)}</span>
                    </div>
                  </div>

                  {/* Post Content */}
                  <div className="px-4 py-4">
                    <h2 className="text-xl font-semibold text-gray-900 mb-3 hover:text-blue-600 cursor-pointer">
                      <Link to={`/post/${post.id}`}>{post.title}</Link>
                    </h2>
                    {post.content && (
                      <div className="text-gray-700 mb-4">
                        {post.content.length > 300 ? (
                          <>
                            {post.content.substring(0, 300)}...
                            <Link to={`/post/${post.id}`} className="text-blue-600 hover:text-blue-800 ml-1">
                              read more
                            </Link>
                          </>
                        ) : (
                          post.content
                        )}
                      </div>
                    )}
                    
                    {/* Attachments Preview - Reddit Style */}
                    <PostAttachments attachments={post.attachments} />
                  </div>

                  {/* Post Actions */}
                  <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 flex items-center flex-wrap gap-3 sm:gap-4 lg:gap-6 text-xs sm:text-sm">
                    <VoteButton
                      postId={post.id}
                      initialVoteScore={post.voteScore || 0}
                      initialUserVote={post.userVote || null}
                      size="md"
                    />
                    <button className="flex items-center space-x-1 text-gray-500 hover:text-gray-700">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span className="hidden sm:inline">{post.commentsCount || post._count?.comments || 0} comments</span>
                      <span className="sm:hidden">{post.commentsCount || post._count?.comments || 0}</span>
                    </button>
                    <ShareButton
                      url={`/post/${post.id}`}
                      title={post.title}
                      type="post"
                    />
                    <button className="flex items-center space-x-1 text-gray-500 hover:text-gray-700">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                      <span className="hidden sm:inline">Save</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-full lg:w-80 flex-shrink-0">
          {/* Community Info */}
          <div className="bg-white border border-gray-200 rounded-md p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3">{community.description}</h3>
            <div className="space-y-2 text-sm text-gray-500 mb-4">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Created {new Date(community.createdAt || '').toLocaleDateString()}</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Public</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Members</span>
                <span className="font-medium">{community.memberCount ? community.memberCount.toLocaleString() : '0'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Posts</span>
                <span className="font-medium">{community.postCount ? community.postCount.toLocaleString() : '0'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Weekly Visitors</span>
                <span className="font-medium text-blue-600">{community.weeklyVisitors ? community.weeklyVisitors.toLocaleString() : '0'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Weekly Contributions</span>
                <span className="font-medium text-green-600">{community.weeklyContributions ? community.weeklyContributions.toLocaleString() : '0'}</span>
              </div>
            </div>
          </div>

          {/* Community Rules */}
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <h3 className="font-semibold text-gray-900 mb-3">o/{community.name} RULES</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-700">1. Be respectful</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">2. Stay on topic</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">3. No spam</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityPage;
