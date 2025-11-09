import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

type TabType = 'users' | 'moderation' | 'communities' | 'analytics';

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  // Check if user is admin
  const { data: permissions } = useQuery({
    queryKey: ['moderation-permissions'],
    queryFn: () => apiService.getModerationPermissions(),
    enabled: !!user,
  });

  React.useEffect(() => {
    if (permissions && !permissions.isAdmin) {
      toast.error('Access denied. Admin privileges required.');
      navigate('/');
    }
  }, [permissions, navigate]);

  // Fetch users
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users', page, searchTerm],
    queryFn: () => apiService.getModerationUsers(page, 20, searchTerm || undefined),
    enabled: activeTab === 'users' && !!permissions?.isAdmin,
  });

  // Fetch moderation queue
  const { data: moderationData, isLoading: moderationLoading } = useQuery({
    queryKey: ['moderation-queue', 'post', page],
    queryFn: () => apiService.getModerationQueue('post', page, 20),
    enabled: activeTab === 'moderation' && !!permissions?.isAdmin,
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

  if (!user) {
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

  if (!permissions?.isAdmin) {
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
            { id: 'moderation', label: 'Moderation Queue', icon: '🔍' },
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
                              {user.isAdmin && user.id !== permissions?.isAdmin && (
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
              {moderationLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading moderation queue...</p>
                </div>
              ) : moderationData?.items && moderationData.items.length > 0 ? (
                <div className="space-y-4">
                  {moderationData.items.map((post: any) => (
                    <div key={post.id} className="border border-gray-200 rounded-md p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <Link
                            to={`/post/${post.id}`}
                            className="text-lg font-medium text-gray-900 hover:text-blue-600"
                          >
                            {post.title}
                          </Link>
                          <p className="text-sm text-gray-600 mt-1">
                            by u/{post.author.username} in o/{post.community.name}
                          </p>
                          <p className="text-sm text-gray-500 mt-2">
                            {post._count?.comments || 0} comments • {post._count?.votes || 0} votes
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          <Link
                            to={`/post/${post.id}`}
                            className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                          >
                            Review
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No items in moderation queue</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'communities' && (
            <div className="text-center py-8 text-gray-500">
              <p>Community management coming soon</p>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="text-center py-8 text-gray-500">
              <p>Analytics dashboard coming soon</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

