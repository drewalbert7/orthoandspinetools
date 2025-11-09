import React, { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiService, UserProfile, Post, Comment } from '../services/apiService';
import VoteButton from '../components/VoteButton';
import PostAttachments from '../components/PostAttachments';
import { formatDistanceToNow } from 'date-fns';

type TabType = 'overview' | 'posts' | 'comments' | 'saved' | 'history' | 'upvoted' | 'downvoted';
type SortOption = 'hot' | 'new' | 'top' | 'controversial';

// PostCard component for displaying posts (Reddit-style)
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
    <div className="bg-white border border-gray-200 hover:border-gray-300 transition-colors mb-2">
      <div className="p-3">
        {/* Post Header */}
        <div className="flex items-center space-x-1 text-xs text-gray-500 mb-1">
          <Link 
            to={`/community/${post.community?.slug || post.communityId}`}
            className="font-medium text-gray-900 hover:underline flex items-center space-x-1"
          >
            {post.community?.profileImage ? (
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
            <span>o/{post.community?.name || 'Unknown'}</span>
          </Link>
          <span>•</span>
          <span>Posted by u/{post.author?.username || 'Unknown'}</span>
          <span>•</span>
          <span>{formatTimeAgo(new Date(post.createdAt))}</span>
        </div>

        {/* Post Title and Content */}
        <Link to={`/post/${post.id}`} className="block">
          <h3 className="text-lg font-medium text-gray-900 mb-2 hover:text-blue-600 transition-colors leading-tight">
            {post.title}
          </h3>
          {post.content && (
            <p className="text-gray-800 text-sm leading-relaxed mb-3 line-clamp-3">
              {post.content}
            </p>
          )}
        </Link>

        {/* Attachments Preview */}
        <PostAttachments attachments={post.attachments || []} />

        {/* Action Bar with Voting */}
        <div className="flex items-center space-x-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
          <VoteButton
            postId={post.id}
            initialVoteScore={post.voteScore || 0}
            initialUserVote={post.userVote || null}
            size="sm"
          />
          <Link 
            to={`/post/${post.id}`}
            className="flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{post._count?.comments || post.commentsCount || 0}</span>
          </Link>
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

const Profile: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [sortOption, setSortOption] = useState<SortOption>('new');

  // Fetch user profile data
  const { data: profileData, isLoading, error } = useQuery<UserProfile>({
    queryKey: ['user-profile', user?.id],
    queryFn: () => apiService.getUserProfile(),
    enabled: !!user,
  });

  // Sort posts based on selected option
  const sortedPosts = useMemo(() => {
    if (!profileData?.posts) return [];
    const posts = [...profileData.posts];
    
    switch (sortOption) {
      case 'hot':
        // Sort by vote score + recency (posts from last 24 hours weighted higher)
        return posts.sort((a, b) => {
          const aScore = (a.voteScore || 0) + (new Date(a.createdAt).getTime() > Date.now() - 86400000 ? 10 : 0);
          const bScore = (b.voteScore || 0) + (new Date(b.createdAt).getTime() > Date.now() - 86400000 ? 10 : 0);
          return bScore - aScore;
        });
      case 'top':
        return posts.sort((a, b) => (b.voteScore || 0) - (a.voteScore || 0));
      case 'controversial':
        // Sort by posts with votes close to zero (most controversial)
        return posts.sort((a, b) => {
          const aControversy = Math.abs((a.voteScore || 0));
          const bControversy = Math.abs((b.voteScore || 0));
          return aControversy - bControversy;
        });
      case 'new':
      default:
        return posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }, [profileData?.posts, sortOption]);

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

  const { user: profileUser, stats, communities, comments = [] } = profileData;

  const formatAccountAge = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { addSuffix: false });
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'U';
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex gap-6">
        {/* Main Content */}
        <div className="flex-1">
              {/* User Header */}
              <div className="bg-white border border-gray-200 rounded-md p-6 mb-4">
            <div className="flex items-start space-x-4">
              {/* Profile Avatar */}
              {profileUser.profileImage ? (
                <img
                  src={profileUser.profileImage}
                  alt={`${profileUser.firstName} ${profileUser.lastName}`}
                  className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                />
              ) : (
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center border-2 border-gray-200">
                  <span className="text-white font-bold text-2xl">
                    {getInitials(profileUser.firstName, profileUser.lastName)}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                      {profileUser.firstName} {profileUser.lastName}
                    </h1>
                    <p className="text-gray-600">u/{profileUser.username}</p>
                    {profileUser.specialty && (
                      <p className="text-sm text-gray-500 mt-1">
                        {profileUser.specialty}
                        {profileUser.subSpecialty && ` - ${profileUser.subSpecialty}`}
                      </p>
                    )}
                  </div>
                  <Link
                    to="/profile/settings"
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Edit Profile
                  </Link>
                </div>
                {profileUser.bio && (
                  <p className="text-gray-700 mt-3">{profileUser.bio}</p>
                )}
                <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
                  <span>Joined {formatAccountAge(profileUser.createdAt)} ago</span>
                  {profileUser.institution && <span>• {profileUser.institution}</span>}
                  {profileUser.location && <span>• {profileUser.location}</span>}
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
                <div className="text-lg font-semibold text-gray-900">{formatAccountAge(profileUser.createdAt)}</div>
                <div className="text-sm text-gray-500">Account Age</div>
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

            {/* Content Filter & Sort */}
            {(activeTab === 'overview' || activeTab === 'posts') && (
              <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {/* Sort Options */}
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">Sort by:</span>
                    {(['hot', 'new', 'top', 'controversial'] as SortOption[]).map((sort) => (
                      <button
                        key={sort}
                        onClick={() => setSortOption(sort)}
                        className={`px-3 py-1 text-sm rounded-md transition-colors ${
                          sortOption === sort
                            ? 'bg-blue-100 text-blue-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {sort.charAt(0).toUpperCase() + sort.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Link to="/create-post" className="flex items-center space-x-1 px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Create Post</span>
                  </Link>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="p-6">
              {activeTab === 'overview' && (
                <div className="space-y-2">
                  {sortedPosts.length > 0 ? (
                    sortedPosts.map((post) => (
                      <PostCard key={post.id} post={post} />
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
                <div className="space-y-2">
                  {sortedPosts.length > 0 ? (
                    sortedPosts.map((post) => (
                      <PostCard key={post.id} post={post} />
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
                <div className="space-y-4">
                  {comments.length > 0 ? (
                    comments.map((comment: Comment) => (
                      <div key={comment.id} className="border border-gray-200 rounded-md p-4 hover:border-gray-300 transition-colors">
                        <div className="flex items-center space-x-2 text-xs text-gray-500 mb-2">
                          <span>Commented on</span>
                          <Link 
                            to={`/post/${comment.postId}`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {comment.post?.title || 'Post'}
                          </Link>
                          {comment.post?.community && (
                            <>
                              <span>in</span>
                              <Link 
                                to={`/community/${comment.post.community.slug || comment.post.community.id}`}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                o/{comment.post.community.name}
                              </Link>
                            </>
                          )}
                          <span>•</span>
                          <span>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
                        </div>
                        <p className="text-gray-800 text-sm leading-relaxed mb-3">{comment.content}</p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
                          <div className="flex items-center space-x-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                            <span className="font-medium">{comment.voteScore || 0}</span>
                          </div>
                          <Link 
                            to={`/post/${comment.postId}#comment-${comment.id}`}
                            className="flex items-center space-x-1 text-gray-600 hover:text-blue-600"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            <span>{comment._count?.replies || 0} replies</span>
                          </Link>
                          <Link 
                            to={`/post/${comment.postId}`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            View post →
                          </Link>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No comments yet.</p>
                      <p className="text-sm mt-1">Comments you make will appear here.</p>
                    </div>
                  )}
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
                <span>{formatAccountAge(profileUser.createdAt)} Account Age</span>
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

            <div className="border-t border-gray-200 pt-4 mt-4">
              <h4 className="font-semibold text-gray-900 mb-2">PROFILE SETTINGS</h4>
              <Link
                to="/profile/settings"
                className="w-full mt-2 px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Edit Profile</span>
              </Link>
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
