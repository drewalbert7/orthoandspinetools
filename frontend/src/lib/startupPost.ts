import type { CommunityTag, Post } from '../services/apiService';

export const STARTUP_TAG_MATCH = 'startup';

export function tagLooksLikeStartup(tag: { name?: string; description?: string | null }): boolean {
  const needle = STARTUP_TAG_MATCH;
  const name = (tag.name || '').toLowerCase();
  const description = (tag.description || '').toLowerCase();
  return name.includes(needle) || description.includes(needle);
}

export function isStartupPost(post: Pick<Post, 'tags'>): boolean {
  return (post.tags ?? []).some((postTag) => postTag?.tag && tagLooksLikeStartup(postTag.tag));
}

export function findStartupTag(tags: CommunityTag[]): CommunityTag | undefined {
  return tags.find((tag) => tagLooksLikeStartup(tag));
}
