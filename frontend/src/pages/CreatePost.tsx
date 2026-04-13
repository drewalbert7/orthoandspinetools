/**
 * ⚠️ CRITICAL FILE - DO NOT DELETE OR MODIFY WITHOUT BACKUP ⚠️
 * 
 * This is the CreatePost page component - a fully functional Reddit-style post creation page.
 * This file was previously accidentally deleted and had to be restored from git history.
 * 
 * PROTECTION MEASURES:
 * - This file is essential for the application to function
 * - Contains: Community selection, post type tabs, rich text editor, media upload, tag selection
 * - Route: /create-post (defined in App.tsx)
 * - Dependencies: MarkdownEditor, apiService, AuthContext
 * 
 * If you need to modify this file:
 * 1. Create a backup first: cp frontend/src/pages/CreatePost.tsx frontend/src/pages/CreatePost.tsx.backup
 * 2. Test thoroughly after changes
 * 3. Ensure the route in App.tsx still references this component
 * 
 * Last verified complete: December 8, 2025
 * File size should be > 800 lines (currently ~851 lines)
 */

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService, apiErrorMessage, Community, CommunityTag } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import MarkdownEditor, { MarkdownEditorHandle } from '../components/MarkdownEditor';
import PostEditorToolbar from '../components/PostEditorToolbar';


type PostType = 'text' | 'images';

type UploadedPostMedia = {
  url: string;
  filename: string;
  originalName: string;
  type: 'image' | 'video';
  mimetype: string;
  size: number;
  cloudinaryPublicId?: string;
  optimizedUrl?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
};

