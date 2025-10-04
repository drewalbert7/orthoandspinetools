import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiService, Community } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';

type PostType = 'text' | 'images' | 'link' | 'poll';

const CreatePost: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedCommunity, setSelectedCommunity] = useState<string>('');
  const [postType, setPostType] = useState<PostType>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isMarkdownMode, setIsMarkdownMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch communities
  const { data: communities, isLoading: communitiesLoading } = useQuery<Community[]>({
    queryKey: ['communities'],
    queryFn: () => apiService.getCommunities(),
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCommunityDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Redirect if not authenticated
  if (!user) {
    navigate('/login');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedCommunity) return;
    
    setIsSubmitting(true);
    setError('');
    
    try {
      // Map frontend post types to backend post types
      const backendPostType = postType === 'text' ? 'discussion' : 
                             postType === 'images' ? 'case_study' : 
                             postType === 'link' ? 'tool_review' : 'discussion';
      
      const postData = {
        title: title.trim(),
        content: postType === 'link' ? linkUrl : body.trim(),
        postType: backendPostType as 'discussion' | 'case_study' | 'tool_review',
        communityId: selectedCommunity,
        specialty: user.specialty,
      };
      
      console.log('Creating post:', postData);
      await apiService.createPost(postData);
      
      // Navigate to the community page or home
      const selectedCommunityData = communities?.find(c => c.id === selectedCommunity);
      if (selectedCommunityData) {
        navigate(`/community/${selectedCommunityData.slug || selectedCommunityData.id}`);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      console.error('Error creating post:', err);
      setError(err.message || 'Failed to create post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    // TODO: Implement draft saving
    console.log('Saving draft...');
  };

  const isPostDisabled = !title.trim() || !selectedCommunity;

  return (
    <div className="max-w-4xl mx-auto bg-white">
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create post</h1>
          <button className="text-blue-600 hover:text-blue-800 font-medium">
            Drafts
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Community Selection */}
        <div className="mb-6">
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setShowCommunityDropdown(!showCommunityDropdown)}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-md hover:border-gray-400 transition-colors w-full"
            >
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">r/</span>
              </div>
              <span className="text-gray-700 flex-1 text-left">
                {selectedCommunity ? 
                  communities?.find(c => c.id === selectedCommunity)?.name || 'Unknown Community' : 
                  'Select a community'
                }
              </span>
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showCommunityDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                {communitiesLoading ? (
                  <div className="px-4 py-2 text-gray-500">Loading communities...</div>
                ) : communities && communities.length > 0 ? (
                  communities.map((community) => (
                    <button
                      key={community.id}
                      onClick={() => {
                        setSelectedCommunity(community.id);
                        setShowCommunityDropdown(false);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-2"
                    >
                      <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">r/</span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">r/{community.name}</div>
                        <div className="text-sm text-gray-500">{community.description}</div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-2 text-gray-500">No communities available</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Post Type Tabs */}
        <div className="mb-6">
          <div className="flex space-x-1 border-b border-gray-200">
            {[
              { id: 'text', label: 'Text' },
              { id: 'images', label: 'Images & Video' },
              { id: 'link', label: 'Link' },
              { id: 'poll', label: 'Poll' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPostType(tab.id as PostType)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  postType === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                } ${tab.id === 'poll' ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={tab.id === 'poll'}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title Input */}
        <div className="mb-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title*"
            className="w-full px-4 py-3 text-lg border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={300}
          />
          <div className="flex justify-end mt-1">
            <span className="text-sm text-gray-500">{title.length}/300</span>
          </div>
        </div>

        {/* Tags Section */}
        <div className="mb-4">
          <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors">
            Add tags
          </button>
        </div>

        {/* Content Area */}
        {postType === 'text' && (
          <div className="mb-6">
            {/* Rich Text Editor Toolbar */}
            <div className="flex items-center space-x-2 p-2 border border-gray-300 border-b-0 rounded-t-md bg-gray-50">
              <button className="p-1 hover:bg-gray-200 rounded">
                <span className="font-bold text-sm">B</span>
              </button>
              <button className="p-1 hover:bg-gray-200 rounded">
                <span className="italic text-sm">i</span>
              </button>
              <button className="p-1 hover:bg-gray-200 rounded">
                <span className="line-through text-sm">S</span>
              </button>
              <button className="p-1 hover:bg-gray-200 rounded">
                <span className="text-sm">X²</span>
              </button>
              <button className="p-1 hover:bg-gray-200 rounded">
                <span className="text-sm">T</span>
              </button>
              <div className="w-px h-6 bg-gray-300"></div>
              <button className="p-1 hover:bg-gray-200 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
              <button className="p-1 hover:bg-gray-200 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <button className="p-1 hover:bg-gray-200 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6-8h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" />
                </svg>
              </button>
              <div className="w-px h-6 bg-gray-300"></div>
              <button className="p-1 hover:bg-gray-200 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button className="p-1 hover:bg-gray-200 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </button>
              <button className="p-1 hover:bg-gray-200 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </button>
              <button className="p-1 hover:bg-gray-200 rounded">
                <span className="text-sm">99</span>
              </button>
              <button className="p-1 hover:bg-gray-200 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
              <div className="flex-1"></div>
              <button
                onClick={() => setIsMarkdownMode(!isMarkdownMode)}
                className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Switch to Markdown Editor
              </button>
            </div>

            {/* Text Area */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Body text (optional)"
              className="w-full px-4 py-3 border border-gray-300 border-t-0 rounded-b-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={12}
            />
          </div>
        )}

        {postType === 'link' && (
          <div className="mb-6">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Url"
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}

        {postType === 'images' && (
          <div className="mb-6">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="mt-2 text-sm text-gray-600">Drag and drop images here, or click to select</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleSaveDraft}
            disabled={isSubmitting}
            className="px-6 py-2 text-gray-600 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPostDisabled || isSubmitting}
            className={`px-6 py-2 rounded-full font-medium transition-colors ${
              isPostDisabled || isSubmitting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Posting...</span>
              </div>
            ) : (
              'Post'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePost;
