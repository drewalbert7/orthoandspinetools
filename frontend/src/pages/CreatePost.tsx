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
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService, apiErrorMessage, Community, CommunityTag } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import MarkdownEditor, { MarkdownEditorHandle } from '../components/MarkdownEditor';

type PostType = 'text' | 'images' | 'link' | 'poll';

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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedCommunity, setSelectedCommunity] = useState<string>('');
  const [postType, setPostType] = useState<PostType>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [pollOptionDrafts, setPollOptionDrafts] = useState<string[]>(['', '']);
  const [pollDurationHours, setPollDurationHours] = useState<number>(24);
  // Mobile: default to plain <textarea> (reliable). Desktop: rich editor.
  const [isMarkdownMode, setIsMarkdownMode] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  );
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

  // Reset selected tags when community changes
  useEffect(() => {
    setSelectedTags([]);
  }, [selectedCommunity]);

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

  const normalizeSubmitUrl = (raw: string): string | null => {
    const u = raw.trim();
    if (!u) return null;
    try {
      const href = u.startsWith('http://') || u.startsWith('https://') ? u : `https://${u}`;
      const url = new URL(href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.href;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedCommunity) return;
    if (postType === 'images' && uploadedMedia.length === 0) {
      toast.error('Add at least one image or video before posting.');
      return;
    }
    if (postType === 'link') {
      const nu = normalizeSubmitUrl(linkUrl);
      if (!nu) {
        toast.error('Enter a valid URL (http or https).');
        return;
      }
    }
    if (postType === 'poll') {
      const opts = pollOptionDrafts.map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) {
        toast.error('Add at least two poll options.');
        return;
      }
      if (opts.length > 6) {
        toast.error('Polls can have at most six options.');
        return;
      }
    }

    setIsSubmitting(true);
    setError('');

    try {
      const getPostType = (type: PostType): 'discussion' | 'case_study' | 'tool_review' | 'link' | 'poll' => {
        switch (type) {
          case 'text':
            return 'discussion';
          case 'link':
            return 'link';
          case 'poll':
            return 'poll';
          case 'images':
            return 'case_study';
          default:
            return 'discussion';
        }
      };

      // Filter out invalid tag IDs before sending
      const validTagIds = selectedTags.filter((id) => id && typeof id === 'string' && id.trim().length > 0);

      const hasUploadedMedia = postType === 'images' && uploadedMedia.length > 0;
      const pollOptsTrimmed = pollOptionDrafts.map((s) => s.trim()).filter(Boolean);
      const pollEndsAt =
        postType === 'poll'
          ? new Date(Date.now() + Math.min(168, Math.max(1, pollDurationHours)) * 60 * 60 * 1000).toISOString()
          : undefined;

      const apiPostType =
        postType === 'images'
          ? hasUploadedMedia
            ? 'case_study'
            : 'discussion'
          : getPostType(postType);

      const postData = {
        title: title.trim(),
        content: body.trim(),
        communityId: selectedCommunity,
        postType: apiPostType,
        ...(postType === 'link' && { linkUrl: normalizeSubmitUrl(linkUrl)! }),
        ...(postType === 'poll' && {
          pollOptions: pollOptsTrimmed.slice(0, 6),
          pollEndsAt,
        }),
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

  // Formatting button handlers - work with markdown editor
  const handleFormatBold = (editor: { insertMarkdown: (before: string, after: string, placeholder: string) => void } | null) => {
    if (!editor) return;
    editor.insertMarkdown('**', '**', 'bold text');
  };

  const handleFormatItalic = (editor: { insertMarkdown: (before: string, after: string, placeholder: string) => void } | null) => {
    if (!editor) return;
    editor.insertMarkdown('*', '*', 'italic text');
  };

  const handleFormatStrikethrough = (editor: { insertMarkdown: (before: string, after: string, placeholder: string) => void } | null) => {
    if (!editor) return;
    editor.insertMarkdown('~~', '~~', 'strikethrough text');
  };

  const handleFormatSuperscript = (editor: { insertMarkdown: (before: string, after: string, placeholder: string) => void } | null) => {
    if (!editor) return;
    editor.insertMarkdown('^', '^', 'superscript');
  };

  const handleFormatCode = (editor: { insertMarkdown: (before: string, after: string, placeholder: string) => void } | null) => {
    if (!editor) return;
    const selectedText = body; // We'll check for newlines in the selection
    if (selectedText.includes('\n')) {
      editor.insertMarkdown('```\n', '\n```', 'code block');
    } else {
      editor.insertMarkdown('`', '`', 'code');
    }
  };

  const handleFormatLink = (editor: { insertMarkdown: (before: string, after: string, placeholder: string) => void } | null) => {
    if (!editor) return;
    editor.insertMarkdown('[', '](url)', 'link text');
  };

  const handleFormatImage = (editor: { insertMarkdown: (before: string, after: string, placeholder: string) => void } | null) => {
    if (!editor) return;
    editor.insertMarkdown('![', '](image-url)', 'alt text');
  };

  const handleFormatVideo = (editor: { insertMarkdown: (before: string, after: string, placeholder: string) => void } | null) => {
    if (!editor) return;
    editor.insertMarkdown('![', '](video-url)', 'video description');
  };

  const handleFormatBulletList = (editor: { insertMarkdown: (before: string, after: string, placeholder: string) => void } | null) => {
    if (!editor) return;
    if (body.includes('\n')) {
      // Multi-line: add bullet to each line
      const lines = body.split('\n');
      const bulletedLines = lines.map(line => line.trim() ? `- ${line.trim()}` : '').join('\n');
      setBody(bulletedLines);
    } else {
      editor.insertMarkdown('- ', '', 'list item');
    }
  };

  const handleFormatNumberedList = (editor: { insertMarkdown: (before: string, after: string, placeholder: string) => void } | null) => {
    if (!editor) return;
    if (body.includes('\n')) {
      // Multi-line: add numbers to each line
      const lines = body.split('\n');
      const numberedLines = lines.map((line, index) => line.trim() ? `${index + 1}. ${line.trim()}` : '').join('\n');
      setBody(numberedLines);
    } else {
      editor.insertMarkdown('1. ', '', 'list item');
    }
  };

  const handleFormatQuote = (editor: { insertMarkdown: (before: string, after: string, placeholder: string) => void } | null) => {
    if (!editor) return;
    if (body.includes('\n')) {
      // Multi-line: add quote to each line
      const lines = body.split('\n');
      const quotedLines = lines.map(line => line.trim() ? `> ${line.trim()}` : '').join('\n');
      setBody(quotedLines);
    } else {
      editor.insertMarkdown('> ', '', 'quote');
    }
  };

  const imagesTabNeedsMedia = postType === 'images' && uploadedMedia.length === 0;
  const linkTabInvalid = postType === 'link' && !normalizeSubmitUrl(linkUrl);
  const pollOptsFilled = pollOptionDrafts.map((s) => s.trim()).filter(Boolean).length;
  const pollTabInvalid = postType === 'poll' && pollOptsFilled < 2;
  const isPostDisabled =
    !title.trim() ||
    !selectedCommunity ||
    imagesTabNeedsMedia ||
    (postType === 'images' && isUploading) ||
    linkTabInvalid ||
    pollTabInvalid;


  return (
    <div className="max-w-4xl mx-auto bg-white min-h-screen px-3 sm:px-4 md:px-6">
      <div className="p-3 sm:p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 md:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Create post</h1>
          <button className="text-sm sm:text-base text-blue-600 hover:text-blue-800 font-medium px-2 sm:px-0">
            Drafts
          </button>
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
        <div className="mb-4 sm:mb-6">
          <div className="flex space-x-1 border-b border-gray-200 overflow-x-auto scrollbar-hide">
            {[
              { id: 'text', label: 'Text' },
              { id: 'images', label: 'Images & Video' },
              { id: 'link', label: 'Link' },
              { id: 'poll', label: 'Poll' }
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

        {/* Title Input — z-0 so portaled community menu (body, z~11k) always stacks above */}
        <div className="mb-4 sm:mb-6 relative z-0">
          <div className="relative z-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title*"
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

        {/* Topic tags — admin-defined options for this community */}
        {selectedCommunity && (
          <div className="mb-4 sm:mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Topic tags (optional)</label>
            <p className="text-xs text-gray-500 mb-2">
              Choose subjects that match your post. Moderators define these for each community so everyone can find posts by topic.
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
        {postType === 'text' && (
          <div className="mb-4 sm:mb-6">
            {/* Formatting Toolbar (rich editor only) */}
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className={`flex items-center space-x-0.5 sm:space-x-1 overflow-x-auto scrollbar-hide flex-1 ${isMarkdownMode ? 'opacity-40 pointer-events-none' : ''}`}>
                {/* Bold */}
                <button 
                  type="button"
                  onClick={() => handleFormatBold(editorRef.current)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                  title="Bold (Ctrl+B)"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
                  </svg>
                </button>
                {/* Italic */}
                <button 
                  type="button"
                  onClick={() => handleFormatItalic(editorRef.current)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                  title="Italic (Ctrl+I)"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8z"/>
                  </svg>
                </button>
                {/* Strikethrough */}
                <button 
                  type="button"
                  onClick={() => handleFormatStrikethrough(editorRef.current)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                  title="Strikethrough"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V4h5V2H5v2zm2.5 7c-.83 0-1.5-.67-1.5-1.5S6.67 8 7.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                  </svg>
                </button>
                {/* Superscript */}
                <button 
                  type="button"
                  onClick={() => handleFormatSuperscript(editorRef.current)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                  title="Superscript"
                >
                  <span className="text-sm font-bold">X²</span>
                </button>
                {/* Code */}
                <button 
                  type="button"
                  onClick={() => handleFormatCode(editorRef.current)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                  title="Code"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
                  </svg>
                </button>
                {/* Link */}
                <button 
                  type="button"
                  onClick={() => handleFormatLink(editorRef.current)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                  title="Link"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                  </svg>
                </button>
                {/* Image */}
                <button 
                  type="button"
                  onClick={() => handleFormatImage(editorRef.current)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                  title="Image"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                  </svg>
                </button>
                {/* Video */}
                <button 
                  type="button"
                  onClick={() => handleFormatVideo(editorRef.current)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                  title="Video"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                  </svg>
                </button>
                {/* Bullet List */}
                <button 
                  type="button"
                  onClick={() => handleFormatBulletList(editorRef.current)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                  title="Bullet List"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/>
                  </svg>
                </button>
                {/* Numbered List */}
                <button 
                  type="button"
                  onClick={() => handleFormatNumberedList(editorRef.current)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                  title="Numbered List"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/>
                  </svg>
                </button>
                {/* Quote */}
                <button 
                  type="button"
                  onClick={() => handleFormatQuote(editorRef.current)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                  title="Quote"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
                  </svg>
                </button>
                {/* More */}
                <button className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" title="More">
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsMarkdownMode(!isMarkdownMode)}
                className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap ml-2 sm:ml-0"
              >
                {isMarkdownMode ? (
                  <>
                    <span className="hidden sm:inline">Switch to rich editor</span>
                    <span className="sm:hidden">Rich</span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">Plain Markdown (better on mobile)</span>
                    <span className="sm:hidden">Plain text</span>
                  </>
                )}
              </button>
            </div>
            
            {/* Body: plain textarea (reliable typing) vs rich contenteditable */}
            <div className="relative">
              {isMarkdownMode ? (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Body text (optional) — Markdown supported"
                  rows={10}
                  spellCheck
                  autoComplete="off"
                  className="w-full min-h-[12rem] px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base resize-y touch-manipulation"
                />
              ) : (
                <MarkdownEditor
                  ref={editorRef}
                  value={body}
                  onChange={setBody}
                  placeholder="Body text (optional)"
                  rows={8}
                  className="w-full resize-none text-sm sm:text-base"
                  onKeyDown={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      if (e.key === 'b') {
                        e.preventDefault();
                        handleFormatBold(editorRef.current);
                      } else if (e.key === 'i') {
                        e.preventDefault();
                        handleFormatItalic(editorRef.current);
                      }
                    }
                  }}
                />
              )}
              {!isMarkdownMode && (
                <div className="absolute bottom-2 right-2 w-3 h-3 pointer-events-none select-none" aria-hidden>
                  <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM18 18H16V16H18V18ZM14 22H12V20H14V22ZM22 14H20V12H22V14Z"/>
                  </svg>
                </div>
              )}
            </div>
          </div>
        )}

        {postType === 'link' && (
          <div className="mb-4 sm:mb-6 space-y-3">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="URL (https://…)"
              autoComplete="off"
              enterKeyHint="done"
              className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base touch-manipulation"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Comment (optional)"
              rows={6}
              spellCheck
              autoComplete="off"
              className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base resize-y touch-manipulation"
            />
          </div>
        )}

        {postType === 'images' && (
          <div className="mb-4 sm:mb-6">
            <div className="space-y-4 sm:space-y-6">
              {/* Upload Area */}
              <div className="space-y-3 sm:space-y-4">
                <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 md:p-8 text-center hover:border-gray-400 transition-colors min-h-[150px] sm:min-h-[200px] flex flex-col items-center justify-center">
                  <svg className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-2 text-xs sm:text-sm text-gray-600">Drag and Drop or click to upload media</p>
                  <p className="mt-1 text-xs text-gray-500">
                    JPEG, PNG, GIF, WebP, HEIC · MP4, WebM, MOV · up to {uploadStatus?.limits.imageMb ?? 20} MB per image (server limit)
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
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                      <span className="text-sm text-gray-600">Uploading media...</span>
                    </div>
                  )}
                </div>

                {/* Uploaded Media Preview */}
                {uploadedMedia.length > 0 && (
                  <div className="space-y-2 sm:space-y-3">
                    <h4 className="text-xs sm:text-sm font-medium text-gray-700">Uploaded Media ({uploadedMedia.length})</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                      {uploadedMedia.map((media, index) => (
                        <div key={index} className="relative group">
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

              {/* Text Editor Section */}
              <div className="space-y-2 sm:space-y-3">
                {/* Formatting Toolbar */}
                <div className="flex items-center justify-between">
                  <div className={`flex items-center space-x-0.5 sm:space-x-1 overflow-x-auto scrollbar-hide flex-1 ${isMarkdownMode ? 'opacity-40 pointer-events-none' : ''}`}>
                    {/* Bold */}
                    <button 
                      type="button"
                      onClick={() => handleFormatBold(imagesEditorRef.current)}
                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                      title="Bold (Ctrl+B)"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
                      </svg>
                    </button>
                    {/* Italic */}
                    <button 
                      type="button"
                      onClick={() => handleFormatItalic(imagesEditorRef.current)}
                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                      title="Italic (Ctrl+I)"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8z"/>
                      </svg>
                    </button>
                    {/* Strikethrough */}
                    <button 
                      type="button"
                      onClick={() => handleFormatStrikethrough(imagesEditorRef.current)}
                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                      title="Strikethrough"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V4h5V2H5v2zm2.5 7c-.83 0-1.5-.67-1.5-1.5S6.67 8 7.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                      </svg>
                    </button>
                    {/* Superscript */}
                    <button 
                      type="button"
                      onClick={() => handleFormatSuperscript(imagesEditorRef.current)}
                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                      title="Superscript"
                    >
                      <span className="text-sm font-bold">X²</span>
                    </button>
                    {/* Text Color - Not implemented in Reddit markdown, keeping for future */}
                    <button 
                      type="button"
                      className="p-2 hover:bg-gray-100 rounded-md opacity-50 cursor-not-allowed" 
                      title="Text Color (Not available in markdown)"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                    </button>
                    {/* Link */}
                    <button 
                      type="button"
                      onClick={() => handleFormatLink(imagesEditorRef.current)}
                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                      title="Link"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                      </svg>
                    </button>
                    {/* Bullet List */}
                    <button 
                      type="button"
                      onClick={() => handleFormatBulletList(imagesEditorRef.current)}
                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                      title="Bullet List"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/>
                      </svg>
                    </button>
                    {/* Numbered List */}
                    <button 
                      type="button"
                      onClick={() => handleFormatNumberedList(imagesEditorRef.current)}
                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                      title="Numbered List"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/>
                      </svg>
                    </button>
                    {/* Quote */}
                    <button 
                      type="button"
                      onClick={() => handleFormatQuote(imagesEditorRef.current)}
                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                      title="Quote"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
                      </svg>
                    </button>
                    {/* Code Block */}
                    <button 
                      type="button"
                      onClick={() => handleFormatCode(imagesEditorRef.current)}
                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                      title="Code Block"
                    >
                      <span className="text-sm font-bold">99</span>
                    </button>
                    {/* Inline Code */}
                    <button 
                      type="button"
                      onClick={() => handleFormatCode(imagesEditorRef.current)}
                      className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md flex-shrink-0" 
                      title="Inline Code"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
                      </svg>
                    </button>
                    {/* Table - Not implemented in Reddit markdown, keeping for future */}
                    <button 
                      type="button"
                      className="p-2 hover:bg-gray-100 rounded-md opacity-50 cursor-not-allowed" 
                      title="Table (Not available in markdown)"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2z"/>
                      </svg>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMarkdownMode(!isMarkdownMode)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {isMarkdownMode ? 'Switch to rich editor' : 'Plain Markdown (mobile-friendly)'}
                  </button>
                </div>
                
                <div className="relative">
                  {isMarkdownMode ? (
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Body text (optional) — Markdown supported"
                      rows={10}
                      spellCheck
                      autoComplete="off"
                      className="w-full min-h-[12rem] px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base resize-y touch-manipulation"
                    />
                  ) : (
                    <MarkdownEditor
                      ref={imagesEditorRef}
                      value={body}
                      onChange={setBody}
                      placeholder="Body text (optional)"
                      rows={8}
                      className="w-full resize-none text-sm sm:text-base"
                      onKeyDown={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          if (e.key === 'b') {
                            e.preventDefault();
                            handleFormatBold(imagesEditorRef.current);
                          } else if (e.key === 'i') {
                            e.preventDefault();
                            handleFormatItalic(imagesEditorRef.current);
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


        {postType === 'poll' && (
          <div className="mb-4 sm:mb-6 space-y-4">
            <p className="text-sm text-gray-600">2–6 options · poll runs up to 7 days (same as Reddit-style limits)</p>
            <div className="space-y-2">
              {pollOptionDrafts.map((opt, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={opt}
                    maxLength={200}
                    onChange={(e) => {
                      const next = [...pollOptionDrafts];
                      next[idx] = e.target.value;
                      setPollOptionDrafts(next);
                    }}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {pollOptionDrafts.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollOptionDrafts(pollOptionDrafts.filter((_, i) => i !== idx))}
                      className="text-sm text-red-600 px-2 py-1 hover:bg-red-50 rounded"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            {pollOptionDrafts.length < 6 && (
              <button
                type="button"
                onClick={() => setPollOptionDrafts([...pollOptionDrafts, ''])}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Add option
              </button>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
              <select
                value={pollDurationHours}
                onChange={(e) => setPollDurationHours(Number(e.target.value))}
                className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              >
                <option value={1}>1 hour</option>
                <option value={6}>6 hours</option>
                <option value={12}>12 hours</option>
                <option value={24}>1 day</option>
                <option value={72}>3 days</option>
                <option value={168}>7 days</option>
              </select>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Body text (optional)"
              rows={5}
              spellCheck
              autoComplete="off"
              className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base resize-y"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 sm:space-x-3 mt-4 sm:mt-6">
          <button
            onClick={handleSaveDraft}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 text-sm sm:text-base text-gray-600 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPostDisabled || isSubmitting}
            className={`w-full sm:w-auto px-4 sm:px-6 py-2 text-sm sm:text-base rounded-full font-medium transition-colors ${
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