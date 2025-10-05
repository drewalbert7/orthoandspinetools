import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import { formatDistanceToNow } from 'date-fns';

const UserProfile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const [activeTab, setActiveTab] = useState<'posts' | 'comments'>('posts');

  // Fetch user profile
  const { data: user, isLoading: userLoading, error: userError } = useQuery({
    queryKey: ['user', username],
    queryFn: async () => ({
      username: username!,
      firstName: '',
      lastName: '',
      specialty: undefined,
      subSpecialty: undefined,
      institution: undefined,
      bio: undefined,
      createdAt: new Date().toISOString(),
      _count: { posts: 0, comments: 0, toolReviews: 0 },
    } as any),
    enabled: !!username,
  });

  // Fetch user posts
  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['user-posts', username],
    queryFn: async () => (await apiService.getPosts({})).posts,
    enabled: !!username && activeTab === 'posts',
  });

  // Fetch user comments
  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: ['user-comments', username],
    queryFn: async () => [],
    enabled: !!username && activeTab === 'comments',
  });

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-gray-500">Loading profile...</div>
      </div>
    );
  }

  if (userError || !user) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-red-500">User not found</div>
      </div>
    );
  }

  const posts = postsData || [];
  const comments = commentsData || [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* User Header */}
      <div className="bg-white border border-gray-200 rounded-md p-6 mb-4">
        <div className="flex items-start space-x-4">
          <div className="w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-2xl">
              {user.firstName?.[0]}{user.lastName?.[0]}
            </span>
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">
              u/{user.username}
            </h1>
            <p className="text-gray-600">
              {user.firstName} {user.lastName}
            </p>
            {user.specialty && (
              <p className="text-sm text-gray-500 mt-1">
                {user.specialty}
                {user.subSpecialty && ` - ${user.subSpecialty}`}
              </p>
            )}
            {user.institution && (
              <p className="text-sm text-gray-500">
                {user.institution}
              </p>
            )}
            {user.bio && (
              <p className="text-gray-700 mt-3">{user.bio}</p>
            )}
            <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
              <span>Joined {formatDistanceToNow(new Date(user.createdAt))} ago</span>
              {user.location && <span>• {user.location}</span>}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center space-x-6 mt-4 pt-4 border-t border-gray-200">
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {user._count?.posts || 0}
            </div>
            <div className="text-sm text-gray-500">Posts</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {user._count?.comments || 0}
            </div>
            <div className="text-sm text-gray-500">Comments</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {user._count?.toolReviews || 0}
            </div>
            <div className="text-sm text-gray-500">Tool Reviews</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-gray-200 rounded-md mb-4">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('posts')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'posts'
                ? 'text-orange-500 border-b-2 border-orange-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Posts
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'comments'
                ? 'text-orange-500 border-b-2 border-orange-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Comments
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {activeTab === 'posts' && (
            <div>
              {postsLoading ? (
                <div className="text-center py-4 text-gray-500">Loading posts...</div>
              ) : posts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No posts yet.</p>
                  <p className="text-sm mt-1">This user hasn't posted anything.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map((post: any) => (
                    <div key={post.id} className="border border-gray-200 rounded-md p-4">
                      <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                        <span>Posted in o/{post.community?.name}</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(post.createdAt))} ago</span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {post.title}
                      </h3>
                      {post.content && (
                        <p className="text-gray-700 mb-3 line-clamp-3">{post.content}</p>
                      )}
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>{post._count?.comments || 0} comments</span>
                        <span>{post.voteScore || 0} votes</span>
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
                <div className="text-center py-4 text-gray-500">Loading comments...</div>
              ) : comments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No comments yet.</p>
                  <p className="text-sm mt-1">This user hasn't commented on anything.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment: any) => (
                    <div key={comment.id} className="border border-gray-200 rounded-md p-4">
                      <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                        <span>Commented on</span>
                        <a 
                          href={`/post/${comment.post?.id}`}
                          className="text-orange-500 hover:text-orange-600"
                        >
                          {comment.post?.title}
                        </a>
                        <span>in o/{comment.post?.community?.name}</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(comment.createdAt))} ago</span>
                      </div>
                      <p className="text-gray-700">{comment.content}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 mt-2">
                        <span>{comment._count?.replies || 0} replies</span>
                        <span>{comment.voteScore || 0} votes</span>
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
