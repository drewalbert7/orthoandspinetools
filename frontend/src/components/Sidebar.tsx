import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all communities
  const { data: communities, isLoading: communitiesLoading, isFetching: communitiesFetching } = useQuery({
    queryKey: ['communities'],
    queryFn: () => apiService.getCommunities(),
    refetchInterval: 30000, // Refetch every 30 seconds for real-time data
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  // Fetch user's followed communities
  const { data: followedCommunities } = useQuery({
    queryKey: ['user-communities'],
    queryFn: () => apiService.getUserCommunities(),
    enabled: !!user,
  });

  // Follow/unfollow community mutation
  const followMutation = useMutation({
    mutationFn: (communityId: string) => apiService.followCommunity(communityId),
    onSuccess: () => {
      // Invalidate and refetch user communities
      queryClient.invalidateQueries({ queryKey: ['user-communities'] });
    },
  });

  const followedCommunityIds = new Set(followedCommunities?.map(c => c.id) || []);

  const handleToggleFollow = (communityId: string, event: React.MouseEvent) => {
    event.preventDefault(); // Prevent navigation when clicking star
    event.stopPropagation();
    if (!user) return;
    followMutation.mutate(communityId);
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <aside className="w-64 bg-white shadow-sm border-r border-gray-200 h-full overflow-y-auto">
      <div className="p-4">
        {/* Navigation Links */}
        <nav className="space-y-2 mb-6">
          <Link
            to="/"
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive('/') ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="font-medium">Home</span>
          </Link>

          <Link
            to="/popular"
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive('/popular') ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="font-medium">Popular</span>
          </Link>

          <Link
            to="/tools"
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive('/tools') ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-medium">Medical Tools</span>
          </Link>

        </nav>

            {/* Communities Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Communities
                  </h3>
                  {communities && (
                    <div className="text-xs text-gray-400 mt-1">
                      {communitiesFetching ? 'Updating...' : 'Live data'}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['communities'] })}
                  className="p-1 rounded-md hover:bg-gray-100 transition-colors"
                  title="Refresh communities"
                  disabled={communitiesFetching}
                >
                  <svg 
                    className={`w-4 h-4 text-gray-400 ${communitiesFetching ? 'animate-spin' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
          <div className="space-y-1">
            {communitiesLoading ? (
              // Loading skeleton
              [...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-gray-200 rounded-full animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-20"></div>
                  </div>
                  <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
                </div>
              ))
            ) : communities && communities.length > 0 ? (
              communities.map((community) => {
                const isFollowed = followedCommunityIds.has(community.id);
                return (
                  <div
                    key={community.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                      isActive(`/community/${community.slug || community.id}`)
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Link
                      to={`/community/${community.slug || community.id}`}
                      className="flex items-center space-x-3 flex-1"
                    >
                      {community.profileImage ? (
                        <img 
                          src={community.profileImage} 
                          alt={community.name}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">o</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{community.name}</span>
                      </div>
                    </Link>
                    
                    {/* Star Icon for Follow/Unfollow */}
                    {user && (
                      <button
                        onClick={(e) => handleToggleFollow(community.id, e)}
                        disabled={followMutation.isPending}
                        className={`p-1 rounded-md transition-colors ${
                          followMutation.isPending ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200'
                        }`}
                      >
                        <svg 
                          className={`w-4 h-4 ${isFollowed ? 'text-yellow-500 fill-current' : 'text-gray-400'}`} 
                          fill={isFollowed ? 'currentColor' : 'none'} 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" 
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p className="text-sm">No communities available</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </aside>
  );
};

export default Sidebar;
