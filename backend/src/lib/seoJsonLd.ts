import { stripToPlainText } from './postOgPreviewHtml';
import type { OgCommunityPayload, OgPostPayload, OgUserPayload } from './postOgPreviewHtml';

const SITE_NAME = 'OrthoAndSpineTools';

export function jsonLdScriptTag(data: Record<string, unknown>): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function authorDisplayName(author: OgPostPayload['author']): string {
  const full = [author.firstName, author.lastName].filter(Boolean).join(' ').trim();
  return full || author.username;
}

export function buildPostDiscussionJsonLd(
  post: OgPostPayload,
  origin: string,
  commentCount = 0
): Record<string, unknown> {
  const postUrl = `${origin}/post/${post.id}`;
  const comm = post.community;
  const communityUrl = comm ? `${origin}/community/${comm.slug}` : origin;
  const authorName = authorDisplayName(post.author);
  const published = post.createdAt.toISOString();
  const modified = post.updatedAt.toISOString();

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SITE_NAME,
        url: origin,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${postUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
          ...(comm
            ? [{ '@type': 'ListItem', position: 2, name: `o/${comm.name}`, item: communityUrl }]
            : []),
          {
            '@type': 'ListItem',
            position: comm ? 3 : 2,
            name: post.title,
            item: postUrl,
          },
        ],
      },
      {
        '@type': 'DiscussionForumPosting',
        '@id': `${postUrl}#discussion`,
        headline: post.title,
        ...(post.content ? { text: stripToPlainText(post.content, 8000) } : {}),
        url: postUrl,
        datePublished: published,
        dateModified: modified,
        author: {
          '@type': 'Person',
          name: authorName,
          url: `${origin}/user/${post.author.username}`,
        },
        ...(comm
          ? {
              articleSection: comm.name,
              isPartOf: {
                '@type': 'WebPage',
                '@id': communityUrl,
                name: `o/${comm.name}`,
              },
            }
          : {}),
        interactionStatistic: {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/CommentAction',
          userInteractionCount: commentCount,
        },
        publisher: {
          '@type': 'Organization',
          name: SITE_NAME,
          url: origin,
        },
      },
    ],
  };
}

export function buildCommunityDiscussionJsonLd(
  community: OgCommunityPayload,
  origin: string
): Record<string, unknown> {
  const url = `${origin}/community/${community.slug}`;
  const desc = community.description?.trim()
    ? stripToPlainText(community.description, 400)
    : undefined;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SITE_NAME,
        url: origin,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
          { '@type': 'ListItem', position: 2, name: `o/${community.name}`, item: url },
        ],
      },
      {
        '@type': 'DiscussionForum',
        '@id': `${url}#forum`,
        name: `o/${community.name}`,
        ...(desc ? { description: desc } : {}),
        url,
        isPartOf: { '@id': `${origin}/#website` },
      },
    ],
  };
}

export function buildUserProfileJsonLd(user: OgUserPayload, origin: string): Record<string, unknown> {
  const url = `${origin}/user/${user.username}`;
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username;
  const bio = user.bio?.trim() ? stripToPlainText(user.bio, 500) : undefined;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SITE_NAME,
        url: origin,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
          { '@type': 'ListItem', position: 2, name: `u/${user.username}`, item: url },
        ],
      },
      {
        '@type': 'ProfilePage',
        '@id': `${url}#profilepage`,
        url,
        name: `u/${user.username}`,
        description: bio || `${displayName} on ${SITE_NAME}`,
        mainEntity: { '@id': `${url}#person` },
        isPartOf: { '@id': `${origin}/#website` },
      },
      {
        '@type': 'Person',
        '@id': `${url}#person`,
        name: displayName,
        alternateName: user.username,
        url,
        ...(user.profileImage ? { image: user.profileImage } : {}),
        ...(user.specialty?.trim() ? { jobTitle: user.specialty.trim() } : {}),
        ...(bio ? { description: bio } : {}),
        interactionStatistic: [
          {
            '@type': 'InteractionCounter',
            interactionType: 'https://schema.org/WriteAction',
            userInteractionCount: user.postsCount,
            name: 'Posts',
          },
          {
            '@type': 'InteractionCounter',
            interactionType: 'https://schema.org/CommentAction',
            userInteractionCount: user.commentsCount,
            name: 'Comments',
          },
        ],
      },
    ],
  };
}

export function buildHubCollectionJsonLd(
  origin: string,
  path: string,
  name: string,
  description: string
): Record<string, unknown> {
  const url = path === '/' ? `${origin}/` : `${origin}${path}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SITE_NAME,
        url: origin,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
          { '@type': 'ListItem', position: 2, name, item: url },
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': `${url}#collection`,
        name,
        description,
        url,
        isPartOf: { '@id': `${origin}/#website` },
      },
    ],
  };
}
