import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiService, type ImplantComment } from '../../services/apiService';
import MarkdownContent from '../MarkdownContent';

type Props = {
  slug: string;
  comments: ImplantComment[];
  locked: boolean;
};

const ImplantCommentSection: React.FC<Props> = ({ slug, comments, locked }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['implant', slug] });
    queryClient.invalidateQueries({ queryKey: ['implants'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: { body: string; parentId?: string }) =>
      apiService.createImplantComment(slug, payload),
    onSuccess: () => {
      setDraft('');
      setReplyDraft('');
      setReplyTo(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const voteMutation = useMutation({
    mutationFn: (payload: { commentId: string; type: 'upvote' | 'downvote' }) =>
      apiService.voteImplantComment(slug, payload.commentId, payload.type),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => apiService.deleteImplantComment(slug, commentId),
    onSuccess: () => {
      toast.success('Comment deleted');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const topLevel = comments.filter((c) => !c.parentId);
  const loginRedirect = `/login?redirect=${encodeURIComponent(`/implants/${slug}`)}`;

  return (
    <div className="border border-gray-200 bg-white p-3 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Discussion</h2>
        <p className="text-xs text-gray-500">
          {topLevel.length} {topLevel.length === 1 ? 'comment' : 'comments'} · upvote / downvote like the feed
        </p>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Clinical notes and experience welcome. Votes help rank useful takes; they also feed the proprietary
        Directory Score (not medical advice).
      </p>

      {user && !locked ? (
        <div className="mt-4 flex items-start gap-3 border-b border-gray-100 pb-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What are your thoughts on this implant?"
              rows={4}
              maxLength={5000}
              className="w-full resize-none rounded-md border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                disabled={!draft.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({ body: draft.trim() })}
                className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending ? 'Posting…' : 'Comment'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
          <Link to={loginRedirect} className="font-medium text-blue-600 hover:text-blue-800">
            Log in
          </Link>{' '}
          to comment and vote.
        </div>
      )}

      {topLevel.length === 0 ? (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No comments yet. Be the first to share a clinical take.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {topLevel.map((comment) => (
            <ImplantCommentCard
              key={comment.id}
              comment={comment}
              depth={0}
              canInteract={Boolean(user)}
              currentUserId={user?.id}
              isAdmin={Boolean(user?.isAdmin)}
              replyTo={replyTo}
              replyDraft={replyDraft}
              onReplyTo={setReplyTo}
              onReplyDraft={setReplyDraft}
              onVote={(commentId, type) => {
                if (!user) return;
                voteMutation.mutate({ commentId, type });
              }}
              onSubmitReply={(parentId) => {
                if (!replyDraft.trim()) return;
                createMutation.mutate({ body: replyDraft.trim(), parentId });
              }}
              onDelete={(id) => deleteMutation.mutate(id)}
              posting={createMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function ImplantCommentCard({
  comment,
  depth,
  canInteract,
  currentUserId,
  isAdmin,
  replyTo,
  replyDraft,
  onReplyTo,
  onReplyDraft,
  onVote,
  onSubmitReply,
  onDelete,
  posting,
}: {
  comment: ImplantComment;
  depth: number;
  canInteract: boolean;
  currentUserId?: string;
  isAdmin: boolean;
  replyTo: string | null;
  replyDraft: string;
  onReplyTo: (id: string | null) => void;
  onReplyDraft: (v: string) => void;
  onVote: (commentId: string, type: 'upvote' | 'downvote') => void;
  onSubmitReply: (parentId: string) => void;
  onDelete: (id: string) => void;
  posting: boolean;
}) {
  const canDelete = currentUserId === comment.author.id || isAdmin;
  const isReplying = replyTo === comment.id;

  return (
    <div className={depth > 0 ? 'ml-4 border-l-2 border-gray-200 pl-4' : ''}>
      <div className="mb-2 rounded-md border border-gray-200 bg-white">
        <div className="flex">
          <div className="flex flex-col items-center bg-gray-50 p-2">
            <button
              type="button"
              disabled={!canInteract || comment.isDeleted}
              onClick={() => onVote(comment.id, 'upvote')}
              className={`rounded p-1 transition-colors hover:bg-gray-200 disabled:opacity-40 ${
                comment.userVote === 'upvote' ? 'text-orange-500' : 'text-gray-400'
              }`}
              aria-label="Upvote"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <span
              className={`text-xs font-medium ${
                comment.voteScore > 0
                  ? 'text-orange-500'
                  : comment.voteScore < 0
                    ? 'text-blue-500'
                    : 'text-gray-500'
              }`}
            >
              {comment.voteScore}
            </span>
            <button
              type="button"
              disabled={!canInteract || comment.isDeleted}
              onClick={() => onVote(comment.id, 'downvote')}
              className={`rounded p-1 transition-colors hover:bg-gray-200 disabled:opacity-40 ${
                comment.userVote === 'downvote' ? 'text-blue-500' : 'text-gray-400'
              }`}
              aria-label="Downvote"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          <div className="min-w-0 flex-1 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="font-medium text-gray-900">u/{comment.author.username}</span>
              {comment.author.specialty ? (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                  {comment.author.specialty}
                </span>
              ) : null}
              <span>·</span>
              <span>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
            </div>

            {comment.isDeleted ? (
              <p className="mb-2 text-sm italic text-gray-400">[deleted]</p>
            ) : (
              <MarkdownContent className="mb-3 text-sm text-gray-900 [overflow-wrap:anywhere]">
                {comment.body}
              </MarkdownContent>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
              {canInteract && depth < 1 && !comment.isDeleted ? (
                <button
                  type="button"
                  className="hover:text-gray-700"
                  onClick={() => onReplyTo(isReplying ? null : comment.id)}
                >
                  Reply
                </button>
              ) : null}
              {canDelete && !comment.isDeleted ? (
                <button
                  type="button"
                  className="text-red-600 hover:text-red-800"
                  onClick={() => {
                    if (window.confirm('Delete this comment?')) onDelete(comment.id);
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {isReplying && canInteract ? (
        <div className="mb-3 ml-4">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <textarea
              value={replyDraft}
              onChange={(e) => onReplyDraft(e.target.value)}
              placeholder="What are your thoughts?"
              rows={3}
              className="w-full resize-none rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="px-3 py-1 text-sm text-gray-600" onClick={() => onReplyTo(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!replyDraft.trim() || posting}
                onClick={() => onSubmitReply(comment.id)}
                className="rounded-md bg-orange-500 px-3 py-1 text-sm text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {posting ? 'Posting…' : 'Reply'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {(comment.replies || []).map((reply) => (
        <ImplantCommentCard
          key={reply.id}
          comment={reply}
          depth={depth + 1}
          canInteract={canInteract}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          replyTo={replyTo}
          replyDraft={replyDraft}
          onReplyTo={onReplyTo}
          onReplyDraft={onReplyDraft}
          onVote={onVote}
          onSubmitReply={onSubmitReply}
          onDelete={onDelete}
          posting={posting}
        />
      ))}
    </div>
  );
}

export default ImplantCommentSection;
