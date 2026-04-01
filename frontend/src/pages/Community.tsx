import React, { useState, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiService, Post, Community, CommunityTag } from '../services/apiService';
import VoteButton from '../components/VoteButton';
import ShareButton from '../components/ShareButton';
import { useAuth } from '../contexts/AuthContext';
import PostAttachments from '../components/PostAttachments';
import PostPollBlock from '../components/PostPollBlock';
import VerifiedPhysicianInline from '../components/VerifiedPhysicianInline';
import { DocumentMeta } from '../components/DocumentMeta';
import { buildCommunityJsonLd, SEO_DEFAULTS, stripToPlainText } from '../lib/seo';

const SORT_OPTIONS = [
  { value: 'newest' as const, label: 'New' },
  { value: 'oldest' as const, label: 'Old' },
  { value: 'popular' as const, label: 'Top' },
  { value: 'controversial' as const, label: 'Controversial' },
];

function formatRelativeTime(dateString: string): string {
  const t = new Date(dateString).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 45) return 'now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function linkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const CommunityPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tagFilter = (searchParams.get('tag') || '').trim();
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'popular' | 'controversial'>('newest');

  const { data: communityData, isLoading: communityLoading } = useQuery<Community>({
    queryKey: ['community', slug],
    queryFn: () => apiService.getCommunity(slug!),
    enabled: !!slug,
  });

  const { data: topicTags } = useQuery<CommunityTag[]>({
    queryKey: ['communityTags', communityData?.id],
    queryFn: () => apiService.getCommunityTags(communityData!.id),
    enabled: !!communityData?.id,
  });

  const { data: postsData, isLoading: postsLoading } = useQuery<Post[]>({
    queryKey: ['posts', 'community', slug, sortBy, tagFilter],
    queryFn: () =>
      apiService
        .getPosts({
          community: slug!,
          sort: sortBy,
          ...(tagFilter ? { tag: tagFilter } : {}),
        })
        .then((res) => res.posts),
    enabled: !!slug && !!communityData,
  });

  const communityJsonLd = useMemo(
    () => (communityData ? buildCommunityJsonLd(communityData, slug!) : null),
    [communityData, slug]
  );

  const communityMetaDescription = useMemo(() => {
    if (!communityData?.description) return SEO_DEFAULTS.description;
    const t = stripToPlainText(communityData.description, 260);
    return `${t} — o/${communityData.name} on ${SEO_DEFAULTS.siteName}`;
  }, [communityData]);

  const setTopicFilter = (tagId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (tagId) next.set('tag', tagId);
    else next.delete('tag');
    setSearchParams(next, { replace: true });
  };

  if (communityLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-gray-200 border-t-orange-500 animate-spin" />
          <span className="text-sm text-gray-500">Loading community…</span>
        </div>
      </div>
    );
  }

  const community = communityData;
  const posts = postsData ?? [];
  const canManage =
    !!user &&
    (user.id === community?.ownerId ||
      !!community?.moderators?.some((m) => m.userId === user.id) ||
      !!user.isAdmin);

  if (!community) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center">
        <DocumentMeta
          title="Community not found"
          description="The requested community does not exist or is unavailable."
          noIndex
        />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Community not found</h1>
        <p className="text-gray-600 mb-6">o/{slug} does not exist or is unavailable.</p>
        <Link to="/" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Back to home
        </Link>
      </div>
    );
  }

  const createPostHref = `/create-post?community=${encodeURIComponent(community.id)}`;

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 pb-8">
      <DocumentMeta
        title={`o/${community.name}`}
        description={communityMetaDescription}
        canonicalPath={`/community/${slug}`}
        ogImage={community.bannerImage || community.profileImage}
        jsonLd={communityJsonLd}
      />
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-start">
        <div className="flex-1 min-w-0 order-1">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-3 sm:mb-4">
            <div className="relative h-24 sm:h-32 bg-gradient-to-br from-slate-700 to-slate-900">
              {community.bannerImage ? (
                <img
                  src={community.bannerImage}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : null}
              <div className="absolute -bottom-8 left-3 sm:left-5">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white ring-4 ring-white shadow-md flex items-center justify-center overflow-hidden">
                  {community.profileImage ? (
                    <img
                      src={community.profileImage}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white font-bold text-lg sm:text-xl">o/</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-10 sm:pt-11 px-3 sm:px-5 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 pt-1">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight truncate">
                    o/{community.name}
                  </h1>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-3 sm:line-clamp-none [overflow-wrap:anywhere]">
                    {community.description}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Link
                    to={createPostHref}
                    className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors touch-manipulation"
                  >
                    Create post
                  </Link>
                  {canManage && (
                    <Link
                      to={`/community/${community.slug}/settings`}
                      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 touch-manipulation"
                      title="Community settings"
                      aria-label="Community settings"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 bg-gray-50/80 px-2 sm:px-4 py-2">
              <div className="flex gap-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible sm:pb-0">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSortBy(opt.value)}
                    className={`shrink-0 min-h-[40px] px-3 sm:px-4 rounded-full text-sm font-semibold transition-colors touch-manipulation ${
                      sortBy === opt.value
                        ? 'bg-gray-900 text-white'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {topicTags && topicTags.length > 0 && (
              <div className="px-2 sm:px-4 py-3 border-t border-gray-100 bg-white">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">
                  Topics
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible">
                  <button
                    type="button"
                    onClick={() => setTopicFilter(null)}
                    className={`shrink-0 min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors touch-manipulation ${
                      !tagFilter
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    All
                  </button>
                  {topicTags
                    .filter((t) => t?.id && t?.name)
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTopicFilter(t.id)}
                        title={t.description || t.name}
                        className={`shrink-0 min-h-[36px] px-3 rounded-full text-sm font-medium border transition-colors touch-manipulation max-w-[200px] truncate ${
                          tagFilter === t.id
                            ? 'text-white border-transparent'
                            : 'bg-gray-50 text-gray-800 border-gray-200 hover:border-gray-300'
                        }`}
                        style={
                          tagFilter === t.id && t.color && /^#[0-9A-Fa-f]{6}$/.test(t.color)
                            ? { backgroundColor: t.color, borderColor: t.color }
                            : tagFilter === t.id
                              ? { backgroundColor: '#111827', borderColor: '#111827' }
                              : undefined
                        }
                      >
                        {t.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 sm:space-y-2">
            {postsLoading && (
              <>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex rounded-lg border border-gray-200 bg-white overflow-hidden animate-pulse"
                  >
                    <div className="w-12 sm:w-14 bg-gray-100 shrink-0" />
                    <div className="flex-1 p-4 space-y-2">
                      <div className="h-4 bg-gray-100 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-full" />
                      <div className="h-3 bg-gray-100 rounded w-5/6" />
                    </div>
                  </div>
                ))}
              </>
            )}

            {!postsLoading && posts.length === 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  {tagFilter ? 'No posts with this topic' : 'No posts yet'}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {tagFilter
                    ? 'Try another topic or view all posts.'
                    : `Be the first to post in o/${community.name}.`}
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
                  {tagFilter && (
                    <button
                      type="button"
                      onClick={() => setTopicFilter(null)}
                      className="min-h-[44px] px-4 rounded-full border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 touch-manipulation"
                    >
                      Clear topic filter
                    </button>
                  )}
                  <Link
                    to={createPostHref}
                    className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 touch-manipulation"
                  >
                    Create post
                  </Link>
                </div>
              </div>
            )}

            {!postsLoading &&
              posts.map((post) => (
                <article
                  key={post.id}
                  className="flex rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-gray-300 transition-colors shadow-sm"
                >
                  <div className="hidden sm:flex flex-col items-stretch bg-gray-50 border-r border-gray-100 shrink-0 w-11 sm:w-14">
                    <VoteButton
                      postId={post.id}
                      initialVoteScore={post.voteScore ?? 0}
                      initialUserVote={post.userVote ?? null}
                      size="sm"
                      layout="column"
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="px-3 sm:px-4 pt-3 pb-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                        <span className="hidden sm:inline text-gray-400">o/{community.name}</span>
                        <span className="hidden sm:inline text-gray-300">·</span>
                        <span className="inline-flex items-center gap-x-1 flex-wrap">
                          <span className="text-gray-500">u/{post.author?.username ?? 'unknown'}</span>
                          {post.author?.isVerifiedPhysician && <VerifiedPhysicianInline />}
                        </span>
                        <span className="text-gray-300">·</span>
                        <time dateTime={post.createdAt}>{formatRelativeTime(post.createdAt)}</time>
                      </div>
                      <h2 className="mt-1.5 text-base sm:text-lg font-semibold text-gray-900 leading-snug [overflow-wrap:anywhere]">
                        <Link to={`/post/${post.id}`} className="hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                          {post.title}
                        </Link>
                      </h2>
                      {post.type === 'link' && post.linkUrl && (
                        <a
                          href={post.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 max-w-full"
                        >
                          <span className="truncate">{linkHostname(post.linkUrl)}</span>
                          <svg className="w-3.5 h-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                    <div className="px-3 sm:px-4 pb-2">
                      {post.content ? (
                        <p className="text-sm text-gray-700 line-clamp-3 [overflow-wrap:anywhere]">
                          {post.content.length > 280 ? `${post.content.slice(0, 280)}…` : post.content}
                          {post.content.length > 280 && (
                            <Link to={`/post/${post.id}`} className="text-blue-600 hover:underline ml-1 font-medium whitespace-nowrap">
                              more
                            </Link>
                          )}
                        </p>
                      ) : null}
                      {post.type === 'poll' && Array.isArray(post.pollOptions) && (
                        <div className="mt-2">
                          <PostPollBlock
                            postId={post.id}
                            pollOptions={post.pollOptions}
                            pollEndsAt={post.pollEndsAt}
                            pollVoteCounts={post.pollVoteCounts}
                            userPollVoteIndex={post.userPollVoteIndex}
                            pollClosed={post.pollClosed}
                            compact
                          />
                        </div>
                      )}
                      <div className="mt-2">
                        <PostAttachments attachments={post.attachments ?? []} postId={post.id} />
                      </div>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 border-t border-gray-100 bg-white">
                      <div className="sm:hidden">
                        <VoteButton
                          postId={post.id}
                          initialVoteScore={post.voteScore ?? 0}
                          initialUserVote={post.userVote ?? null}
                          size="sm"
                          layout="row"
                        />
                      </div>
                      <Link
                        to={`/post/${post.id}`}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-2.5 rounded-full text-xs sm:text-sm font-semibold text-gray-600 hover:bg-gray-100 touch-manipulation"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {post.commentsCount ?? post._count?.comments ?? 0}
                      </Link>
                      <ShareButton url={`/post/${post.id}`} title={post.title} type="post" />
                    </div>
                  </div>
                </article>
              ))}
          </div>
        </div>

        <aside className="w-full lg:w-72 xl:w-80 shrink-0 order-2 lg:order-2 space-y-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">About</h2>
            <p className="text-sm text-gray-800 leading-relaxed [overflow-wrap:anywhere]">{community.description}</p>
            <dl className="mt-4 space-y-2 text-sm border-t border-gray-100 pt-4">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Members</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {(community.memberCount ?? 0).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Posts</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {(community.postCount ?? 0).toLocaleString()}
                </dd>
              </div>
              {community.createdAt && (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Created</dt>
                  <dd className="font-medium text-gray-800 text-right">
                    {new Date(community.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </dd>
                </div>
              )}
            </dl>
            {canManage && (
              <Link
                to={`/community/${community.slug}/settings`}
                className="mt-4 block w-full text-center min-h-[44px] leading-[44px] rounded-full border border-gray-300 text-sm font-semibold text-gray-800 hover:bg-gray-50 touch-manipulation"
              >
                Manage community
              </Link>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Rules</h2>
            {community.rules?.trim() ? (
              <div className="text-sm text-gray-700 whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed">
                {community.rules.trim()}
              </div>
            ) : (
              <p className="text-sm text-gray-500 leading-relaxed">
                No rules have been published yet. Moderators can add them in community settings.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CommunityPage;
