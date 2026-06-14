import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import { formatDistanceToNow } from 'date-fns';
import MarkdownContent from '../components/MarkdownContent';
import AuthorVerificationsInline from '../components/AuthorVerificationsInline';
import { DocumentMeta } from '../components/DocumentMeta';
import { navigateToPostFromFeedCardBackground } from '../lib/navigatePostFromFeedCard';
import { buildUserProfileJsonLd } from '../lib/seo';

const UserProfile: React.FC = () => {
  const navigate = useNavigate();
  const { username } = useParams<{ username: string }>();
  const [activeTab, setActiveTab] = useState<'posts' | 'comments'>('posts');

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['public-user', username],
    queryFn: () => apiService.getPublicUserProfile(username!),
    enabled: !!username,
  });

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['public-user-posts', username],
    queryFn: () => apiService.getPublicUserPosts(username!, { limit: 50 }),
    enabled: !!username && activeTab === 'posts',
  });

  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: ['public-user-comments', username],
    queryFn: () => apiService.getPublicUserComments(username!, { limit: 50 }),
    enabled: !!username && activeTab === 'comments',
  });

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-64 px-2 sm:px-4">
        <div className="text-sm sm:text-base text-gray-500">Loading profile…</div>
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <DocumentMeta title="User not found" noIndex />
        <h1 className="text-xl font-bold text-gray-900 mb-2">User not found</h1>
        <p className="text-gray-600 mb-6">u/{username} does not exist or is unavailable.</p>
        <Link to="/" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Back to home
        </Link>
      </div>
    );
  }

  const { user, stats } = profile;
  const posts = postsData?.posts ?? [];
  const comments = commentsData?.comments ?? [];
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

  const profileJsonLd = useMemo(() => buildUserProfileJsonLd(user, stats), [user, stats]);

  return (
    <div className="mx-auto min-w-0 max-w-4xl px-2 sm:px-4">
      <DocumentMeta
        title={`u/${user.username}`}
        description={
          user.bio?.trim() ||
          `${displayName || user.username} on OrthoAndSpineTools — ${stats.postsCount} posts, ${stats.commentsCount} comments.`
        }
        canonicalPath={`/user/${user.username}`}
        jsonLd={profileJsonLd}
      />

      <div className="bg-white border border-gray-200 rounded-md p-3 sm:p-4 md:p-6 mb-3 sm:mb-4">
        <div className="flex flex-col sm:flex-row items-start space-y-3 sm:space-y-0 sm:space-x-4">
          {user.profileImage ? (
            <img
              src={user.profileImage}
              alt=""
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xl sm:text-2xl">
                {(user.firstName?.[0] || user.username[0] || '?').toUpperCase()}
                {user.lastName?.[0]?.toUpperCase() || ''}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0 w-full sm:w-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate inline-flex items-center flex-wrap gap-x-1">
              u/{user.username}
              <AuthorVerificationsInline author={user} />
            </h1>
            {displayName && (
              <p className="text-sm sm:text-base text-gray-600">{displayName}</p>
            )}
            {user.specialty && (
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {user.specialty}
                {user.subSpecialty && ` — ${user.subSpecialty}`}
              </p>
            )}
            {user.institution && (
              <p className="text-xs sm:text-sm text-gray-500">{user.institution}</p>
            )}
            {user.bio && (
              <p className="text-sm sm:text-base text-gray-700 mt-2 sm:mt-3 break-words">{user.bio}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 sm:mt-3 text-xs sm:text-sm text-gray-500">
              <span>Joined {formatDistanceToNow(new Date(user.createdAt))} ago</span>
              {user.location && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span>{user.location}</span>
                </>
              )}
              {user.website && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <a
                    href={user.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 break-all"
                  >
                    {user.website.replace(/^https?:\/\//, '')}
                  </a>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-6 mt-4 pt-4 border-t border-gray-200">
          <div className="text-center">
            <div className="text-base sm:text-lg font-semibold text-gray-900 tabular-nums">
              {stats.postsCount}
            </div>
            <div className="text-xs sm:text-sm text-gray-500">Posts</div>
          </div>
          <div className="text-center">
            <div className="text-base sm:text-lg font-semibold text-gray-900 tabular-nums">
              {stats.commentsCount}
            </div>
            <div className="text-xs sm:text-sm text-gray-500">Comments</div>
          </div>
          <div className="text-center">
            <div className="text-base sm:text-lg font-semibold text-gray-900 tabular-nums">
              {stats.totalKarma.toLocaleString()}
            </div>
            <div className="text-xs sm:text-sm text-gray-500">Points</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-md mb-3 sm:mb-4">
        <div className="flex border-b border-gray-200 overflow-x-auto scrollbar-hide">
          <button
            type="button"
            onClick={() => setActiveTab('posts')}
            className={`px-4 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 ${
              activeTab === 'posts'
                ? 'text-orange-500 border-b-2 border-orange-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Posts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('comments')}
            className={`px-4 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 ${
              activeTab === 'comments'
                ? 'text-orange-500 border-b-2 border-orange-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Comments
          </button>
        </div>

        <div className="p-3 sm:p-4">
          {activeTab === 'posts' && (
            <div>
              {postsLoading ? (
                <div className="text-center py-4 text-gray-500">Loading posts…</div>
              ) : posts.length === 0 ? (
                <div className="text-center py-6 sm:py-8 text-gray-500">
                  <p className="text-sm sm:text-base">No posts yet.</p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {posts.map((post) => (
                    <div key={post.id} className="border border-gray-200 rounded-md p-3 sm:p-4">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-gray-500 mb-2">
                        <span>
                          Posted in{' '}
                          <Link
                            to={`/community/${post.community?.slug || post.communityId}`}
                            className="text-gray-700 hover:text-blue-600"
                          >
                            o/{post.community?.name}
                          </Link>
                        </span>
                        <span className="hidden sm:inline">•</span>
                        <span>{formatDistanceToNow(new Date(post.createdAt))} ago</span>
                      </div>
                      <div
                        role="presentation"
                        className="cursor-pointer min-h-0"
                        onClick={(e) => navigateToPostFromFeedCardBackground(e, navigate, post.id)}
                      >
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 break-words">
                          <Link
                            to={`/post/${post.id}`}
                            className="hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                          >
                            {post.title}
                          </Link>
                        </h3>
                        {post.content && (
                          <MarkdownContent
                            lineClamp={3}
                            className="mb-3 text-sm text-gray-700 [overflow-wrap:anywhere] sm:text-base"
                          >
                            {post.content}
                          </MarkdownContent>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-gray-500">
                        <span>{post.commentsCount ?? post._count?.comments ?? 0} comments</span>
                        <span className="hidden sm:inline">•</span>
                        <span>{post.voteScore ?? 0} points</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <div>
              {commentsLoading ? (
                <div className="text-center py-4 text-gray-500">Loading comments…</div>
              ) : comments.length === 0 ? (
                <div className="text-center py-6 sm:py-8 text-gray-500">
                  <p className="text-sm sm:text-base">No comments yet.</p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="border border-gray-200 rounded-md p-3 sm:p-4">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-gray-500 mb-2">
                        <span>Commented on</span>
                        <Link
                          to={`/post/${comment.postId}`}
                          className="text-orange-500 hover:text-orange-600 break-words"
                        >
                          {comment.post?.title || 'post'}
                        </Link>
                        {comment.post?.community?.name && (
                          <>
                            <span className="hidden sm:inline">in</span>
                            <span>o/{comment.post.community.name}</span>
                          </>
                        )}
                        <span className="hidden sm:inline">•</span>
                        <span>{formatDistanceToNow(new Date(comment.createdAt))} ago</span>
                      </div>
                      <MarkdownContent className="text-sm text-gray-700 [overflow-wrap:anywhere] sm:text-base">
                        {comment.content}
                      </MarkdownContent>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-gray-500 mt-2">
                        <span>{comment.voteScore ?? 0} points</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
