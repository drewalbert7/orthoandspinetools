import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import MarkdownEditor, { MarkdownEditorHandle } from '../components/MarkdownEditor';
import PostEditorToolbar from '../components/PostEditorToolbar';
import { tryApplyUrlPasteToTextarea } from '../lib/pasteUrlAsMarkdown';

const EditPost: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isMarkdownMode, setIsMarkdownMode] = useState(false);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    data: post,
    isLoading: postLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['post', id],
    queryFn: () => apiService.getPost(id!),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!post) return;
    setTitle(post.title ?? '');
    setBody(post.content ?? '');
  }, [post]);

  useEffect(() => {
    if (authLoading || !post || !user) return;
    if (post.authorId !== user.id) {
      toast.error('You can only edit your own posts');
      navigate(`/post/${id}`, { replace: true });
    }
  }, [authLoading, post, user, id, navigate]);

  const updateMutation = useMutation({
    mutationFn: (payload: { title: string; content: string }) => apiService.updatePost(id!, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['post', id] });
      await queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Post updated');
      navigate(`/post/${id}`);
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Could not update post');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const t = title.trim();
    if (!t) {
      toast.error('Title is required');
      return;
    }
    updateMutation.mutate({ title: t, content: body });
  };

  if (!id) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-gray-600">
        Invalid post link.{' '}
        <Link to="/" className="text-blue-600 hover:underline">
          Home
        </Link>
      </div>
    );
  }

  if (postLoading || authLoading) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-gray-600">Loading…</div>
    );
  }

  if (isError || !post) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-gray-600">
        <p>{error instanceof Error ? error.message : 'Post not found.'}</p>
        <Link to="/" className="mt-4 inline-block text-blue-600 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-gray-700">
        <p>
          <Link to="/login" className="text-blue-600 font-medium hover:underline" state={{ from: `/post/${id}/edit` }}>
            Sign in
          </Link>{' '}
          to edit this post.
        </p>
        <Link to={`/post/${id}`} className="mt-4 inline-block text-sm text-gray-600 hover:text-blue-600">
          Back to post
        </Link>
      </div>
    );
  }

  if (post.authorId !== user.id) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-gray-600">Redirecting…</div>
    );
  }

  if (post.isLocked) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <p className="text-gray-700">This post is locked and cannot be edited.</p>
        <Link to={`/post/${id}`} className="mt-4 inline-block text-blue-600 hover:underline">
          Back to post
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link to={`/post/${id}`} className="text-sm text-blue-600 hover:text-blue-800 hover:underline">
          ← Back to post
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Edit post</h1>
        <p className="mt-1 text-sm text-gray-500">
          Changes apply to the title and body. Poll options, link URL, and attachments are unchanged.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="mb-4 sm:mb-6 relative z-0">
          <div className="relative z-0">
            <label htmlFor="edit-post-title" className="sr-only">
              Title
            </label>
            <input
              id="edit-post-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              maxLength={200}
              autoComplete="off"
              enterKeyHint="done"
              className="relative z-0 w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base sm:text-lg pr-16 sm:pr-20 touch-manipulation"
            />
            <div className="absolute bottom-2 right-2 sm:right-3 text-xs text-gray-400 pointer-events-none select-none z-0">
              {title.length}/200
            </div>
          </div>
        </div>

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
                onPaste={(e) => tryApplyUrlPasteToTextarea(e, body, setBody)}
                placeholder="Body (optional) — Markdown supported"
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
                placeholder="Body (optional)"
                rows={10}
                className="w-full resize-none text-sm sm:text-base !border-0 !rounded-none focus:!ring-inset min-h-[12rem]"
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

        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
          <Link
            to={`/post/${id}`}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 text-sm sm:text-base text-center text-gray-600 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={updateMutation.isPending || !title.trim()}
            className={`w-full sm:w-auto px-4 sm:px-6 py-2 text-sm sm:text-base rounded-full font-medium transition-colors ${
              updateMutation.isPending || !title.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditPost;
