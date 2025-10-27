import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, UserProfile } from '../services/apiService';
import PostAttachments from '../components/PostAttachments';

type TabType = 'overview' | 'posts' | 'comments' | 'saved' | 'history' | 'upvoted' | 'downvoted';

const Profile: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Fetch user profile data
  const { data: profileData, isLoading, error } = useQuery<UserProfile>({
    queryKey: ['user-profile', user?.id],
    queryFn: () => apiService.getUserProfile(),
    enabled: !!user,
  });

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: ({ postId, value }: { postId: string; value: 1 | -1 }) => 
      apiService.votePost(postId, value),
    onSuccess: () => {
      // Invalidate and refetch profile data
      queryClient.invalidateQueries({ queryKey: ['user-profile', user?.id] });
    },
  });

  const handleVote = (postId: string, value: 1 | -1) => {
    if (!user) {
      return;
    }
    voteMutation.mutate({ postId, value });
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Please sign in to view your profile</h1>
          <Link to="/login" className="text-blue-600 hover:text-blue-800">
            Sign in here
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error loading profile</h1>
          <p className="text-gray-600 mb-4">{(error as Error).message}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="text-blue-600 hover:text-blue-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">No profile data found</h1>
        </div>
      </div>
    );
  }

  const { user: profileUser, stats, posts, communities } = profileData;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInYears = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365));
    return `${diffInYears} yr. ago`;
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex gap-6">
        {/* Main Content */}
        <div className="flex-1">
              {/* User Header */}
              <div className="bg-white border border-gray-200 rounded-md p-6 mb-4">
            <div className="flex items-start space-x-4">
              <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center relative border-4 border-orange-400">
                <div className="w-16 h-16 bg-yellow-300 rounded-full flex items-center justify-center">
                  <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                      <div className="w-4 h-4 bg-black rounded-full"></div>
                    </div>
                  </div>
                </div>
                {/* Stars decoration */}
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 transform rotate-45"></div>
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-yellow-400 transform rotate-45"></div>
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900">
                  {profileUser.firstName} {profileUser.lastName}
                </h1>
                <p className="text-gray-600">u/{profileUser.username}</p>
                {profileUser.specialty && (
                  <p className="text-sm text-gray-500 mt-1">
                    {profileUser.specialty}
                  </p>
                )}
                {profileUser.bio && (
                  <p className="text-gray-700 mt-3">{profileUser.bio}</p>
                )}
                <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
                  <span>Joined {formatDate(profileUser.createdAt)} ago</span>
                  {profileUser.institution && <span>• {profileUser.institution}</span>}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center space-x-6 mt-4 pt-4 border-t border-gray-200">
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900">{stats.totalKarma}</div>
                <div className="text-sm text-gray-500">Total Karma</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900">{stats.postKarma}</div>
                <div className="text-sm text-gray-500">Post Karma</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900">{stats.commentKarma}</div>
                <div className="text-sm text-gray-500">Comment Karma</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900">{stats.postsCount + stats.commentsCount}</div>
                <div className="text-sm text-gray-500">Contributions</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900">{formatDate(profileUser.createdAt)}</div>
                <div className="text-sm text-gray-500">Reddit Age</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900">{stats.communitiesCount}</div>
                <div className="text-sm text-gray-500">Active in</div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="bg-white border border-gray-200 rounded-md mb-4">
            <div className="flex border-b border-gray-200">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'posts', label: 'Posts' },
                { id: 'comments', label: 'Comments' },
                { id: 'saved', label: 'Saved' },
                { id: 'history', label: 'History' },
                { id: 'upvoted', label: 'Upvoted' },
                { id: 'downvoted', label: 'Downvoted' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`px-6 py-3 text-sm font-medium ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Filter */}
            <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>Showing all content</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div className="flex items-center space-x-2">
                <Link to="/create-post" className="flex items-center space-x-1 px-3 py-1 bg-blue-600 text-white rounded-md text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Create Post</span>
                </Link>
                <button className="px-3 py-1 text-gray-600 border border-gray-300 rounded-md text-sm">New</button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {posts.length > 0 ? (
                    posts.map((post) => (
                      <div key={post.id} className="border border-gray-200 rounded-md p-4">
                        <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                          <span>{profileUser.username} posted in o/{post.community?.name}</span>
                          <span>•</span>
                          <span>{formatDate(post.createdAt)}</span>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {post.title}
                        </h3>
                        {post.content && (
                          <p className="text-gray-700 mb-3">{post.content}</p>
                        )}
                        <PostAttachments attachments={post.attachments} />
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <button 
                              onClick={() => handleVote(post.id, 1)}
                              disabled={voteMutation.isPending}
                              className={`p-1 hover:bg-gray-200 rounded ${
                                post.userVote === 'upvote' ? 'text-orange-500' : 'text-gray-500'
                              } ${voteMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <svg className="w-4 h-4" fill={post.userVote === 'upvote' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <span className="text-gray-700 font-medium">{post.voteScore || 0}</span>
                            <button 
                              onClick={() => handleVote(post.id, -1)}
                              disabled={voteMutation.isPending}
                              className={`p-1 hover:bg-gray-200 rounded ${
                                post.userVote === 'downvote' ? 'text-blue-500' : 'text-gray-500'
                              } ${voteMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <svg className="w-4 h-4" fill={post.userVote === 'downvote' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                          <span>{post.commentsCount || post._count?.comments || 0} comments</span>
                          <button className="text-blue-600 hover:text-blue-800">Share</button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No posts yet.</p>
                      <p className="text-sm mt-1">Your posts will appear here.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'posts' && (
                <div className="space-y-4">
                  {posts.length > 0 ? (
                    posts.map((post) => (
                      <div key={post.id} className="border border-gray-200 rounded-md p-4">
                        <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                          <span>Posted in o/{post.community?.name}</span>
                          <span>•</span>
                          <span>{formatDate(post.createdAt)}</span>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {post.title}
                        </h3>
                        {post.content && (
                          <p className="text-gray-700 mb-3">{post.content}</p>
                        )}
                        <PostAttachments attachments={post.attachments} />
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <button 
                              onClick={() => handleVote(post.id, 1)}
                              disabled={voteMutation.isPending}
                              className={`p-1 hover:bg-gray-200 rounded ${
                                post.userVote === 'upvote' ? 'text-orange-500' : 'text-gray-500'
                              } ${voteMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <svg className="w-4 h-4" fill={post.userVote === 'upvote' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <span className="text-gray-700 font-medium">{post.voteScore || 0}</span>
                            <button 
                              onClick={() => handleVote(post.id, -1)}
                              disabled={voteMutation.isPending}
                              className={`p-1 hover:bg-gray-200 rounded ${
                                post.userVote === 'downvote' ? 'text-blue-500' : 'text-gray-500'
                              } ${voteMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <svg className="w-4 h-4" fill={post.userVote === 'downvote' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                          <span>{post.commentsCount || post._count?.comments || 0} comments</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No posts yet.</p>
                      <p className="text-sm mt-1">Your posts will appear here.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'comments' && (
                <div className="text-center py-8 text-gray-500">
                  <p>No comments yet.</p>
                  <p className="text-sm mt-1">You haven't commented on anything.</p>
                </div>
              )}

              {activeTab === 'saved' && (
                <div className="text-center py-8 text-gray-500">
                  <p>No saved posts.</p>
                  <p className="text-sm mt-1">Posts you save will appear here.</p>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="text-center py-8 text-gray-500">
                  <p>No history.</p>
                  <p className="text-sm mt-1">Your browsing history will appear here.</p>
                </div>
              )}

              {activeTab === 'upvoted' && (
                <div className="text-center py-8 text-gray-500">
                  <p>No upvoted posts.</p>
                  <p className="text-sm mt-1">Posts you upvote will appear here.</p>
                </div>
              )}

              {activeTab === 'downvoted' && (
                <div className="text-center py-8 text-gray-500">
                  <p>No downvoted posts.</p>
                  <p className="text-sm mt-1">Posts you downvote will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-80">
          <div className="bg-white border border-gray-200 rounded-md p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">{profileUser.firstName} {profileUser.lastName}</h3>
              <button className="flex items-center space-x-1 text-gray-600 hover:text-gray-800">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                </svg>
                <span className="text-sm">Share</span>
              </button>
            </div>
            
            <div className="text-sm text-gray-500 mb-4">
              <p>0 followers</p>
            </div>

            {profileUser.bio && (
              <div className="text-sm text-gray-700 mb-4">
                <p>{profileUser.bio}</p>
              </div>
            )}

            <div className="space-y-2 text-sm text-gray-500 mb-4">
              <div className="flex justify-between">
                <span>{stats.totalKarma} Total Karma</span>
              </div>
              <div className="flex justify-between">
                <span>{stats.postKarma} Post Karma</span>
              </div>
              <div className="flex justify-between">
                <span>{stats.commentKarma} Comment Karma</span>
              </div>
              <div className="flex justify-between">
                <span>{stats.awardKarma} Award Karma</span>
              </div>
              <div className="flex justify-between">
                <span>{stats.postsCount + stats.commentsCount} Contributions</span>
              </div>
              <div className="flex justify-between">
                <span>{formatDate(profileUser.createdAt)} Reddit Age</span>
              </div>
              <div className="flex justify-between">
                <span>{stats.communitiesCount} Active in</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10m-10 0a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2M9 8h6m-6 4h6m-6 4h6" />
                </svg>
              </div>
            </div>

            <div className="text-sm text-gray-500 mb-4">
              <p>0 Gold earned</p>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="font-semibold text-gray-900 mb-2">ACHIEVEMENTS</h4>
              <div className="flex items-center space-x-2 mb-2">
                <div className="flex space-x-1">
                  <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
                  <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
                  <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
                </div>
                <span className="text-sm text-gray-600">Banana Enthusiast, Banana Beginner, Banana Baby, +9 more</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">12 unlocked</span>
                <button className="text-sm text-blue-600 hover:text-blue-800">View All</button>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 mt-4">
              <h4 className="font-semibold text-gray-900 mb-2">SETTINGS</h4>
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-6 h-6 bg-gray-300 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Profile</p>
                  <p className="text-xs text-gray-500">Customize your profile</p>
                </div>
              </div>
              <button className="w-full mt-2 px-3 py-1 bg-blue-600 text-white rounded-md text-sm">
                Update
              </button>
            </div>
          </div>

          {/* Followed Communities */}
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Followed Communities</h3>
            <div className="space-y-3">
              {communities.length > 0 ? (
                communities.map((community) => (
                  <div key={community.id} className="flex items-center space-x-3">
                    {community.profileImage ? (
                      <img 
                        src={community.profileImage} 
                        alt={community.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">o/</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <Link to={`/community/${community.slug || community.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                        o/{community.name}
                      </Link>
                      <p className="text-xs text-gray-500">{community.memberCount || 0} members</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <p className="text-sm">No communities followed yet</p>
                  <p className="text-xs mt-1">Communities you follow will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
