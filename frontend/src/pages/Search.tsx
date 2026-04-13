import React, { useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiService, Post, Community } from '../services/apiService';
import VoteButton from '../components/VoteButton';
import PostAttachments from '../components/PostAttachments';
import PostPollBlock from '../components/PostPollBlock';
import AuthorVerificationsInline from '../components/AuthorVerificationsInline';
import MarkdownContent from '../components/MarkdownContent';

function PostRow({ post }: { post: Post }) {
  return (
    <div className="bg-white border border-gray-200 p-3 mb-2 hover:border-gray-300">
      <div className="text-xs text-gray-500 mb-1">
        <Link to={`/community/${post.community?.slug}`} className="font-medium text-gray-900 hover:underline">
          o/{post.community?.name}
        </Link>
        <span className="inline-flex items-center flex-wrap gap-x-0">
          {' '}
          • u/{post.author?.username}
          <AuthorVerificationsInline author={post.author} />
        </span>
      </div>
      <Link to={`/post/${post.id}`} className="block">
        <h3 className="text-base font-medium text-gray-900 hover:text-blue-600">{post.title}</h3>
      </Link>
      {post.type === 'link' && post.linkUrl && (
        <a
          href={post.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 line-clamp-1 break-all text-sm text-blue-600 hover:text-blue-800"
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
      {post.content ? (
        <MarkdownContent lineClamp={2} className="mt-1 text-sm text-gray-700 [overflow-wrap:anywhere]">
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
      <div className="mt-2 pt-2 border-t border-gray-100">
        <VoteButton
          postId={post.id}
          initialVoteScore={post.voteScore || 0}
          initialUserVote={post.userVote ?? null}
          size="sm"
        />
      </div>
    </div>
  );
}

const Search: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [localQ, setLocalQ] = useState('');
  const q = (searchParams.get('q') || '').trim();

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['search-posts', q],
    queryFn: () => apiService.getPosts({ q, limit: 30, sort: 'newest' }),
    enabled: q.length > 0,
  });

  const { data: communities } = useQuery({
    queryKey: ['communities'],
    queryFn: () => apiService.getCommunities(),
  });

  const matchingCommunities = useMemo(() => {
    if (!communities || !q) return [];
    const lower = q.toLowerCase();
    return communities.filter(
      (c: Community) =>
        c.name.toLowerCase().includes(lower) ||
        (c.slug && c.slug.toLowerCase().includes(lower)) ||
        (c.description && c.description.toLowerCase().includes(lower))
    );
  }, [communities, q]);

  if (!q) {
    return (
      <div className="mx-auto min-w-0 max-w-3xl px-2">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Search</h1>
        <p className="text-gray-600 mb-4">Find posts by title or text, and communities by name.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = localQ.trim();
            if (t) navigate(`/search?q=${encodeURIComponent(t)}`);
          }}
          className="flex flex-col sm:flex-row gap-2 max-w-md"
        >
          <input
            type="search"
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            placeholder="Keywords…"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            autoFocus
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            Search
          </button>
        </form>
      </div>
    );
  }

  const posts = postsData?.posts || [];

  return (
    <div className="mx-auto min-w-0 max-w-3xl px-2">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Search results</h1>
      <p className="text-sm text-gray-600 mb-6">
        For &quot;<span className="font-medium">{q}</span>&quot;
      </p>

      {matchingCommunities.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Communities</h2>
          <ul className="space-y-2">
            {matchingCommunities.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/community/${c.slug || c.id}`}
                  className="block bg-white border border-gray-200 rounded-md p-3 hover:border-blue-300 transition-colors"
                >
                  <span className="font-medium text-gray-900">o/{c.name}</span>
                  {c.memberCount != null && (
                    <span className="text-xs text-gray-500 ml-2">{c.memberCount} members</span>
                  )}
                  {c.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{c.description}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Posts</h2>
        {postsLoading ? (
          <div className="flex items-center py-8 text-gray-600">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3" />
            Loading posts…
          </div>
        ) : posts.length === 0 ? (
          <p className="text-gray-600 py-4">No posts matched your search.</p>
        ) : (
          posts.map((post) => <PostRow key={post.id} post={post} />)
        )}
      </section>
    </div>
  );
};

export default Search;
