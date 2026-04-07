import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import FeedPostCard from '../components/FeedPostCard';

const STARTUP_TAG_MATCH = 'startup';

type SortOption = 'best' | 'hot' | 'newest' | 'top' | 'rising';

const Startups: React.FC = () => {
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [selectedCommunity, setSelectedCommunity] = useState<string>('all');

  const { data: communities } = useQuery({
    queryKey: ['communities'],
    queryFn: () => apiService.getCommunities(),
  });

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['startups-posts', sortBy, selectedCommunity],
    queryFn: () => {
      const params: {
        limit: number;
        sort: SortOption;
        tagMatch: string;
        community?: string;
      } = {
        limit: 25,
        sort: sortBy,
        tagMatch: STARTUP_TAG_MATCH,
      };
      if (selectedCommunity !== 'all') {
        params.community = selectedCommunity;
      }
      return apiService.getPosts(params);
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const posts = postsData?.posts || [];

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'best', label: 'Best' },
    { value: 'hot', label: 'Hot' },
    { value: 'newest', label: 'New' },
    { value: 'top', label: 'Top' },
    { value: 'rising', label: 'Rising' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4">
      <div className="bg-white border border-gray-200 p-3 sm:p-4 mb-4">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Startups</h1>
            <p className="text-sm text-gray-600 mt-1">
              Posts tagged with the Startup topic (or any topic whose name or description contains “startup”)
              across communities. Every community has a default Startup topic tag on the create-post screen.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-4">
            <div className="relative w-full sm:w-auto">
              <select
                value={selectedCommunity}
                onChange={(e) => setSelectedCommunity(e.target.value)}
                className="w-full sm:w-auto appearance-none bg-white border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All communities</option>
                {communities?.map((community) => (
                  <option key={community.id} value={community.id}>
                    {community.name}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <div className="relative w-full sm:w-auto">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full sm:w-auto appearance-none bg-white border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 p-2 sm:p-4">
        {postsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading posts...</span>
          </div>
        ) : posts.length > 0 ? (
          posts.map((post) => <FeedPostCard key={post.id} post={post} />)
        ) : (
          <div className="bg-white border border-gray-200 p-4 sm:p-6 text-center">
            <p className="text-gray-500">No startup-tagged posts yet</p>
            <p className="text-sm text-gray-400 mt-2">
              Create a post and select the Startup topic tag (available in every community). Moderators can add
              more tags in community settings.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Startups;
