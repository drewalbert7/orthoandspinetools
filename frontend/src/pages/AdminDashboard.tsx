import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import { Link } from 'react-router-dom';
import MarkdownContent from '../components/MarkdownContent';
import toast from 'react-hot-toast';

type TabType = 'users' | 'moderation' | 'communities' | 'analytics';

const AdminDashboard: React.FC = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  const { data: permissions, isFetched, isError } = useQuery({
    queryKey: ['moderation-permissions'],
    queryFn: () => apiService.getModerationPermissions(),
    enabled: !!currentUser,
    retry: 1,
  });

  const isAdminUser = !!(currentUser?.isAdmin || permissions?.isAdmin);

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users', page, searchTerm],
    queryFn: () => apiService.getModerationUsers(page, 20, searchTerm || undefined),
    enabled: activeTab === 'users' && isAdminUser,
  });

  const [moderationType, setModerationType] = useState<'post' | 'comment'>('post');

  const { data: moderationData, isLoading: moderationLoading } = useQuery({
    queryKey: ['moderation-queue', moderationType, page],
    queryFn: () => apiService.getModerationQueue(moderationType, page, 20),
    enabled: activeTab === 'moderation' && isAdminUser,
  });

  const { data: communitiesData, isLoading: communitiesLoading } = useQuery({
    queryKey: ['admin-communities'],
    queryFn: () => apiService.getCommunities(),
    enabled: activeTab === 'communities' && isAdminUser,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => apiService.getAdminStats(),
    enabled: activeTab === 'analytics' && isAdminUser,
  });

  const invalidateContentCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
    queryClient.invalidateQueries({ queryKey: ['posts'] });
    queryClient.invalidateQueries({ queryKey: ['post'] });
    queryClient.invalidateQueries({ queryKey: ['feed'] });
    queryClient.invalidateQueries({ queryKey: ['search-posts'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  const adminDeletePostMutation = useMutation({
    mutationFn: (postId: string) => apiService.deletePost(postId),
    onSuccess: () => {
      invalidateContentCaches();
      toast.success('Post deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete post');
    },
  });

  const adminLockPostMutation = useMutation({
    mutationFn: ({ postId, locked }: { postId: string; locked: boolean }) =>
      apiService.lockPost(postId, locked),
    onSuccess: (_data, { locked }) => {
      invalidateContentCaches();
      toast.success(locked ? 'Post locked' : 'Post unlocked');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to lock/unlock post');
    },
  });

  const adminPinPostMutation = useMutation({
    mutationFn: ({ postId, pinned }: { postId: string; pinned: boolean }) =>
      apiService.pinPost(postId, pinned),
    onSuccess: (_data, { pinned }) => {
      invalidateContentCaches();
      toast.success(pinned ? 'Post pinned' : 'Post unpinned');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to pin/unpin post');
    },
  });

  const adminDeleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => apiService.deleteComment(commentId),
    onSuccess: () => {
      invalidateContentCaches();
      toast.success('Comment deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete comment');
    },
  });

  // Ban/Unban user mutation
  const banMutation = useMutation({
    mutationFn: ({ userId, banned, reason }: { userId: string; banned: boolean; reason?: string }) =>
      apiService.banUser(userId, banned, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User status updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update user status');
    },
  });

  // Promote/Demote user mutation
  const promoteMutation = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      apiService.promoteUser(userId, isAdmin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['moderation-permissions'] });
      toast.success('User role updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update user role');
    },
  });

  const verifyPhysicianMutation = useMutation({
    mutationFn: ({ userId, isVerified }: { userId: string; isVerified: boolean }) =>
      apiService.verifyPhysician(userId, isVerified),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['search-posts'] });
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      toast.success('Physician verification updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update physician verification');
    },
  });

  const verifyFounderMutation = useMutation({
    mutationFn: ({ userId, isVerified }: { userId: string; isVerified: boolean }) =>
      apiService.verifyFounder(userId, isVerified),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['search-posts'] });
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      toast.success('Founder verification updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update founder verification');
    },
  });

  if (!currentUser) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Please sign in to access admin dashboard</h1>
          <Link to="/login" className="text-blue-600 hover:text-blue-800">
            Sign in here
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdminUser) {
    if (!isFetched && !isError && !currentUser.isAdmin) {
      return (
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-4 text-gray-600">Checking access…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">You need admin privileges to access this page.</p>
          <Link to="/" className="text-blue-600 hover:text-blue-800">
            Go to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-md p-6 mb-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-600">Manage users, content, and platform settings</p>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-gray-200 rounded-md mb-4">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'users', label: 'Users', icon: '👥' },
            { id: 'moderation', label: 'Recent content', icon: '🔍' },
            { id: 'communities', label: 'Communities', icon: '🏥' },
            { id: 'analytics', label: 'Analytics', icon: '📊' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`px-6 py-3 text-sm font-medium flex items-center space-x-2 ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'users' && (
            <div>
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search users by username, email, or name..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {usersLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading users...</p>
                </div>
              ) : usersData?.users && usersData.users.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            User
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Role
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Physician
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Founder
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Activity
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {usersData.users.map((user: any) => (
                          <tr key={user.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {user.firstName} {user.lastName}
                                </div>
                                <div className="text-sm text-gray-500">@{user.username}</div>
                                <div className="text-xs text-gray-400">{user.email}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  user.isActive
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {user.isActive ? 'Active' : 'Banned'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  user.isAdmin
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {user.isAdmin ? 'Admin' : 'User'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  user.isVerifiedPhysician
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {user.isVerifiedPhysician ? 'Verified' : 'Not verified'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  user.isVerifiedFounder
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {user.isVerifiedFounder ? 'Verified' : 'Not verified'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div>{user._count?.posts || 0} posts</div>
                              <div>{user._count?.comments || 0} comments</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                              <button
                                onClick={() => {
                                  if (window.confirm(`Are you sure you want to ${user.isActive ? 'ban' : 'unban'} this user?`)) {
                                    banMutation.mutate({
                                      userId: user.id,
                                      banned: user.isActive,
                                    });
                                  }
                                }}
                                className={`${
                                  user.isActive
                                    ? 'text-red-600 hover:text-red-900'
                                    : 'text-green-600 hover:text-green-900'
                                }`}
                              >
                                {user.isActive ? 'Ban' : 'Unban'}
                              </button>
                              {!user.isAdmin && (
                                <button
                                  onClick={() => {
                                    if (window.confirm('Are you sure you want to promote this user to admin?')) {
                                      promoteMutation.mutate({
                                        userId: user.id,
                                        isAdmin: true,
                                      });
                                    }
                                  }}
                                  className="text-purple-600 hover:text-purple-900"
                                >
                                  Promote
                                </button>
                              )}
                              {user.isAdmin && user.id !== currentUser?.id && (
                                <button
                                  onClick={() => {
                                    if (window.confirm('Are you sure you want to demote this admin?')) {
                                      promoteMutation.mutate({
                                        userId: user.id,
                                        isAdmin: false,
                                      });
                                    }
                                  }}
                                  className="text-orange-600 hover:text-orange-900"
                                >
                                  Demote
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  const next = !user.isVerifiedPhysician;
                                  if (
                                    window.confirm(
                                      next
                                        ? `Verify ${user.username} as a physician?`
                                        : `Remove verified physician status from ${user.username}?`
                                    )
                                  ) {
                                    verifyPhysicianMutation.mutate({
                                      userId: user.id,
                                      isVerified: next,
                                    });
                                  }
                                }}
                                disabled={verifyPhysicianMutation.isPending}
                                className={`${
                                  user.isVerifiedPhysician
                                    ? 'text-gray-600 hover:text-gray-900'
                                    : 'text-blue-600 hover:text-blue-900'
                                } disabled:opacity-50`}
                              >
                                {user.isVerifiedPhysician ? 'Unverify Physician' : 'Verify Physician'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = !user.isVerifiedFounder;
                                  if (
                                    window.confirm(
                                      next
                                        ? `Verify ${user.username} as a founder?`
                                        : `Remove verified founder status from ${user.username}?`
                                    )
                                  ) {
                                    verifyFounderMutation.mutate({
                                      userId: user.id,
                                      isVerified: next,
                                    });
                                  }
                                }}
                                disabled={verifyFounderMutation.isPending}
                                className={`${
                                  user.isVerifiedFounder
                                    ? 'text-gray-600 hover:text-gray-900'
                                    : 'text-amber-700 hover:text-amber-900'
                                } disabled:opacity-50`}
                              >
                                {user.isVerifiedFounder ? 'Unverify Founder' : 'Verify Founder'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {usersData.pagination && usersData.pagination.pages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        Page {usersData.pagination.page} of {usersData.pagination.pages}
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setPage((p) => Math.min(usersData.pagination.pages, p + 1))}
                          disabled={page >= usersData.pagination.pages}
                          className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No users found</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'moderation' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Latest posts and comments site-wide. This is not a reported-items queue; use actions below or open the thread for full context.
              </p>
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => { setModerationType('post'); setPage(1); }}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    moderationType === 'post' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Posts
                </button>
                <button
                  onClick={() => { setModerationType('comment'); setPage(1); }}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    moderationType === 'comment' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Comments
                </button>
              </div>
              {moderationLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading recent content…</p>
                </div>
              ) : moderationData?.items && moderationData.items.length > 0 ? (
                <div className="space-y-4">
                  {moderationType === 'post'
                    ? moderationData.items.map((post: any) => {
                        const isLocked = Boolean(post.isLocked);
                        const isPinned = Boolean(post.isPinned);
                        const busyPost =
                          (adminDeletePostMutation.isPending && adminDeletePostMutation.variables === post.id) ||
                          (adminLockPostMutation.isPending && adminLockPostMutation.variables?.postId === post.id) ||
                          (adminPinPostMutation.isPending && adminPinPostMutation.variables?.postId === post.id);
                        return (
                        <div key={post.id} className="border border-gray-200 rounded-md p-4">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <Link
                                to={`/post/${post.id}`}
                                className="text-lg font-medium text-gray-900 hover:text-blue-600 break-words"
                              >
                                {post.title}
                              </Link>
                              <p className="text-sm text-gray-600 mt-1">
                                by u/{post.author?.username} in o/{post.community?.name}
                                {isLocked && <span className="ml-2 text-amber-700">Locked</span>}
                                {isPinned && <span className="ml-2 text-blue-700">Pinned</span>}
                              </p>
                              <p className="text-sm text-gray-500 mt-2">
                                {post._count?.comments || 0} comments • {post._count?.votes || 0} votes
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <Link
                                to={`/post/${post.id}`}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                              >
                                Open
                              </Link>
                              <button
                                type="button"
                                disabled={busyPost}
                                onClick={() =>
                                  adminLockPostMutation.mutate({ postId: post.id, locked: !isLocked })
                                }
                                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                              >
                                {isLocked ? 'Unlock' : 'Lock'}
                              </button>
                              <button
                                type="button"
                                disabled={busyPost}
                                onClick={() =>
                                  adminPinPostMutation.mutate({ postId: post.id, pinned: !isPinned })
                                }
                                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                              >
                                {isPinned ? 'Unpin' : 'Pin'}
                              </button>
                              <button
                                type="button"
                                disabled={busyPost}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      'Delete this post? This cannot be undone.'
                                    )
                                  ) {
                                    adminDeletePostMutation.mutate(post.id);
                                  }
                                }}
                                className="px-3 py-1.5 border border-red-200 text-red-700 rounded-md text-sm hover:bg-red-50 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                      })
                    : moderationData.items.map((comment: any) => {
                        const busyComment =
                          adminDeleteCommentMutation.isPending &&
                          adminDeleteCommentMutation.variables === comment.id;
                        return (
                        <div key={comment.id} className="border border-gray-200 rounded-md p-4">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <MarkdownContent lineClamp={3} className="text-sm text-gray-900 [overflow-wrap:anywhere]">
                                {comment.content}
                              </MarkdownContent>
                              <p className="text-sm text-gray-600 mt-1">
                                by u/{comment.author?.username} on{' '}
                                <Link
                                  to={`/post/${comment.post?.id}`}
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  {comment.post?.title || 'post'}
                                </Link>
                              </p>
                              <p className="text-sm text-gray-500 mt-2">
                                {comment._count?.replies || 0} replies • {comment._count?.votes || 0} votes
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <Link
                                to={`/post/${comment.post?.id}`}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                              >
                                Open thread
                              </Link>
                              <button
                                type="button"
                                disabled={busyComment}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      'Delete this comment? This cannot be undone.'
                                    )
                                  ) {
                                    adminDeleteCommentMutation.mutate(comment.id);
                                  }
                                }}
                                className="px-3 py-1.5 border border-red-200 text-red-700 rounded-md text-sm hover:bg-red-50 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                      })}
                  {moderationData.pagination && moderationData.pagination.pages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        Page {moderationData.pagination.page} of {moderationData.pagination.pages}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 text-sm"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setPage((p) => Math.min(moderationData.pagination.pages, p + 1))}
                          disabled={page >= moderationData.pagination.pages}
                          className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 text-sm"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No items to show</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'communities' && (
            <div>
              {communitiesLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading communities...</p>
                </div>
              ) : communitiesData && communitiesData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Community</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Members</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Posts</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {communitiesData.map((community: any) => (
                        <tr key={community.id}>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">{community.name}</div>
                            <div className="text-xs text-gray-500">o/{community.slug}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">{community.memberCount ?? 0}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{community.postCount ?? 0}</td>
                          <td className="px-6 py-4">
                            <Link
                              to={`/community/${community.slug}/settings`}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              Manage
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">No communities found</div>
              )}
            </div>
          )}

          {activeTab === 'analytics' && (
            <div>
              {statsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading analytics...</p>
                </div>
              ) : statsData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-sm text-gray-500">Total Users</p>
                      <p className="text-2xl font-bold text-gray-900">{statsData.totalUsers}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-sm text-gray-500">Total Posts</p>
                      <p className="text-2xl font-bold text-gray-900">{statsData.totalPosts}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-sm text-gray-500">Total Comments</p>
                      <p className="text-2xl font-bold text-gray-900">{statsData.totalComments}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-sm text-gray-500">Communities</p>
                      <p className="text-2xl font-bold text-gray-900">{statsData.totalCommunities}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">This Week</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                        <p className="text-sm text-blue-600">New Users</p>
                        <p className="text-2xl font-bold text-blue-900">{statsData.newUsersThisWeek}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                        <p className="text-sm text-green-600">New Posts</p>
                        <p className="text-2xl font-bold text-green-900">{statsData.postsThisWeek}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                        <p className="text-sm text-purple-600">New Comments</p>
                        <p className="text-2xl font-bold text-purple-900">{statsData.commentsThisWeek}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">Unable to load analytics</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

