import type { Request } from 'express';

export const OG_SITE_NAME = 'OrthoAndSpineTools';
export const OG_DEFAULT_DESCRIPTION =
  'Ortho and Spine Tools — Hunt for the Best. A professional community for orthopedic and spine surgeons to discuss cases, tools, biologics, and startups.';

export type OgPostPayload = {
  id: string;
  title: string;
  content: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { firstName: string | null; lastName: string | null; username: string };
  community: { name: string; slug: string } | null;
  attachments: Array<{
    mimeType: string | null;
    optimizedUrl: string | null;
    cloudinaryUrl: string | null;
    thumbnailUrl: string | null;
    path: string;
  }>;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripToPlainText(raw: string, maxLen: number): string {
  const t = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

const IMAGE_EXT_IN_URL = /\.(jpe?g|png|gif|webp|avif|bmp|heic)(\?|#|$)/i;

/** Cloudinary public_id path (folder/name) without version, transforms, or extension. */
function extractCloudinaryPublicIdPath(url: string): string | null {
  const parts = url.trim().split(/\/image\/upload\//i);
  if (parts.length < 2) return null;
  const afterUpload = parts[1].split('?')[0].split('#')[0];
  const segments = afterUpload.split('/').filter(Boolean);
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
    if (seg.includes(',') || /^[a-z]_/i.test(seg)) {
      i++;
      continue;
    }
    if (/^v\d+$/i.test(seg)) {
      i++;
      continue;
    }
    break;
  }
  const rest = segments.slice(i);
  if (rest.length === 0) return null;
  const last = rest.length - 1;
  rest[last] = rest[last].replace(/\.[^/.]+$/, '');
  return rest.join('/');
}

/** Prefer standard link-preview dimensions for Cloudinary delivery URLs. */
export function preferredCloudinaryOgDeliveryUrl(url: string): string {
  const u = url.trim();
  if (!/\/image\/upload\//i.test(u)) return u;

  const publicId = extractCloudinaryPublicIdPath(u);
  if (!publicId) return u;

  const cloudBase = u.split(/\/image\/upload\//i)[0];
  return `${cloudBase}/image/upload/c_fill,w_1200,h_630,q_auto,f_auto/${publicId}`;
}

function urlLooksLikeRasterImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (/\/image\/upload\//i.test(lower)) return true;
  return IMAGE_EXT_IN_URL.test(lower);
}

export function siteOriginFromRequest(req: Request): string {
  const env = process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  if (env && /^https?:\/\//i.test(env)) return env;
  const xfProto = (req.get('x-forwarded-proto') || 'https').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || 'orthoandspinetools.com').split(',')[0].trim();
  const proto = xfProto === 'http' || xfProto === 'https' ? xfProto : 'https';
  return `${proto}://${host}`;
}

function absolutizeMediaUrl(origin: string, url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${origin}${u}`;
  return undefined;
}

function firstResolvedAttachmentUrl(
  origin: string,
  a: OgPostPayload['attachments'][number]
): string | undefined {
  const candidates = [a.cloudinaryUrl, a.path, a.thumbnailUrl, a.optimizedUrl];
  for (const raw of candidates) {
    const url = absolutizeMediaUrl(origin, raw);
    if (url) return url;
  }
  return undefined;
}

/** First suitable raster image (or video poster) URL for Open Graph, absolute HTTPS. */
export function pickOgImage(origin: string, attachments: OgPostPayload['attachments']): string | undefined {
  for (const a of attachments) {
    const mime = (a.mimeType || '').toLowerCase();
    const url = firstResolvedAttachmentUrl(origin, a);
    if (!url) continue;
    if (mime.startsWith('image/') || (!mime.startsWith('video/') && urlLooksLikeRasterImage(url))) {
      return preferredCloudinaryOgDeliveryUrl(url);
    }
  }
  for (const a of attachments) {
    const mime = (a.mimeType || '').toLowerCase();
    if (!mime.startsWith('video/')) continue;
    const url = absolutizeMediaUrl(origin, a.thumbnailUrl || a.cloudinaryUrl || a.path);
    if (url) return preferredCloudinaryOgDeliveryUrl(url);
  }
  return undefined;
}

export function defaultOgImage(origin: string): string {
  return `${origin}/brand-logo.png`;
}

export const DEFAULT_OG_IMAGE_WIDTH = 400;
export const DEFAULT_OG_IMAGE_HEIGHT = 400;

export type OgPageKey = 'home' | 'cases' | 'startups' | 'popular' | 'maude';

export const SHARE_PAGES: Record<
  OgPageKey,
  { path: string; title: string; description: string; ogType: 'website' }
> = {
  home: {
    path: '/',
    title: 'OrthoAndSpineTools — Hunt for the Best',
    description: OG_DEFAULT_DESCRIPTION,
    ogType: 'website',
  },
  cases: {
    path: '/cases',
    title: 'Cases | OrthoAndSpineTools',
    description:
      'Case studies and surgical cases — orthopedic and spine discussions on OrthoAndSpineTools.',
    ogType: 'website',
  },
  startups: {
    path: '/startups',
    title: 'Startups | OrthoAndSpineTools',
    description:
      'Orthopedic and spine startup launches and product discussions across OrthoAndSpineTools communities.',
    ogType: 'website',
  },
  popular: {
    path: '/popular',
    title: 'Popular | OrthoAndSpineTools',
    description: 'Popular orthopedic and spine surgery posts across all communities on OrthoAndSpineTools.',
    ogType: 'website',
  },
  maude: {
    path: '/maude',
    title: 'MAUDE implant trends | OrthoAndSpineTools',
    description:
      'Daily FDA device adverse event report trends from openFDA / MAUDE — early signal charts for orthopedic and spine implants.',
    ogType: 'website',
  },
};

type ShareImageMeta = {
  url: string;
  width?: number;
  height?: number;
  alt: string;
  twitterCard: 'summary' | 'summary_large_image';
};

function shareImageMeta(origin: string, imageUrl: string | undefined, alt: string): ShareImageMeta {
  const url = imageUrl || defaultOgImage(origin);
  const isDefault = url.includes('/brand-logo');
  const isOgSized = /c_fill,w_1200,h_630/i.test(url) || (!isDefault && /\/image\/upload\//i.test(url));
  return {
    url,
    width: isOgSized ? 1200 : isDefault ? DEFAULT_OG_IMAGE_WIDTH : undefined,
    height: isOgSized ? 630 : isDefault ? DEFAULT_OG_IMAGE_HEIGHT : undefined,
    alt,
    twitterCard: isDefault ? 'summary' : 'summary_large_image',
  };
}

function shareMetaTags(opts: {
  headline: string;
  description: string;
  canonical: string;
  ogType: string;
  image: ShareImageMeta;
  robots?: string;
  extraHead?: string;
}): string {
  const e = escapeHtml;
  const dims =
    opts.image.width && opts.image.height
      ? `<meta property="og:image:width" content="${opts.image.width}">
<meta property="og:image:height" content="${opts.image.height}">`
      : '';
  const robots = opts.robots ?? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(opts.headline)}</title>
<link rel="canonical" href="${e(opts.canonical)}">
<meta name="description" content="${e(opts.description)}">
<meta property="og:title" content="${e(opts.headline)}">
<meta property="og:description" content="${e(opts.description)}">
<meta property="og:type" content="${e(opts.ogType)}">
<meta property="og:url" content="${e(opts.canonical)}">
<meta property="og:site_name" content="${e(OG_SITE_NAME)}">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${e(opts.image.url)}">
<meta property="og:image:secure_url" content="${e(opts.image.url)}">
<meta property="og:image:alt" content="${e(opts.image.alt)}">
${dims}
<meta name="twitter:card" content="${opts.image.twitterCard}">
<meta name="twitter:title" content="${e(opts.headline)}">
<meta name="twitter:description" content="${e(opts.description)}">
<meta name="twitter:image" content="${e(opts.image.url)}">
<meta name="robots" content="${e(robots)}">
${opts.extraHead ?? ''}`;
}

function formatHeadline(title: string, communityName: string | null | undefined): string {
  const short = title.length > 52 ? `${title.slice(0, 51).trim()}…` : title;
  const withComm = communityName ? `${short} · o/${communityName}` : short;
  return `${withComm} | ${OG_SITE_NAME}`;
}

/** Card-friendly description for X, iMessage, Slack (≤155 chars). */
export function buildOgMetaDescription(post: OgPostPayload): string {
  const excerpt = post.content ? stripToPlainText(post.content, 155) : '';
  const lead = excerpt || post.title;
  if (lead.length <= 155) return lead;
  return `${lead.slice(0, 152).trimEnd()}…`;
}

function authorDisplayName(author: OgPostPayload['author']): string {
  const full = [author.firstName, author.lastName].filter(Boolean).join(' ').trim();
  return full || author.username;
}

export function buildPostShareHtml(post: OgPostPayload, origin: string): string {
  const canonical = `${origin}/post/${post.id}`;
  const headline = formatHeadline(post.title, post.community?.name);
  const description = buildOgMetaDescription(post);
  const primaryImage = pickOgImage(origin, post.attachments);
  const fallbackLogo = defaultOgImage(origin);
  const ogImageAlt = `Preview image for discussion: ${post.title}${post.community?.name ? ` · o/${post.community.name}` : ''}`.slice(0, 200);
  const ogImage = primaryImage ?? fallbackLogo;
  const imageMeta = shareImageMeta(origin, ogImage, ogImageAlt);
  const authorName = authorDisplayName(post.author);
  const published = post.createdAt.toISOString();
  const modified = post.updatedAt.toISOString();
  const section = post.community?.name || '';
  const excerptBody = post.content
    ? stripToPlainText(post.content, 420)
    : stripToPlainText(post.title, 200);
  const bylineParts: string[] = [];
  if (post.community?.name) bylineParts.push(`o/${post.community.name}`);
  bylineParts.push(`u/${post.author.username}`);
  const byline = bylineParts.join(' · ');

  const e = escapeHtml;
  const articleExtra = `${section ? `<meta property="article:section" content="${e(section)}">` : ''}
<meta property="article:published_time" content="${e(published)}">
<meta property="article:modified_time" content="${e(modified)}">
<meta property="article:author" content="${e(authorName)}">`;

  const hero = primaryImage
    ? `<figure style="margin:0 0 1.25rem;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;background:#f3f4f6">
<img src="${e(primaryImage)}" alt="${e(ogImageAlt)}" width="1200" height="630" style="display:block;width:100%;height:auto;max-height:min(22rem,55vh);object-fit:cover" loading="lazy">
</figure>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${shareMetaTags({
  headline,
  description,
  canonical,
  ogType: 'article',
  image: imageMeta,
  extraHead: articleExtra,
})}
</head>
<body style="margin:0;background:#f9fafb">
<div style="max-width:42rem;margin:0 auto;padding:2rem 1.25rem 2.5rem;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111827">
<p style="margin:0 0 1rem;font-size:0.75rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280">${e(OG_SITE_NAME)}</p>
${hero}
<h1 style="margin:0 0 0.75rem;font-size:1.375rem;font-weight:700;line-height:1.3;letter-spacing:-0.02em">${e(post.title)}</h1>
<p style="margin:0 0 1rem;font-size:0.9375rem;line-height:1.65;color:#374151;border-left:3px solid #2563eb;padding:0.125rem 0 0.125rem 1rem">${e(excerptBody)}</p>
<p style="margin:0 0 1.5rem;font-size:0.8125rem;color:#6b7280">${e(byline)}</p>
<p style="margin:0"><a href="${e(canonical)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;font-size:0.9375rem;padding:0.65rem 1.35rem;border-radius:9999px">View full discussion</a></p>
</div>
</body>
</html>`;
}

export function buildNotFoundShareHtml(origin: string, id: string): string {
  const canonical = `${origin}/post/${encodeURIComponent(id)}`;
  const headline = `Discussion not found | ${OG_SITE_NAME}`;
  const description =
    'This link may be invalid or the post was removed. Browse discussions on OrthoAndSpineTools.';
  const e = escapeHtml;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(headline)}</title>
<link rel="canonical" href="${e(canonical)}">
<meta name="description" content="${e(description)}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="${e(headline)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${e(canonical)}">
<meta property="og:site_name" content="${e(OG_SITE_NAME)}">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${e(headline)}">
<meta name="twitter:description" content="${e(description)}">
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1f2937;max-width:40rem;margin:2rem auto;padding:0 1rem">
<p>${e(description)}</p>
<p><a href="${e(canonical)}">Go to home</a></p>
</body>
</html>`;
}

export type OgCommunityPayload = {
  name: string;
  slug: string;
  description: string | null;
  profileImage: string | null;
  bannerImage: string | null;
  memberCount: number;
  postCount: number;
};

export type OgUserPayload = {
  username: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
  bio: string | null;
  profileImage: string | null;
  postsCount: number;
  commentsCount: number;
};

function pickCommunityOgImage(origin: string, community: OgCommunityPayload): string {
  const banner = community.bannerImage ? absolutizeMediaUrl(origin, community.bannerImage) : undefined;
  const profile = community.profileImage ? absolutizeMediaUrl(origin, community.profileImage) : undefined;
  const img = banner || profile;
  return img ? preferredCloudinaryOgDeliveryUrl(img) : defaultOgImage(origin);
}

export function buildCommunityShareHtml(community: OgCommunityPayload, origin: string): string {
  const canonical = `${origin}/community/${community.slug}`;
  const headline = `o/${community.name} | ${OG_SITE_NAME}`;
  const descRaw = community.description?.trim()
    ? stripToPlainText(community.description, 280)
    : `Orthopedic and spine discussions in o/${community.name} on ${OG_SITE_NAME}.`;
  const stats = `${community.memberCount.toLocaleString()} members · ${community.postCount.toLocaleString()} posts`;
  const description =
    descRaw.length > 240 ? `${descRaw.slice(0, 237).trimEnd()}…` : `${descRaw} · ${stats}`;
  const ogImage = pickCommunityOgImage(origin, community);
  const imageMeta = shareImageMeta(
    origin,
    ogImage,
    `o/${community.name} community on ${OG_SITE_NAME}`
  );
  const e = escapeHtml;
  const body = community.description?.trim()
    ? stripToPlainText(community.description, 420)
    : `Community hub for o/${community.name}.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${shareMetaTags({
  headline,
  description,
  canonical,
  ogType: 'website',
  image: imageMeta,
})}
</head>
<body style="margin:0;background:#f9fafb">
<div style="max-width:42rem;margin:0 auto;padding:2rem 1.25rem 2.5rem;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<p style="margin:0 0 1rem;font-size:0.75rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280">${e(OG_SITE_NAME)}</p>
<h1 style="margin:0 0 0.75rem;font-size:1.375rem;font-weight:700">o/${e(community.name)}</h1>
<p style="margin:0 0 1rem;font-size:0.9375rem;line-height:1.65;color:#374151">${e(body)}</p>
<p style="margin:0 0 1.5rem;font-size:0.8125rem;color:#6b7280">${e(stats)}</p>
<p style="margin:0"><a href="${e(canonical)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;font-size:0.9375rem;padding:0.65rem 1.35rem;border-radius:9999px">View community</a></p>
</div>
</body>
</html>`;
}

export function buildPageShareHtml(pageKey: OgPageKey, origin: string): string {
  const page = SHARE_PAGES[pageKey];
  const canonical = page.path === '/' ? `${origin}/` : `${origin}${page.path}`;
  const imageMeta = shareImageMeta(origin, defaultOgImage(origin), `${OG_SITE_NAME} — Hunt for the Best`);
  const e = escapeHtml;
  const body =
    pageKey === 'home'
      ? 'Professional community for orthopedic and spine surgeons — cases, tools, biologics, and startups.'
      : page.description;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${shareMetaTags({
  headline: page.title,
  description: page.description,
  canonical,
  ogType: page.ogType,
  image: imageMeta,
})}
</head>
<body style="margin:0;background:#f9fafb">
<div style="max-width:42rem;margin:0 auto;padding:2rem 1.25rem 2.5rem;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<p style="margin:0 0 1rem;font-size:0.75rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280">${e(OG_SITE_NAME)}</p>
<h1 style="margin:0 0 0.75rem;font-size:1.375rem;font-weight:700">${e(page.title.replace(` | ${OG_SITE_NAME}`, ''))}</h1>
<p style="margin:0 0 1.5rem;font-size:0.9375rem;line-height:1.65;color:#374151">${e(body)}</p>
<p style="margin:0"><a href="${e(canonical)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;font-size:0.9375rem;padding:0.65rem 1.35rem;border-radius:9999px">Open on ${e(OG_SITE_NAME)}</a></p>
</div>
</body>
</html>`;
}

export function buildCommunityNotFoundShareHtml(origin: string, slug: string): string {
  const canonical = `${origin}/community/${encodeURIComponent(slug)}`;
  const headline = `Community not found | ${OG_SITE_NAME}`;
  const description = 'This community does not exist or is unavailable on OrthoAndSpineTools.';
  const e = escapeHtml;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${e(headline)}</title>
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="${e(headline)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${e(canonical)}">
</head><body><p>${e(description)}</p></body></html>`;
}

export function buildUserShareHtml(user: OgUserPayload, origin: string): string {
  const canonical = `${origin}/user/${user.username}`;
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username;
  const headline = `u/${user.username} | ${OG_SITE_NAME}`;
  const bio = user.bio?.trim() ? stripToPlainText(user.bio, 200) : '';
  const specialty = user.specialty?.trim() || '';
  const stats = `${user.postsCount} posts · ${user.commentsCount} comments`;
  const descriptionParts = [bio || `${displayName} on ${OG_SITE_NAME}`];
  if (specialty) descriptionParts.push(specialty);
  descriptionParts.push(stats);
  let description = descriptionParts.join(' · ');
  if (description.length > 300) description = `${description.slice(0, 297).trimEnd()}…`;
  const ogImage = user.profileImage
    ? preferredCloudinaryOgDeliveryUrl(absolutizeMediaUrl(origin, user.profileImage) || defaultOgImage(origin))
    : defaultOgImage(origin);
  const imageMeta = shareImageMeta(
    origin,
    ogImage,
    `${displayName} (@${user.username}) on ${OG_SITE_NAME}`
  );
  const e = escapeHtml;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${shareMetaTags({
  headline,
  description,
  canonical,
  ogType: 'profile',
  image: imageMeta,
  extraHead: `<meta property="profile:username" content="${e(user.username)}">`,
})}
</head>
<body style="margin:0;background:#f9fafb">
<div style="max-width:42rem;margin:0 auto;padding:2rem 1.25rem 2.5rem;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<p style="margin:0 0 1rem;font-size:0.75rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280">${e(OG_SITE_NAME)}</p>
<h1 style="margin:0 0 0.25rem;font-size:1.375rem;font-weight:700">u/${e(user.username)}</h1>
<p style="margin:0 0 0.75rem;font-size:1rem;color:#374151">${e(displayName)}</p>
${specialty ? `<p style="margin:0 0 1rem;font-size:0.875rem;color:#6b7280">${e(specialty)}</p>` : ''}
${bio ? `<p style="margin:0 0 1rem;font-size:0.9375rem;line-height:1.65;color:#374151">${e(bio)}</p>` : ''}
<p style="margin:0 0 1.5rem;font-size:0.8125rem;color:#6b7280">${e(stats)}</p>
<p style="margin:0"><a href="${e(canonical)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;font-size:0.9375rem;padding:0.65rem 1.35rem;border-radius:9999px">View profile</a></p>
</div>
</body>
</html>`;
}

export function buildUserNotFoundShareHtml(origin: string, username: string): string {
  const canonical = `${origin}/user/${encodeURIComponent(username)}`;
  const headline = `User not found | ${OG_SITE_NAME}`;
  const description = 'This user profile does not exist or is unavailable on OrthoAndSpineTools.';
  const e = escapeHtml;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${e(headline)}</title>
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="${e(headline)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${e(canonical)}">
</head><body><p>${e(description)}</p></body></html>`;
}
