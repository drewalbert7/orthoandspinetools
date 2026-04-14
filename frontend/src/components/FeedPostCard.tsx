import React from 'react';
import { Link } from 'react-router-dom';
import { Post } from '../services/apiService';
import VoteButton from './VoteButton';
import PostAttachments from './PostAttachments';
import PostPollBlock from './PostPollBlock';
import MarkdownContent from './MarkdownContent';
import PostDeviceDisclaimer from './PostDeviceDisclaimer';
import ShareButton from './ShareButton';
import AuthorVerificationsInline from './AuthorVerificationsInline';

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);

  if (diffInMinutes < 1) return 'now';
  if (diffInMinutes < 60) return `${diffInMinutes}m`;
  if (diffInHours < 24) return `${diffInHours}h`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const FeedPostCard: React.FC<{ post: Post }> = ({ post }) => {
  const comm = post.community;
  const communitySlug = comm?.slug || comm?.id || '';

  return (
    <div className="bg-white border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="p-3">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-gray-500 mb-1">
          <Link
            to={communitySlug ? `/community/${communitySlug}` : '/'}
            className="font-medium text-gray-900 hover:underline flex items-center space-x-1"
          >
            {comm?.profileImage ? (
              <img
                src={comm.profileImage}
                alt={comm.name || 'Community'}
                className="w-4 h-4 rounded-full object-cover"
              />
            ) : (
              <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">o</span>
              </div>
            )}
            <span>o/{comm?.name ?? 'community'}</span>
          </Link>
          <span>•</span>
          <span className="inline-flex items-center flex-wrap gap-x-0">
            Posted by u/{post.author?.username ?? 'unknown'}
            <AuthorVerificationsInline author={post.author} />
          </span>
          <span>•</span>
          <span>{formatTimeAgo(new Date(post.createdAt))}</span>
        </div>

        <Link to={`/post/${post.id}`} className="block">
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2 hover:text-blue-600 transition-colors leading-tight">
            {post.title}
          </h3>
        </Link>
        {post.type === 'link' && post.linkUrl && (
          <a
            href={post.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2 line-clamp-1 break-all text-xs text-blue-600 hover:text-blue-800 sm:text-sm"
          >
            {(() => {
              try {
                return new URL(post.linkUrl).hostname.replace(/^www\./, '');
              } catch {
                return post.linkUrl;
              }
            })()}
          </a>
        )}
        <PostDeviceDisclaimer post={post} variant="compact" className="mb-2" />
        {post.content ? (
          <MarkdownContent lineClamp={3} className="mb-3 text-xs text-gray-800 [overflow-wrap:anywhere] sm:text-sm">
            {post.content}
          </MarkdownContent>
        ) : null}

        {post.type === 'poll' && Array.isArray(post.pollOptions) && (
          <PostPollBlock
            postId={post.id}
            pollOptions={post.pollOptions}
            pollEndsAt={post.pollEndsAt}
            pollVoteCounts={post.pollVoteCounts}
            userPollVoteIndex={post.userPollVoteIndex}
            pollClosed={post.pollClosed}
            compact
          />
        )}

        <PostAttachments attachments={post.attachments ?? []} postId={post.id} />

        <div className="flex items-center flex-wrap gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
          <VoteButton
            postId={post.id}
            initialVoteScore={post.voteScore || 0}
            initialUserVote={post.userVote || null}
            size="sm"
          />

          <Link
            to={`/post/${post.id}`}
            className="flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{post._count?.comments || 0}</span>
          </Link>

          <ShareButton url={`/post/${post.id}`} title={post.title} type="post" size="sm" />
        </div>
      </div>
    </div>
  );
};

export default FeedPostCard;
