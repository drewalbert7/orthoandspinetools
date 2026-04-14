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

  // Sync optimistic follows with actual data from API
  useEffect(() => {
    if (followedCommunities) {
      setOptimisticFollows(new Set(followedCommunities.map(c => c.id)));
    }
  }, [followedCommunities]);
  
  // Use optimisticFollows as display source of truth - it handles both follow (add) and unfollow (remove)
  // correctly. Union with followedCommunityIds was wrong: unfollow removed from optimisticFollows
  // but community stayed in followedCommunityIds, so star never unclicked.
  const combinedFollowedIds = optimisticFollows;
  
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

          <div>
            <Link
              to="/startups"
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                isActive('/startups') ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={onMobileClose}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="font-medium">Startups</span>
            </Link>
            <Link
              to="/create-post?mode=launch"
              className="mt-0.5 flex items-center gap-2 pl-11 pr-3 py-1.5 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
              onClick={onMobileClose}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Launch product
            </Link>
          </div>

          <a
            href="https://orthoandspinejobs.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            onClick={onMobileClose}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <span className="font-medium">Jobs</span>
          </a>

        </nav>

            {/* Communities Section */}
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  Communities
                </h3>
                {(user?.isAdmin || user?.canCreateCommunity) && (
                  <Link
                    to="/create-community"
                    onClick={onMobileClose}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 shrink-0"
                  >
                    + New
                  </Link>
                )}
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
                    
                    {/* Circle toggle for follow / unfollow */}
                    <button
                      type="button"
                      onClick={(e) => {
                        if (user) {
                          handleToggleFollow(community.id, e);
                        }
                      }}
                      disabled={!user || followMutation.isPending}
                      aria-pressed={isFollowed}
                      aria-label={
                        !user
                          ? 'Sign in to follow communities'
                          : isFollowed
                            ? `Unfollow ${community.name}`
                            : `Follow ${community.name}`
                      }
                      className={`no-touch-target flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                        !user || followMutation.isPending
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600'
                      }`}
                      title={!user ? 'Sign in to follow communities' : isFollowed ? 'Unfollow' : 'Follow'}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-4 w-4 ${isFollowed ? 'text-teal-600' : 'text-gray-400'}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={isFollowed ? 0 : 2}
                        aria-hidden
                      >
                        {isFollowed ? (
                          <circle cx="12" cy="12" r="8" fill="currentColor" stroke="none" />
                        ) : (
                          <circle cx="12" cy="12" r="8" fill="none" />
                        )}
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