const CreatePost: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isLaunchMode = searchParams.get('mode') === 'launch';
  const [selectedCommunity, setSelectedCommunity] = useState<string>('');
  const [postType, setPostType] = useState<PostType>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [productUrl, setProductUrl] = useState('');
  // false = rich MarkdownEditor (formatting toolbar works). true = plain textarea for raw Markdown only.
  const [isMarkdownMode, setIsMarkdownMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const [communityMenuRect, setCommunityMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [uploadedMedia, setUploadedMedia] = useState<UploadedPostMedia[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const communityButtonRef = useRef<HTMLButtonElement>(null);
  const communityMenuPortalRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const imagesEditorRef = useRef<MarkdownEditorHandle | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const appliedCommunityParamRef = useRef<string | null>(null);

  // Fetch communities
  const { data: communities, isLoading: communitiesLoading } = useQuery<Community[]>({
    queryKey: ['communities'],
    queryFn: () => apiService.getCommunities(),
  });

  // Fetch tags for selected community
  const { data: communityTags } = useQuery<CommunityTag[]>({
    queryKey: ['communityTags', selectedCommunity],
    queryFn: () => apiService.getCommunityTags(selectedCommunity),
    enabled: !!selectedCommunity,
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  const { data: postingCommunity } = useQuery<Community>({
    queryKey: ['community', selectedCommunity],
    queryFn: () => apiService.getCommunity(selectedCommunity),
    enabled: !!selectedCommunity,
  });

  const canManageTopicTags =
    !!user &&
    !!postingCommunity &&
    (user.id === postingCommunity.ownerId ||
      !!postingCommunity.moderators?.some((m) => m.userId === user.id) ||
      !!user.isAdmin);

  const postingCommunitySlug =
    postingCommunity?.slug || communities?.find((c) => c.id === selectedCommunity)?.slug;

  const { data: uploadStatus } = useQuery({
    queryKey: ['uploadStatus'],
    queryFn: () => apiService.getUploadStatus(),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const communityFromUrl = (searchParams.get('community') || '').trim();

  useEffect(() => {
    if (!communities?.length || !communityFromUrl) return;
    if (appliedCommunityParamRef.current === communityFromUrl) return;
    const match = communities.find(
      (c) => c.id === communityFromUrl || c.slug === communityFromUrl
    );
    if (match) {
      setSelectedCommunity(match.id);
      appliedCommunityParamRef.current = communityFromUrl;
    }
  }, [communities, communityFromUrl]);

  useEffect(() => {
    if (isLaunchMode) {
      setPostType('text');
    }
  }, [isLaunchMode]);

  useEffect(() => {
    if (!selectedCommunity) {
      setSelectedTags([]);
      return;
    }
    if (!isLaunchMode) {
      setSelectedTags([]);
      return;
    }
    if (!communityTags?.length) {
      setSelectedTags([]);
      return;
    }
    const hay = (s: string | undefined) => (s || '').toLowerCase();
    const startupTag = communityTags.find(
      (t) => hay(t.name).includes('startup') || hay(t.description).includes('startup')
    );
    setSelectedTags(startupTag?.id ? [startupTag.id] : []);
  }, [selectedCommunity, isLaunchMode, communityTags]);

  useLayoutEffect(() => {
    if (!showCommunityDropdown) {
      setCommunityMenuRect(null);
      return;
    }
    const updateRect = () => {
      const btn = communityButtonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setCommunityMenuRect({
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
      });
    };
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [showCommunityDropdown]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (dropdownRef.current?.contains(t)) return;
      if (communityMenuPortalRef.current?.contains(t)) return;
      setShowCommunityDropdown(false);
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

    if (isLaunchMode) {
      if (uploadedMedia.length === 0) {
        toast.error('Add at least one image or video for your product launch.');
        return;
      }
      if (!body.trim()) {
        toast.error('Add a description for your product.');
        return;
      }
      let normalizedProductUrl: string;
      try {
        const u = new URL(productUrl.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          throw new Error('invalid protocol');
        }
        normalizedProductUrl = u.toString();
      } catch {
        toast.error('Enter a valid product URL (https or http).');
        return;
      }
      setIsSubmitting(true);
      setError('');
      try {
        const validTagIds = selectedTags.filter((id) => id && typeof id === 'string' && id.trim().length > 0);
        await apiService.createPost({
          title: title.trim(),
          content: body.trim(),
          communityId: selectedCommunity,
          postType: 'link',
          linkUrl: normalizedProductUrl,
          attachments: uploadedMedia.map((m) => ({
            url: m.url,
            filename: m.filename,
            originalName: m.originalName,
            mimetype: m.mimetype,
            size: m.size,
            ...(m.cloudinaryPublicId && { cloudinaryPublicId: m.cloudinaryPublicId }),
            ...(m.optimizedUrl && { optimizedUrl: m.optimizedUrl }),
            ...(m.thumbnailUrl && { thumbnailUrl: m.thumbnailUrl }),
            ...(m.width != null && { width: m.width }),
            ...(m.height != null && { height: m.height }),
            ...(m.duration != null && { duration: m.duration }),
          })),
          ...(validTagIds.length > 0 && { tagIds: validTagIds }),
        });
        await queryClient.invalidateQueries({ queryKey: ['posts'] });
        await queryClient.invalidateQueries({ queryKey: ['feed'] });
        await queryClient.invalidateQueries({ queryKey: ['startups-posts'] });
        await queryClient.invalidateQueries({ queryKey: ['community-startup-launches'] });
        toast.success('Product launch posted.');
        navigate('/startups');
      } catch (error: unknown) {
        const errorMessage = apiErrorMessage(error, 'Failed to publish launch');
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (postType === 'images' && uploadedMedia.length === 0) {
      toast.error('Add at least one image or video before posting.');
      return;
    }
    setIsSubmitting(true);
    setError('');

    try {
      // Filter out invalid tag IDs before sending
      const validTagIds = selectedTags.filter((id) => id && typeof id === 'string' && id.trim().length > 0);

      const hasUploadedMedia = postType === 'images' && uploadedMedia.length > 0;

      const apiPostType: 'discussion' | 'case_study' =
        postType === 'images' ? 'case_study' : 'discussion';

      const postData = {
        title: title.trim(),
        content: body.trim(),
        communityId: selectedCommunity,
        postType: apiPostType,
        ...(hasUploadedMedia && {
          attachments: uploadedMedia.map((m) => ({
            url: m.url,
            filename: m.filename,
            originalName: m.originalName,
            mimetype: m.mimetype,
            size: m.size,
            ...(m.cloudinaryPublicId && { cloudinaryPublicId: m.cloudinaryPublicId }),
            ...(m.optimizedUrl && { optimizedUrl: m.optimizedUrl }),
            ...(m.thumbnailUrl && { thumbnailUrl: m.thumbnailUrl }),
            ...(m.width != null && { width: m.width }),
            ...(m.height != null && { height: m.height }),
            ...(m.duration != null && { duration: m.duration }),
          })),
        }),
        ...(validTagIds.length > 0 && { tagIds: validTagIds }),
      };

      await apiService.createPost(postData);
      await queryClient.invalidateQueries({ queryKey: ['posts'] });
      await queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast.success('Post created successfully!');
      navigate('/');
    } catch (error: unknown) {
      const errorMessage = apiErrorMessage(error, 'Failed to create post');
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

      const uploadedFiles: UploadedPostMedia[] = [];

      // Upload images if any
      if (imageFiles.length > 0) {
        const uploadedImages = await apiService.uploadPostImages(imageFiles);
        uploadedFiles.push(
          ...uploadedImages.map((img) => ({
            url: img.cloudinaryUrl || img.path,
            filename: img.filename,
            originalName: img.originalName,
            type: 'image' as const,
            mimetype: img.mimetype || 'image/jpeg',
            size: img.size ?? 0,
            cloudinaryPublicId: img.cloudinaryPublicId,
            optimizedUrl: img.optimizedUrl,
            thumbnailUrl: img.thumbnailUrl,
            width: img.width,
            height: img.height,
          }))
        );
      }

      // Upload videos if any
      if (videoFiles.length > 0) {
        const uploadedVideos = await apiService.uploadPostVideos(videoFiles);
        uploadedFiles.push(
          ...uploadedVideos.map((vid) => ({
            url: vid.cloudinaryUrl || vid.path,
            filename: vid.filename,
            originalName: vid.originalName,
            type: 'video' as const,
            mimetype: vid.mimetype || 'video/mp4',
            size: vid.size ?? 0,
            cloudinaryPublicId: vid.cloudinaryPublicId,
            duration: vid.duration,
            width: vid.width,
            height: vid.height,
          }))
        );
      }

      setUploadedMedia(prev => [...prev, ...uploadedFiles]);
    } catch (error: unknown) {
      console.error('Error uploading media:', error);
      toast.error(apiErrorMessage(error, 'Failed to upload media. Please try again.'));
    } finally {
      setIsUploading(false);
    }
  };

  const removeMedia = (filename: string) => {
    setUploadedMedia(prev => prev.filter(media => media.filename !== filename));
  };

  const imagesTabNeedsMedia = postType === 'images' && uploadedMedia.length === 0;
  const launchUrlValid = (() => {
    if (!isLaunchMode) return true;
    try {
      const u = new URL(productUrl.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  })();
  const isPostDisabled = isLaunchMode
    ? !title.trim() ||
      !selectedCommunity ||
      !body.trim() ||
      !launchUrlValid ||
      uploadedMedia.length === 0 ||
      isUploading
    : !title.trim() ||
      !selectedCommunity ||
      imagesTabNeedsMedia ||
      (postType === 'images' && isUploading);

  const renderMediaUploadZone = () => (
    <div className="space-y-3 sm:space-y-4">
      <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 md:p-8 text-center hover:border-gray-400 transition-colors min-h-[150px] sm:min-h-[200px] flex flex-col items-center justify-center">
        <svg
          className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-gray-400"
          stroke="currentColor"
          fill="none"
          viewBox="0 0 48 48"
        >
          <path
            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="mt-2 text-xs sm:text-sm text-gray-600">Drag and drop or click to upload</p>
        <p className="mt-1 text-xs text-gray-500">
          JPEG, PNG, GIF, WebP, HEIC · MP4, WebM, MOV · up to {uploadStatus?.limits.imageMb ?? 20} MB per image (server
          limit)
        </p>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleMediaUpload}
          disabled={isUploading || uploadStatus?.cloudinaryConfigured === false}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
        />
        {isUploading && (
          <div className="mt-4 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2" />
            <span className="text-sm text-gray-600">Uploading media...</span>
          </div>
        )}
      </div>

      {uploadedMedia.length > 0 && (
        <div className="space-y-2 sm:space-y-3">
          <h4 className="text-xs sm:text-sm font-medium text-gray-700">Uploaded media ({uploadedMedia.length})</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            {uploadedMedia.map((media, index) => (
              <div key={`${media.filename}-${index}`} className="relative group">
                {media.type === 'image' ? (
                  <img
                    src={media.url || media.optimizedUrl || media.thumbnailUrl}
                    alt=""
                    className="w-full h-24 sm:h-32 object-cover rounded-md border border-gray-200"
                  />
                ) : (
                  <video
                    src={media.url}
                    className="w-full h-24 sm:h-32 object-cover rounded-md border border-gray-200"
                    controls
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(media.filename)}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove media"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto bg-white min-h-screen px-3 sm:px-4 md:px-6">
      <div className="p-3 sm:p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 md:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {isLaunchMode ? 'Launch a product' : 'Create post'}
            </h1>
            {isLaunchMode && (
              <p className="text-sm text-gray-600 mt-1 max-w-2xl">
                Product Hunt–style launch: pick the community that fits your product, add your website link, at least
                one image or demo video, and your story. With the Startup topic tag, it appears on{' '}
                <Link to="/startups" className="text-blue-600 hover:underline">
                  Startups
                </Link>{' '}
                and is highlighted on that community&apos;s page.
              </p>
            )}
          </div>
          {!isLaunchMode && (
            <button className="text-sm sm:text-base text-blue-600 hover:text-blue-800 font-medium px-2 sm:px-0">
              Drafts
            </button>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 sm:mb-6 bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-md text-sm sm:text-base">
            {error}
          </div>
        )}

        {uploadStatus && uploadStatus.cloudinaryConfigured === false && (
          <div className="mb-4 sm:mb-6 bg-amber-50 border border-amber-200 text-amber-900 px-3 sm:px-4 py-2 sm:py-3 rounded-md text-sm">
            Post image and video uploads require Cloudinary to be configured on the server. Text posts still work. Ask an admin to set{' '}
            <code className="text-xs bg-amber-100 px-1 rounded">CLOUDINARY_*</code> env vars and redeploy the backend.
          </div>
        )}

        {/* Community Selection — menu rendered via portal so it is not covered by the title field (stacking) */}
        <div className="mb-4 sm:mb-6" ref={dropdownRef}>
          <div className="relative">
            <button
              ref={communityButtonRef}
              type="button"
              onClick={() => setShowCommunityDropdown(!showCommunityDropdown)}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-full bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-xs sm:text-sm">A</span>
                </div>
                <span className="text-sm sm:text-base text-gray-700 truncate flex-1">
                  {selectedCommunity ? `o/${communities?.find(c => c.id === selectedCommunity)?.name || selectedCommunity}` : 'Choose a community'}
                </span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
          </div>
        </div>

        {typeof document !== 'undefined' &&
          showCommunityDropdown &&
          communityMenuRect &&
          createPortal(
            <>
              <div
                className="fixed inset-0 z-[10990] bg-black/20 sm:bg-black/10"
                aria-hidden
                onMouseDown={() => setShowCommunityDropdown(false)}
              />
              <div
                ref={communityMenuPortalRef}
                className="fixed z-[11000] max-h-[min(50vh,15rem)] overflow-y-auto bg-white border border-gray-300 rounded-md shadow-2xl"
                style={{
                  top: communityMenuRect.top,
                  left: communityMenuRect.left,
                  width: communityMenuRect.width,
                }}
                role="listbox"
                aria-label="Choose community"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {communitiesLoading ? (
                  <div className="p-3 text-center text-sm text-gray-500">Loading communities...</div>
                ) : (
                  communities?.map((community) => (
                    <button
                      key={community.id}
                      type="button"
                      role="option"
                      onClick={() => {
                        setSelectedCommunity(community.id);
                        setShowCommunityDropdown(false);
                      }}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-left hover:bg-gray-50 flex items-center space-x-2 sm:space-x-3 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-xs sm:text-sm">o/</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm sm:text-base text-gray-900 truncate">o/{community.name}</div>
                        <div className="text-xs sm:text-sm text-gray-500 truncate">{community.description}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>,
            document.body
          )}

        {/* Post Type Tabs */}
        {!isLaunchMode && (
          <div className="mb-4 sm:mb-6">
            <div className="flex space-x-1 border-b border-gray-200 overflow-x-auto scrollbar-hide">
              {[
                { id: 'text', label: 'Text' },
                { id: 'images', label: 'Images & Video' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    const next = tab.id as PostType;
                    if (postType === 'images' && next !== 'images') {
                      setUploadedMedia([]);
                    }
                    setPostType(next);
                  }}
                  className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 ${
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
        )}

        {/* Title Input — z-0 so portaled community menu (body, z~11k) always stacks above */}
        <div className="mb-4 sm:mb-6 relative z-0">
          <div className="relative z-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isLaunchMode ? 'Product name *' : 'Title*'}
              maxLength={300}
              autoComplete="off"
              enterKeyHint="done"
              className="relative z-0 w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base sm:text-lg pr-16 sm:pr-20 touch-manipulation"
            />
            <div className="absolute bottom-2 right-2 sm:right-3 text-xs text-gray-400 pointer-events-none select-none z-0">
              {title.length}/300
            </div>
          </div>
        </div>

        {isLaunchMode && (
          <div className="mb-4 sm:mb-6">
            <label htmlFor="product-url" className="block text-sm font-medium text-gray-700 mb-1">
              Product website <span className="text-red-500">*</span>
            </label>
            <input
              id="product-url"
              type="url"
              inputMode="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://your-product.com"
              autoComplete="off"
              enterKeyHint="next"
              className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base [overflow-wrap:anywhere]"
            />
          </div>
        )}

        {isLaunchMode && (
          <div className="mb-4 sm:mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product images or video <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Upload at least one screenshot, logo, or demo video. Multiple files are allowed.
            </p>
            {uploadStatus && uploadStatus.cloudinaryConfigured === false && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2">
                Media uploads require Cloudinary on the server. Ask an admin to configure{' '}
                <code className="text-[11px] bg-amber-100 px-1 rounded">CLOUDINARY_*</code> before you can publish a
                launch with images or video.
              </p>
            )}
            {renderMediaUploadZone()}
          </div>
        )}

        {/* Topic tags — admin-defined options for this community */}
        {selectedCommunity && (
          <div className="mb-4 sm:mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isLaunchMode ? 'Topic tags' : 'Topic tags (optional)'}
            </label>
            <p className="text-xs text-gray-500 mb-2">
              {isLaunchMode
                ? 'The Startup topic is selected automatically when available so your launch appears on the Startups page and in this community’s featured launches.'
                : 'Choose subjects that match your post. Moderators define these for each community so everyone can find posts by topic.'}
            </p>
            {communityTags && communityTags.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {communityTags
                    .filter((tag) => tag && tag.id && tag.name)
                    .map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          if (!tag.id) return;
                          if (selectedTags.includes(tag.id)) {
                            setSelectedTags(selectedTags.filter((id) => id !== tag.id));
                          } else {
                            setSelectedTags([...selectedTags, tag.id]);
                          }
                        }}
                        title={tag.description || undefined}
                        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                          selectedTags.includes(tag.id)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        style={
                          selectedTags.includes(tag.id) && tag.color && /^#[0-9A-Fa-f]{6}$/.test(tag.color)
                            ? { backgroundColor: tag.color, color: 'white' }
                            : {}
                        }
                      >
                        {tag.name}
                      </button>
                    ))}
                </div>
                {selectedTags.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    {selectedTags.length} topic{selectedTags.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50/80 px-3 py-3 text-sm text-gray-600">
                <p className="mb-2">This community does not have topic tags yet.</p>
                {canManageTopicTags && postingCommunitySlug ? (
                  <Link
                    to={`/community/${postingCommunitySlug}/settings`}
                    className="text-blue-600 font-medium hover:text-blue-800 hover:underline"
                  >
                    Add topic tags in Community Settings
                  </Link>
                ) : (
                  <p className="text-xs text-gray-500">
                    Ask a moderator to add topic tags in community settings so posts can be labeled by subject.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Content based on post type */}
        {(postType === 'text' || isLaunchMode) && (
          <div className="mb-4 sm:mb-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50/80 px-2 pt-2 pb-1">
              <PostEditorToolbar
                isPlainMarkdown={isMarkdownMode}
                body={body}
                setBody={setBody}
                getEditor={() => editorRef.current}
                bodyTextareaRef={bodyTextareaRef}
                onTogglePlainMarkdown={() => setIsMarkdownMode(!isMarkdownMode)}
              />
            </div>
            <div className="relative">
              {isMarkdownMode ? (
                <textarea
                  ref={bodyTextareaRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    isLaunchMode
                      ? 'Tell the community what you built — problem, solution, who it’s for (Markdown supported) *'
                      : 'Body text (optional) — Markdown supported'
                  }
                  rows={10}
                  spellCheck
                  autoComplete="off"
                  className="w-full min-h-[12rem] px-4 py-3 border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 text-sm sm:text-base resize-y touch-manipulation"
                />
              ) : (
                <MarkdownEditor
                  ref={editorRef}
                  value={body}
                  onChange={setBody}
                  placeholder={
                    isLaunchMode
                      ? 'Tell the community what you built — problem, solution, who it’s for *'
                      : 'Body text (optional)'
                  }
                  rows={8}
                  className="w-full resize-none text-sm sm:text-base !border-0 !rounded-none focus:!ring-inset"
                  onKeyDown={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      if (e.key === 'b') {
                        e.preventDefault();
                        editorRef.current?.toggleInlineFormat('bold');
                      } else if (e.key === 'i') {
                        e.preventDefault();
                        editorRef.current?.toggleInlineFormat('italic');
                      }
                    }
                  }}
                />
              )}
            </div>
          </div>
        )}

        {postType === 'images' && (
          <div className="mb-4 sm:mb-6">
            <div className="space-y-4 sm:space-y-6">
              {/* Upload Area */}
              {renderMediaUploadZone()}

              {/* Text Editor Section */}
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-gray-100 bg-gray-50/80 px-2 pt-2 pb-1">
                  <PostEditorToolbar
                    isPlainMarkdown={isMarkdownMode}
                    body={body}
                    setBody={setBody}
                    getEditor={() => imagesEditorRef.current}
                    bodyTextareaRef={bodyTextareaRef}
                    onTogglePlainMarkdown={() => setIsMarkdownMode(!isMarkdownMode)}
                    compact
                  />
                </div>
                <div className="relative">
                  {isMarkdownMode ? (
                    <textarea
                      ref={bodyTextareaRef}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Caption or description (optional) — Markdown supported"
                      rows={10}
                      spellCheck
                      autoComplete="off"
                      className="w-full min-h-[12rem] px-4 py-3 border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 text-sm sm:text-base resize-y touch-manipulation"
                    />
                  ) : (
                    <MarkdownEditor
                      ref={imagesEditorRef}
                      value={body}
                      onChange={setBody}
                      placeholder="Caption or description (optional)"
                      rows={8}
                      className="w-full resize-none text-sm sm:text-base !border-0 !rounded-none focus:!ring-inset"
                      onKeyDown={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          if (e.key === 'b') {
                            e.preventDefault();
                            imagesEditorRef.current?.toggleInlineFormat('bold');
                          } else if (e.key === 'i') {
                            e.preventDefault();
                            imagesEditorRef.current?.toggleInlineFormat('italic');
                          }
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 sm:space-x-3 mt-4 sm:mt-6">
          {!isLaunchMode && (
            <button
              onClick={handleSaveDraft}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-4 sm:px-6 py-2 text-sm sm:text-base text-gray-600 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Save Draft
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={isPostDisabled || isSubmitting}
            className={`w-full sm:w-auto px-4 sm:px-6 py-2 text-sm sm:text-base rounded-full font-medium transition-colors ${
              isPostDisabled || isSubmitting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isSubmitting ? (isLaunchMode ? 'Publishing…' : 'Posting...') : isLaunchMode ? 'Publish launch' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePost;