import type { Community, Post } from '../services/apiService';

export const SEO_DEFAULTS = {
  siteName: 'OrthoAndSpineTools',
  title: 'OrthoAndSpineTools — Hunt for the Best',
  description: 'Ortho and Spine Tools - Hunt for the Best',
} as const;

export function getSiteOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SITE_URL : undefined;
  if (typeof env === 'string' && env.startsWith('http')) {
    return env.replace(/\/$/, '');
  }
  return 'https://orthoandspinetools.com';
}

export function absoluteUrl(path: string): string {
  const base = getSiteOrigin();
  if (!path || path === '/') return base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export function stripToPlainText(raw: string, maxLen: number): string {
  if (!raw) return '';
  const t = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

function truncateForMeta(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

/** Browser / og:title line: title · community | site (kept reasonably short for tabs and shares). */
export function formatPostShareHeadline(post: Post): string {
  const maxTitle = 52;
  const shortTitle = truncateForMeta(post.title, maxTitle);
  const c = post.community?.name;
  const withComm = c ? `${shortTitle} · o/${c}` : shortTitle;
  return `${withComm} | ${SEO_DEFAULTS.siteName}`;
}

/** Open Graph / meta description: excerpt, community, site, one trust line. */
export function postDescription(post: Post): string {
  const excerpt = post.content ? stripToPlainText(post.content, 200) : '';
  const lead = excerpt ? excerpt : post.title;
  const communityLabel = post.community?.name ? `o/${post.community.name}` : '';
  const parts = [truncateForMeta(lead, 240)];
  if (communityLabel) parts.push(communityLabel);
  parts.push(SEO_DEFAULTS.siteName);
  parts.push('Peer discussion for orthopedic and spine specialists.');
  const combined = parts.join(' · ');
  return combined.length > 300 ? `${combined.slice(0, 297)}…` : combined;
}

export function postOgImage(post: Post): string | undefined {
  const atts = post.attachments ?? [];
  for (const a of atts) {
    const mime = a.mimeType ?? '';
    if (!mime.startsWith('image/')) continue;
    const url = a.optimizedUrl || a.cloudinaryUrl || a.thumbnailUrl || a.path;
    if (url && /^https?:\/\//i.test(url)) return url;
  }
  for (const a of atts) {
    const mime = a.mimeType ?? '';
    if (!mime.startsWith('video/')) continue;
    const url = a.thumbnailUrl || a.cloudinaryUrl || a.path;
    if (url && /^https?:\/\//i.test(url)) return url;
  }
  return undefined;
}

/** Absolute URL for default share image (square logo; use with summary card, not large_image). */
export function defaultShareOgImageUrl(): string {
  return absoluteUrl('/brand-logo.png');
}

export function buildPostJsonLd(post: Post): Record<string, unknown> {
  const origin = getSiteOrigin();
  const postPath = `/post/${post.id}`;
  const postUrl = absoluteUrl(postPath);
  const comm = post.community;
  const communityPath = comm ? `/community/${comm.slug || comm.id}` : null;
  const communityUrl = communityPath ? absoluteUrl(communityPath) : origin;
  const authorName = post.author
    ? [post.author.firstName, post.author.lastName].filter(Boolean).join(' ').trim() || post.author.username
    : 'Member';
  const published = post.createdAt;
  const modified = post.updatedAt || published;
  const keywords =
    post.tags
      ?.map((t) => t?.tag?.name)
      .filter(Boolean)
      .join(', ') || undefined;
  const image = postOgImage(post);

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: SEO_DEFAULTS.siteName,
      url: origin,
      description: SEO_DEFAULTS.description,
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${postUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
        ...(comm
          ? [
              {
                '@type': 'ListItem',
                position: 2,
                name: `o/${comm.name}`,
                item: communityUrl,
              },
            ]
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
        ...(post.author?.username
          ? { url: absoluteUrl(`/user/${post.author.username}`) }
          : {}),
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
        userInteractionCount: post._count?.comments ?? 0,
      },
      ...(keywords ? { keywords } : {}),
      ...(image ? { image: { '@type': 'ImageObject', url: image } } : {}),
      publisher: {
        '@type': 'Organization',
        name: SEO_DEFAULTS.siteName,
        url: origin,
      },
    },
  ];

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

export function buildCommunityJsonLd(community: Community, slugParam: string): Record<string, unknown> {
  const origin = getSiteOrigin();
  const pathSeg = community.slug || slugParam;
  const path = `/community/${pathSeg}`;
  const url = absoluteUrl(path);
  const desc = stripToPlainText(community.description || '', 400);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SEO_DEFAULTS.siteName,
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

export function buildHomeJsonLd(): Record<string, unknown> {
  const origin = getSiteOrigin();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SEO_DEFAULTS.siteName,
        url: origin,
        description: SEO_DEFAULTS.description,
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${origin}/search?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'CollectionPage',
        '@id': `${origin}/#home-feed`,
        name: 'Latest discussions',
        description: SEO_DEFAULTS.description,
        isPartOf: { '@id': `${origin}/#website` },
        url: origin,
      },
    ],
  };
}
