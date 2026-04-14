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

const IMAGE_EXT_IN_URL = /\.(jpe?g|png|gif|webp|avif|bmp|heic)(\?|#|$)/i;

/** Prefer 1200×630 delivery for Cloudinary image URLs (link-preview friendly). */
export function preferredCloudinaryOgDeliveryUrl(url: string): string {
  const u = url.trim();
  if (!/\/image\/upload\//i.test(u)) return u;
  if (/\/image\/upload\/[^/]*\b(c_fill|w_1200|h_630)\b/i.test(u)) return u;
  if (/\/image\/upload\/s--/i.test(u)) return u;
  if (!/\/image\/upload\/v\d+\//i.test(u) && !/\/image\/upload\/[\w.-]+\/v\d+\//i.test(u)) return u;
  return u.replace(/\/image\/upload\//i, '/image/upload/c_fill,w_1200,h_630,q_auto,f_auto/');
}

function urlLooksLikeRasterImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (/\/image\/upload\//i.test(lower)) return true;
  return IMAGE_EXT_IN_URL.test(lower);
}

function resolveAttachmentMediaUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return preferredCloudinaryOgDeliveryUrl(u);
  if (u.startsWith('/')) return preferredCloudinaryOgDeliveryUrl(`${getSiteOrigin()}${u}`);
  return undefined;
}

/** Open Graph / meta description: excerpt, community, author, site (≤300 chars). */
export function postDescription(post: Post): string {
  const excerpt = post.content ? stripToPlainText(post.content, 280) : '';
  const lead = excerpt || post.title;
  const body = lead.length > 200 ? `${lead.slice(0, 197).trimEnd()}…` : lead;
  const comm = post.community?.name ? `o/${post.community.name}` : '';
  const author = post.author?.username ? `u/${post.author.username}` : '';
  const parts = [body];
  if (comm) parts.push(comm);
  if (author) parts.push(author);
  parts.push(SEO_DEFAULTS.siteName);
  let out = parts.join(' · ');
  if (out.length > 300) out = `${out.slice(0, 297).trimEnd()}…`;
  return out;
}

export function postOgImage(post: Post): string | undefined {
  const atts = post.attachments ?? [];
  for (const a of atts) {
    const mime = (a.mimeType || '').toLowerCase();
    const raw = a.optimizedUrl || a.cloudinaryUrl || a.thumbnailUrl || a.path;
    const url = resolveAttachmentMediaUrl(raw);
    if (!url) continue;
    if (mime.startsWith('image/') || (!mime.startsWith('video/') && urlLooksLikeRasterImage(url))) {
      return url;
    }
  }
  for (const a of atts) {
    const mime = (a.mimeType || '').toLowerCase();
    if (!mime.startsWith('video/')) continue;
    const url = resolveAttachmentMediaUrl(a.thumbnailUrl || a.cloudinaryUrl || a.path);
    if (url) return url;
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
