import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, Community } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';

const CommunitySettings: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);

  // Fetch community details
  const { data: community, isLoading } = useQuery<Community>({
    queryKey: ['community', slug],
    queryFn: () => apiService.getCommunity(slug!),
    enabled: !!slug,
  });

  // Update community mutation
  const updateMutation = useMutation({
    mutationFn: (data: { profileImage?: string; bannerImage?: string; description?: string }) => 
      apiService.updateCommunity(community!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community', slug] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
    },
  });

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !community) return;

    setIsUploading(true);
    try {
      // Upload image to server
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await fetch('/api/upload/community-image', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const { imageUrl } = await response.json();
      
      // Update community with new image URL
      updateMutation.mutate({ profileImage: imageUrl });
    } catch (error) {
      console.error('Image upload failed:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !community) return;

    setIsUploading(true);
    try {
      const result = await apiService.uploadCommunityBanner(file);
      
      // Update community with new banner URL
      updateMutation.mutate({ bannerImage: result.imageUrl });
      
    } catch (error) {
      console.error('Error uploading banner:', error);
      alert('Failed to upload banner. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = () => {
    if (!community) return;
    updateMutation.mutate({ profileImage: '' });
  };

  const handleRemoveBanner = () => {
    if (!community) return;
    updateMutation.mutate({ bannerImage: '' });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading settings...</span>
        </div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Community not found</h1>
          <p className="text-gray-600 mb-4">The community "o/{slug}" doesn't exist.</p>
          <button 
            onClick={() => navigate(-1)}
            className="text-blue-600 hover:text-blue-800"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  // Check if user has permission to edit
  const canEdit = user && (community.ownerId === user.id || community.moderators?.some(mod => mod.userId === user.id) || user.isAdmin);
  
  if (!canEdit) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">You don't have permission to edit this community.</p>
          <button 
            onClick={() => navigate(`/community/${community.slug}`)}
            className="text-blue-600 hover:text-blue-800"
          >
            Go back to community
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Community Settings</h1>
            <p className="text-gray-600">Manage o/{community.name}</p>
          </div>
          <button 
            onClick={() => navigate(`/community/${community.slug}`)}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Back to Community
          </button>
        </div>

        {/* Profile Picture Section */}
        <div className="border-b border-gray-200 pb-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Picture</h2>
          
          <div className="flex items-center space-x-6">
            {/* Current Profile Picture */}
            <div className="flex-shrink-0">
              {community.profileImage ? (
                <img 
                  src={community.profileImage} 
                  alt={community.name}
                  className="w-20 h-20 rounded-full object-cover border-4 border-gray-200"
                />
              ) : (
                <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center border-4 border-gray-200">
                  <span className="text-white font-bold text-2xl">o/</span>
                </div>
              )}
            </div>

            {/* Upload Controls */}
            <div className="flex-1">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload New Picture
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={isUploading || updateMutation.isPending}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Recommended size: 200x200px. Max file size: 5MB
                  </p>
                </div>

                {community.profileImage && (
                  <button
                    onClick={handleRemoveImage}
                    disabled={isUploading || updateMutation.isPending}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                  >
                    Remove Picture
                  </button>
                )}

                {(isUploading || updateMutation.isPending) && (
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                    {isUploading ? 'Uploading...' : 'Saving...'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Banner Section */}
        <div className="border-b border-gray-200 pb-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Banner Image</h2>
          
          <div className="space-y-4">
            {/* Current Banner */}
            <div>
              {community.bannerImage ? (
                <div className="relative">
                  <img 
                    src={community.bannerImage} 
                    alt={`${community.name} banner`}
                    className="w-full h-32 object-cover rounded-md border border-gray-200"
                  />
                  <button
                    onClick={handleRemoveBanner}
                    disabled={isUploading || updateMutation.isPending}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors disabled:opacity-50"
                    title="Remove banner"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="w-full h-32 bg-gray-100 rounded-md border-2 border-dashed border-gray-300 flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-gray-500">No banner image</p>
                  </div>
                </div>
              )}
            </div>

            {/* Upload Controls */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Banner Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleBannerUpload}
                disabled={isUploading || updateMutation.isPending}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 mt-1">
                Recommended size: 1920x300px. Max file size: 5MB
              </p>
            </div>
          </div>
        </div>

        {/* Community Info Section */}
        <div className="border-b border-gray-200 pb-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Community Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Community Name
              </label>
              <input
                type="text"
                value={community.name}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">Community name cannot be changed</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Slug
              </label>
              <input
                type="text"
                value={community.slug}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">Community slug cannot be changed</p>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={community.description}
              disabled
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
            />
            <p className="text-xs text-gray-500 mt-1">Description editing coming soon</p>
          </div>
        </div>

        {/* Stats Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Community Stats</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-2xl font-bold text-gray-900">{community.memberCount || 0}</div>
              <div className="text-sm text-gray-500">Members</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-2xl font-bold text-gray-900">{community.postCount || 0}</div>
              <div className="text-sm text-gray-500">Posts</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-2xl font-bold text-gray-900">{community.weeklyVisitors || 0}</div>
              <div className="text-sm text-gray-500">Weekly Visitors</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-2xl font-bold text-gray-900">{community.weeklyContributions || 0}</div>
              <div className="text-sm text-gray-500">Weekly Contributions</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunitySettings;
