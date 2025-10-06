import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiService, Community } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import { 
  Bold, 
  Italic, 
  Strikethrough, 
  Superscript, 
  Underline, 
  Link, 
  List, 
  ListOrdered, 
  AlertTriangle, 
  Quote, 
  Code, 
  Maximize2, 
  Grid3X3 
} from 'lucide-react';

type PostType = 'text' | 'images' | 'link' | 'poll';

const CreatePost: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedCommunity, setSelectedCommunity] = useState<string>('');
  const [postType, setPostType] = useState<PostType>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const [uploadedMedia, setUploadedMedia] = useState<Array<{ url: string; filename: string; originalName: string; type: 'image' | 'video' }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isMarkdownMode, setIsMarkdownMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      navigate('/');
    } catch (error: any) {
      setError(error.message || 'Failed to create post');
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
        uploadedFiles.push(...uploadedImages.map(img => ({ ...img, type: 'image' as const })));
      }

      // Upload videos if any
      if (videoFiles.length > 0) {
        const uploadedVideos = await apiService.uploadPostVideos(videoFiles);
        uploadedFiles.push(...uploadedVideos.map(vid => ({ ...vid, type: 'video' as const })));
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

  // Rich text editor functions
  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = body.substring(start, end);
    const newText = body.substring(0, start) + before + selectedText + after + body.substring(end);
    
    setBody(newText);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const formatText = (format: string) => {
    switch (format) {
      case 'bold':
        insertText('**', '**');
        break;
      case 'italic':
        insertText('*', '*');
        break;
      case 'strikethrough':
        insertText('~~', '~~');
        break;
      case 'underline':
        insertText('<u>', '</u>');
        break;
      case 'code':
        insertText('`', '`');
        break;
      case 'codeblock':
        insertText('```\n', '\n```');
        break;
      case 'quote':
        insertText('> ', '');
        break;
      case 'link':
        insertText('[', '](url)');
        break;
      case 'list':
        insertText('- ', '');
        break;
      case 'orderedlist':
        insertText('1. ', '');
        break;
      case 'alert':
        insertText('> [!WARNING]\n> ', '');
        break;
      case 'table':
        insertText('| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |', '');
        break;
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const isPostDisabled = !title.trim() || !selectedCommunity;

  // Rich Text Editor Toolbar Component
  const RichTextToolbar = () => (
    <div className="flex items-center space-x-1 p-2 border-b border-gray-200 bg-gray-50 rounded-t-md">
      {/* Bold */}
      <button
        type="button"
        onClick={() => formatText('bold')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Bold"
      >
        <Bold size={16} />
      </button>
      
      {/* Italic */}
      <button
        type="button"
        onClick={() => formatText('italic')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Italic"
      >
        <Italic size={16} />
      </button>
      
      {/* Strikethrough */}
      <button
        type="button"
        onClick={() => formatText('strikethrough')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Strikethrough"
      >
        <Strikethrough size={16} />
      </button>
      
      {/* Superscript */}
      <button
        type="button"
        onClick={() => insertText('^', '')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Superscript"
      >
        <Superscript size={16} />
      </button>
      
      {/* Underline */}
      <button
        type="button"
        onClick={() => formatText('underline')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Underline"
      >
        <Underline size={16} />
      </button>
      
      {/* Separator */}
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      
      {/* Link */}
      <button
        type="button"
        onClick={() => formatText('link')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Link"
      >
        <Link size={16} />
      </button>
      
      {/* Unordered List */}
      <button
        type="button"
        onClick={() => formatText('list')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Unordered List"
      >
        <List size={16} />
      </button>
      
      {/* Ordered List */}
      <button
        type="button"
        onClick={() => formatText('orderedlist')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Ordered List"
      >
        <ListOrdered size={16} />
      </button>
      
      {/* Separator */}
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      
      {/* Alert */}
      <button
        type="button"
        onClick={() => formatText('alert')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Alert"
      >
        <AlertTriangle size={16} />
      </button>
      
      {/* Quote */}
      <button
        type="button"
        onClick={() => formatText('quote')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Quote"
      >
        <Quote size={16} />
      </button>
      
      {/* Code */}
      <button
        type="button"
        onClick={() => formatText('code')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Code"
      >
        <Code size={16} />
      </button>
      
      {/* Fullscreen */}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Fullscreen"
      >
        <Maximize2 size={16} />
      </button>
      
      {/* Table */}
      <button
        type="button"
        onClick={() => formatText('table')}
        className="p-2 hover:bg-gray-200 rounded transition-colors"
        title="Table"
      >
        <Grid3X3 size={16} />
      </button>
      
      {/* Separator */}
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      
      {/* Markdown Toggle */}
      <button
        type="button"
        onClick={() => setIsMarkdownMode(!isMarkdownMode)}
        className={`px-3 py-1 text-sm rounded transition-colors ${
          isMarkdownMode 
            ? 'bg-blue-100 text-blue-700 border border-blue-200' 
            : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
        }`}
      >
        Switch to Markdown Editor
      </button>
    </div>
  );

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
                  {selectedCommunity ? `o/${communities?.find(c => c.slug === selectedCommunity)?.name || selectedCommunity}` : 'Choose a community'}
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
                        setSelectedCommunity(community.slug);
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


        {/* Content based on post type */}
        {postType === 'text' && (
          <div className="mb-6">
            <div className={`border border-gray-300 rounded-md ${isFullscreen ? 'fixed inset-4 z-50 bg-white' : ''}`}>
              <RichTextToolbar />
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Body text (optional)"
                  rows={isFullscreen ? 20 : 12}
                  className={`w-full px-4 py-3 border-0 focus:outline-none resize-y ${isFullscreen ? 'min-h-screen' : 'min-h-48'}`}
                  style={{ resize: 'vertical' }}
                />
                {/* Resize handle indicator */}
                <div className="absolute bottom-2 right-2 text-gray-400 pointer-events-none">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M11 11L1 1M11 11H6M11 11V6" stroke="currentColor" strokeWidth="1" fill="none"/>
                  </svg>
                </div>
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
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors relative cursor-pointer"
                  onClick={() => {
                    if (!isUploading && postType === 'images') {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600">Drag and Drop or upload media</p>
                  {postType === 'images' && (
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      onChange={handleMediaUpload}
                      disabled={isUploading}
                      className="hidden"
                    />
                  )}
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

              {/* Optional Text */}
              <div className="border border-gray-300 rounded-md">
                <RichTextToolbar />
                <div className="relative">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Body text (optional)"
                    rows={6}
                    className="w-full px-4 py-3 border-0 focus:outline-none resize-y min-h-32"
                    style={{ resize: 'vertical' }}
                  />
                  {/* Resize handle indicator */}
                  <div className="absolute bottom-2 right-2 text-gray-400 pointer-events-none">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M11 11L1 1M11 11H6M11 11V6" stroke="currentColor" strokeWidth="1" fill="none"/>
                    </svg>
                  </div>
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