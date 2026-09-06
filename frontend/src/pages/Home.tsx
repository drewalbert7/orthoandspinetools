import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import { DocumentMeta } from '../components/DocumentMeta';
import { buildHomeJsonLd, SEO_DEFAULTS } from '../lib/seo';
import { useAuth } from '../contexts/AuthContext';
import FeedPostCard from '../components/FeedPostCard';

const Home: React.FC = () => {
  const { user } = useAuth();

  const homeJsonLd = useMemo(() => buildHomeJsonLd(), []);

  // Home should be a global feed across all communities.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['posts', 'home'],
    queryFn: () => apiService.getPosts({ limit: 20, sort: 'newest' }),
    staleTime: 30 * 1000, // 30 seconds - shorter cache for vote freshness
    refetchOnWindowFocus: true, // Refetch when user switches back to tab
  });

  // If global feed fetch fails for any reason, logged-in users can still see their feed.
  const { data: feedFallbackData, isLoading: feedFallbackLoading } = useQuery({
    queryKey: ['feed', 'home', 'fallback'],
    queryFn: () => apiService.getFeed({ limit: 20, sort: 'newest' }),
    enabled: !!user && isError,
    staleTime: 30 * 1000,
  });

  const posts = data?.posts?.length
    ? data.posts
    : (feedFallbackData?.posts || []);

  return (
    <div className="mx-auto min-w-0 max-w-4xl px-2 sm:px-4">
      <DocumentMeta
        title="Home"
        description={SEO_DEFAULTS.description}
        canonicalPath="/"
        jsonLd={homeJsonLd}
      />
      <div className="space-y-2 p-2 sm:p-4">
        {(isLoading || feedFallbackLoading) ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading posts...</span>
          </div>
        ) : isError && posts.length === 0 ? (
          <div className="bg-white border border-red-200 p-6 text-center">
            <p className="text-red-600 font-medium">Could not load posts</p>
            <p className="text-sm text-gray-500 mt-2">
              {error instanceof Error ? error.message : 'Please refresh and try again.'}
            </p>
          </div>
        ) : posts.length > 0 ? (
          posts.map((post) => (
            <FeedPostCard key={post.id} post={post} />
          ))
        ) : (
          <div className="bg-white border border-gray-200 p-6 text-center">
            <p className="text-gray-500">No posts available yet</p>
            <p className="text-sm text-gray-400 mt-2">Be the first to share something with the community!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
