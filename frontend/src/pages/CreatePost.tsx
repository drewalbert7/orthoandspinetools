import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiService, Community } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

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
  const [uploadedMedia, setUploadedMedia] = useState<Array<{ url: string; filename: string; originalName: string; type: 'image' | 'video' }>>([]);
  const [isUploading, setIsUploading] = useState(false);
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
      // Map postType to backend format
      const getPostType = (type: PostType): 'discussion' | 'case_study' | 'tool_review' => {
        switch (type) {
          case 'text':
          case 'link':
          case 'poll':
            return 'discussion';
          case 'images':
            return 'case_study';
          default:
            return 'discussion';
        }
      };

      const postData = {
        title: title.trim(),
        content: body.trim(),
        communityId: selectedCommunity,
        postType: getPostType(postType),
        ...(postType === 'link' && { linkUrl }),
        ...(postType === 'images' && { media: uploadedMedia }),
      };

      await apiService.createPost(postData);
      toast.success('Post created successfully!');
      navigate('/');
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to create post';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    // TODO: Implement draft saving
    console.log('Saving draft...');
  };

  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      // Separate images and videos
      const imageFiles = files.filter(file => file.type.startsWith('image/'));
      const videoFiles = files.filter(file => file.type.startsWith('video/'));

      const uploadedFiles: Array<{ url: string; filename: string; originalName: string; type: 'image' | 'video' }> = [];

      // Upload images if any
      if (imageFiles.length > 0) {
        const uploadedImages = await apiService.uploadPostImages(imageFiles);
        uploadedFiles.push(...uploadedImages.map(img => ({ 
          url: img.cloudinaryUrl || img.path,
          filename: img.filename,
          originalName: img.originalName,
          type: 'image' as const 
        })));
      }

      // Upload videos if any
      if (videoFiles.length > 0) {
        const uploadedVideos = await apiService.uploadPostVideos(videoFiles);
        uploadedFiles.push(...uploadedVideos.map(vid => ({ 
          url: vid.cloudinaryUrl || vid.path,
          filename: vid.filename,
          originalName: vid.originalName,
          type: 'video' as const 
        })));
      }

      setUploadedMedia(prev => [...prev, ...uploadedFiles]);
    } catch (error) {
      console.error('Error uploading media:', error);
      alert('Failed to upload media. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const removeMedia = (filename: string) => {
    setUploadedMedia(prev => prev.filter(media => media.filename !== filename));
  };

  const isPostDisabled = !title.trim() || !selectedCommunity;


  return (
    <div className="max-w-4xl mx-auto bg-white min-h-screen">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
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
              className="w-full px-4 py-3 border border-gray-300 rounded-full bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">A</span>
                </div>
                <span className="text-gray-700">
                  {selectedCommunity ? `o/${communities?.find(c => c.id === selectedCommunity)?.name || selectedCommunity}` : 'Choose a community'}
                </span>
                <svg className="w-5 h-5 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {showCommunityDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {communitiesLoading ? (
                  <div className="p-3 text-center text-gray-500">Loading communities...</div>
                ) : (
                  communities?.map((community) => (
                    <button
                      key={community.id}
                      onClick={() => {
                        setSelectedCommunity(community.id);
                        setShowCommunityDropdown(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center space-x-3"
                    >
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">o/</span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">o/{community.name}</div>
                        <div className="text-sm text-gray-500">{community.description}</div>
                      </div>
                    </button>
                  ))
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
                className={`px-4 py-2 text-sm font-medium ${
                  postType === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title Input */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title*"
              maxLength={300}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            />
            <div className="absolute bottom-2 right-3 text-xs text-gray-400">
              {title.length}/300
            </div>
          </div>
        </div>

        {/* Add Tags Button */}
        <div className="mb-6">
          <button className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors">
            Add tags
          </button>
        </div>

        {/* Content based on post type */}
        {postType === 'text' && (
          <div className="mb-6">
            {/* Formatting Toolbar */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-1">
                {/* Bold */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="Bold">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
                  </svg>
                </button>
                {/* Italic */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="Italic">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8z"/>
                  </svg>
                </button>
                {/* Strikethrough */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="Strikethrough">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V4h5V2H5v2zm2.5 7c-.83 0-1.5-.67-1.5-1.5S6.67 8 7.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                  </svg>
                </button>
                {/* Superscript */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="Superscript">
                  <span className="text-sm font-bold">X²</span>
                </button>
                {/* Code */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="Code">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
                  </svg>
                </button>
                {/* Link */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="Link">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                  </svg>
                </button>
                {/* Image */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="Image">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                  </svg>
                </button>
                {/* Video */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="Video">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                  </svg>
                </button>
                {/* Bullet List */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="Bullet List">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/>
                  </svg>
                </button>
                {/* Numbered List */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="Numbered List">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/>
                  </svg>
                </button>
                {/* Quote */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="Quote">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
                  </svg>
                </button>
                {/* More */}
                <button className="p-2 hover:bg-gray-100 rounded-md" title="More">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                </button>
              </div>
              <button
                onClick={() => setIsMarkdownMode(!isMarkdownMode)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Switch to Markdown Editor
              </button>
            </div>
            
            {/* Text Area */}
            <div className="relative">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Body text (optional)"
                rows={12}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              {/* Resize handle */}
              <div className="absolute bottom-2 right-2 w-3 h-3">
                <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM18 18H16V16H18V18ZM14 22H12V20H14V22ZM22 14H20V12H22V14Z"/>
                </svg>
              </div>
            </div>
          </div>
        )}

        {postType === 'link' && (
          <div className="mb-6">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="URL"
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}

        {postType === 'images' && (
          <div className="mb-6">
            <div className="space-y-6">
              {/* Upload Area */}
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600">Drag and Drop or upload media</p>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleMediaUpload}
                    disabled={isUploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {isUploading && (
                    <div className="mt-4 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                      <span className="text-sm text-gray-600">Uploading media...</span>
                    </div>
                  )}
                </div>

                {/* Uploaded Media Preview */}
                {uploadedMedia.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Uploaded Media ({uploadedMedia.length})</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {uploadedMedia.map((media, index) => (
                        <div key={index} className="relative group">
                          {media.type === 'image' ? (
                            <img
                              src={media.url}
                              alt={media.originalName}
                              className="w-full h-32 object-cover rounded-md border border-gray-200"
                            />
                          ) : (
                            <video
                              src={media.url}
                              className="w-full h-32 object-cover rounded-md border border-gray-200"
                              controls
                            />
                          )}
                          <button
                            onClick={() => removeMedia(media.filename)}
                            className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove media"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <p className="text-xs text-gray-500 mt-1 truncate">{media.originalName}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Text Editor Section */}
              <div className="space-y-3">
                {/* Formatting Toolbar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    {/* Bold */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Bold">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
                      </svg>
                    </button>
                    {/* Italic */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Italic">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8z"/>
                      </svg>
                    </button>
                    {/* Strikethrough */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Strikethrough">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V4h5V2H5v2zm2.5 7c-.83 0-1.5-.67-1.5-1.5S6.67 8 7.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                      </svg>
                    </button>
                    {/* Superscript */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Superscript">
                      <span className="text-sm font-bold">X²</span>
                    </button>
                    {/* Text Color */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Text Color">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                    </button>
                    {/* Link */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Link">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                      </svg>
                    </button>
                    {/* Bullet List */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Bullet List">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/>
                      </svg>
                    </button>
                    {/* Numbered List */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Numbered List">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/>
                      </svg>
                    </button>
                    {/* Quote */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Quote">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
                      </svg>
                    </button>
                    {/* Code Block */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Code Block">
                      <span className="text-sm font-bold">99</span>
                    </button>
                    {/* Inline Code */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Inline Code">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
                      </svg>
                    </button>
                    {/* Table */}
                    <button className="p-2 hover:bg-gray-100 rounded-md" title="Table">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2z"/>
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={() => setIsMarkdownMode(!isMarkdownMode)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Switch to Markdown Editor
                  </button>
                </div>
                
                {/* Text Area */}
                <div className="relative">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Body text (optional)"
                    rows={8}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}


        {postType === 'poll' && (
          <div className="mb-6">
            <div className="text-center py-8 text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-lg font-medium">Poll functionality coming soon</p>
              <p className="text-sm">This feature is under development</p>
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
            {isSubmitting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePost;