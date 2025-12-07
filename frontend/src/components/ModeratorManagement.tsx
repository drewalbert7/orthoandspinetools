import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import toast from 'react-hot-toast';

interface ModeratorManagementProps {
  communityId: string;
  currentModerators: Array<{ 
    userId: string; 
    role: string;
    user?: {
      id: string;
      username: string;
      firstName: string;
      lastName: string;
      specialty?: string;
      profileImage?: string;
    }
  }>;
  isOwner: boolean;
  isAdmin: boolean;
}

const ModeratorManagement: React.FC<ModeratorManagementProps> = ({
  communityId,
  currentModerators,
  isOwner: _isOwner,
  isAdmin: _isAdmin,
}) => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Fetch moderators with full user details
  const { data: moderatorsData, isLoading: moderatorsLoading } = useQuery({
    queryKey: ['community-moderators', communityId],
    queryFn: () => apiService.getCommunityModerators(communityId),
    enabled: !!communityId,
  });

  const moderators = moderatorsData || currentModerators;

  // Add moderator mutation
  const addModeratorMutation = useMutation({
    mutationFn: (userId: string) => apiService.addCommunityModerator(communityId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-moderators', communityId] });
      queryClient.invalidateQueries({ queryKey: ['community'] });
      queryClient.invalidateQueries({ queryKey: ['moderation-permissions'] });
      toast.success('Moderator added successfully');
      setShowAddModal(false);
      setSearchQuery('');
      setSearchResults([]);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add moderator');
    },
  });

  // Remove moderator mutation
  const removeModeratorMutation = useMutation({
    mutationFn: (userId: string) => apiService.removeCommunityModerator(communityId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-moderators', communityId] });
      queryClient.invalidateQueries({ queryKey: ['community'] });
      queryClient.invalidateQueries({ queryKey: ['moderation-permissions'] });
      toast.success('Moderator removed successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove moderator');
    },
  });

  // Search users
  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await apiService.searchUsers(query, communityId);
      // Filter out users who are already moderators
      const moderatorUserIds = moderators.map((m: any) => m.userId);
      const filteredResults = results.filter((user: any) => !moderatorUserIds.includes(user.id));
      setSearchResults(filteredResults);
    } catch (error: any) {
      toast.error(error.message || 'Failed to search users');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    handleSearch(query);
  };

  return (
    <div className="border-b border-gray-200 pb-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Moderators</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Add Moderator
        </button>
      </div>

      {/* Current Moderators List */}
      <div className="space-y-2">
        {moderatorsLoading ? (
          <div className="text-center py-4 text-gray-500">Loading moderators...</div>
        ) : moderators.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No moderators yet</div>
        ) : (
          moderators.map((mod: any) => {
            const modUser = mod.user || { id: mod.userId, username: 'Unknown', firstName: '', lastName: '' };
            return (
              <div
                key={mod.userId}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200"
              >
                <div className="flex items-center space-x-3">
                  {modUser.profileImage ? (
                    <img
                      src={modUser.profileImage}
                      alt={modUser.username}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {modUser.firstName?.[0] || ''}{modUser.lastName?.[0] || ''}
                      </span>
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-gray-900">
                      u/{modUser.username}
                    </div>
                    <div className="text-sm text-gray-500">
                      {modUser.firstName} {modUser.lastName}
                      {modUser.specialty && ` • ${modUser.specialty}`}
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    {mod.role}
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to remove ${modUser.username} as a moderator?`)) {
                      removeModeratorMutation.mutate(mod.userId);
                    }
                  }}
                  disabled={removeModeratorMutation.isPending}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Add Moderator Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Moderator</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search for user
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search by username, email, or name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>

            {/* Search Results */}
            {isSearching && (
              <div className="text-center py-4 text-gray-500">Searching...</div>
            )}

            {!isSearching && searchResults.length > 0 && (
              <div className="max-h-64 overflow-y-auto space-y-2 mb-4">
                {searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {user.profileImage ? (
                        <img
                          src={user.profileImage}
                          alt={user.username}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-sm">
                            {user.firstName?.[0] || ''}{user.lastName?.[0] || ''}
                          </span>
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900">u/{user.username}</div>
                        <div className="text-sm text-gray-500">
                          {user.firstName} {user.lastName}
                          {user.specialty && ` • ${user.specialty}`}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => addModeratorMutation.mutate(user.id)}
                      disabled={addModeratorMutation.isPending}
                      className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="text-center py-4 text-gray-500">No users found</div>
            )}

            {searchQuery.length < 2 && (
              <div className="text-center py-4 text-gray-500">Type at least 2 characters to search</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModeratorManagement;

