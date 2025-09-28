import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/apiService';

const Community: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  // Fetch community details
  const { data: communityData, isLoading: communityLoading } = useQuery({
    queryKey: ['community', id],
    queryFn: () => apiService.getCommunity(id!),
    enabled: !!id,
  });

  // Fetch posts for this community
  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['posts', 'community', id],
    queryFn: () => apiService.getPosts({ community: id! }).then((res) => res.posts),
    enabled: !!id,
  });

  if (communityLoading || postsLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-gray-500">Loading community...</div>
      </div>
    );
  }

  const community = communityData;
  const posts = postsData || [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Community Header */}
      <div className="bg-white border border-gray-200 rounded-md p-6 mb-4">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-2xl">
              {(community as any)?.icon || '🦴'}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">r/{community?.name || id}</h1>
            <p className="text-gray-600">
              {(community as any)?.memberCount?.toLocaleString() || '0'} members
            </p>
            {community?.description && (
              <p className="text-gray-700 mt-2">{community.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-4">
        {posts.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-md p-8 text-center">
            <p className="text-gray-500">No posts in this community yet.</p>
            <p className="text-sm text-gray-400 mt-2">Be the first to share something!</p>
          </div>
        ) : (
          posts.map((post: any) => (
            <div key={post.id} className="bg-white border border-gray-200 rounded-md p-4">
              <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                <span>Posted by u/{post.author?.username || 'Unknown'}</span>
                <span>•</span>
                <span>{new Date(post.createdAt).toLocaleDateString()}</span>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{post.title}</h2>
              {post.content && (
                <p className="text-gray-700 mb-3">{post.content}</p>
              )}
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span>{post._count?.comments || 0} comments</span>
                <span>{post.voteScore || 0} votes</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Community;
