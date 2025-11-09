import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import { X } from 'lucide-react';

interface SidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onMobileClose }) => {
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Local state for optimistic updates
  const [optimisticFollows, setOptimisticFollows] = useState<Set<string>>(new Set());

  // Fetch all communities
  const { data: communities, isLoading: communitiesLoading, error: communitiesError } = useQuery({
    queryKey: ['communities'],
    queryFn: () => apiService.getCommunities(),
  });

  // Fetch user's followed communities
  const { data: followedCommunities } = useQuery({
    queryKey: ['user-communities'],
    queryFn: () => apiService.getUserCommunities(),
    enabled: !!user,
    retry: false, // Don't retry if it fails (e.g., user not logged in)
  });

  // Follow/unfollow community mutation
  const followMutation = useMutation({
    mutationFn: (communityId: string) => apiService.followCommunity(communityId),
    onSuccess: () => {
      // Invalidate and refetch user communities after successful mutation
      queryClient.invalidateQueries({ queryKey: ['user-communities'] });
      // Also invalidate communities to refresh any cached data
      queryClient.invalidateQueries({ queryKey: ['communities'] });
    },
    onError: (error) => {
      console.error('Follow/unfollow error:', error);
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: ['user-communities'] });
    },
  });

  const followedCommunityIds = new Set(followedCommunities?.map(c => c.id) || []);
  
  // Sync optimistic follows with actual data
  useEffect(() => {
    if (followedCommunities) {
      setOptimisticFollows(new Set(followedCommunities.map(c => c.id)));
    }
  }, [followedCommunities]);
  
  // Combined followed state (actual + optimistic)
  const combinedFollowedIds = new Set([...followedCommunityIds, ...optimisticFollows]);
  
  // Debug logging (reduced verbosity)
  // console.log('🔍 Debug Info:', {
  //   followedCommunities: followedCommunities,
  //   followedCommunityIds: Array.from(followedCommunityIds),
  //   optimisticFollows: Array.from(optimisticFollows),
  //   combinedFollowedIds: Array.from(combinedFollowedIds),
  //   communities: communities?.map(c => ({ id: c.id, name: c.name }))
  // });

  const handleToggleFollow = (communityId: string, event: React.MouseEvent) => {
    event.preventDefault(); // Prevent navigation when clicking star
    event.stopPropagation();
    if (!user) {
      return;
    }
    
    const isCurrentlyFollowed = combinedFollowedIds.has(communityId);
    
    // Immediate optimistic update for instant visual feedback
    if (isCurrentlyFollowed) {
      setOptimisticFollows(prev => {
        const newSet = new Set(prev);
        newSet.delete(communityId);
        return newSet;
      });
    } else {
      setOptimisticFollows(prev => {
        const newSet = new Set(prev);
        newSet.add(communityId);
        return newSet;
      });
    }
    
    // Trigger API call
    followMutation.mutate(communityId);
  };


  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`
        w-64 bg-white shadow-sm border-r border-gray-200 h-full overflow-y-auto
        fixed lg:static inset-y-0 left-0 z-50 lg:z-auto
        transform transition-transform duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-4">
          {/* Mobile Close Button */}
          <div className="flex justify-between items-center mb-4 lg:hidden">
            <h2 className="text-lg font-semibold text-gray-900">Menu</h2>
            <button
              onClick={onMobileClose}
              className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        {/* Navigation Links */}
        <nav className="space-y-2 mb-6">
          <Link
            to="/"
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive('/') ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`}
            onClick={onMobileClose}
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
            onClick={onMobileClose}
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
            onClick={onMobileClose}
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
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Communities
                </h3>
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
                const isFollowed = combinedFollowedIds.has(community.id);
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
                      onClick={onMobileClose}
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
                    
                    {/* Star Icon for Follow/Unfollow - Always visible, clickable only when logged in */}
                    <button
                      onClick={(e) => {
                        if (user) {
                          handleToggleFollow(community.id, e);
                        }
                      }}
                      disabled={!user || followMutation.isPending}
                      className={`p-1 rounded-md transition-colors ${
                        !user || followMutation.isPending 
                          ? 'opacity-50 cursor-not-allowed' 
                          : 'hover:bg-gray-200'
                      }`}
                      title={!user ? 'Sign in to follow communities' : isFollowed ? 'Unfollow' : 'Follow'}
                    >
                      <svg 
                        className={`w-4 h-4 ${isFollowed ? 'text-yellow-500 fill-current' : 'text-gray-400'}`} 
                        fill={isFollowed ? 'currentColor' : 'none'} 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                        style={{ filter: isFollowed ? 'drop-shadow(0 0 2px rgba(251, 191, 36, 0.5))' : 'none' }}
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" 
                        />
                      </svg>
                    </button>
                  </div>
                );
              })
            ) : communitiesError ? (
              <div className="text-center py-4 text-red-500">
                <p className="text-sm">Error loading communities</p>
                <p className="text-xs mt-1">Please try refreshing the page</p>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p className="text-sm">No communities available</p>
              </div>
            )}
          </div>
        </div>

        </div>
      </aside>
    </>
  );
};

export default Sidebar;
