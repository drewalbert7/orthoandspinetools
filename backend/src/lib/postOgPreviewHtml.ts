import type { Request } from 'express';

export const OG_SITE_NAME = 'OrthoAndSpineTools';
export const OG_DEFAULT_DESCRIPTION = 'Ortho and Spine Tools - Hunt for the Best';

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
    .replace(/[#>*_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

const IMAGE_EXT_IN_URL = /\.(jpe?g|png|gif|webp|avif|bmp|heic)(\?|#|$)/i;

/** Prefer standard link-preview dimensions for Cloudinary delivery URLs. */
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
  return absolutizeMediaUrl(
    origin,
    a.optimizedUrl || a.cloudinaryUrl || a.thumbnailUrl || a.path
  );
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

function formatHeadline(title: string, communityName: string | null | undefined): string {
  const short = title.length > 52 ? `${title.slice(0, 51).trim()}…` : title;
  const withComm = communityName ? `${short} · o/${communityName}` : short;
  return `${withComm} | ${OG_SITE_NAME}`;
}

/** og:description — excerpt first, then community, author, site (≤300 chars for major platforms). */
export function buildOgMetaDescription(post: OgPostPayload): string {
  const excerpt = post.content ? stripToPlainText(post.content, 280) : '';
  const lead = excerpt || post.title;
  const body = lead.length > 200 ? `${lead.slice(0, 197).trimEnd()}…` : lead;
  const comm = post.community?.name ? `o/${post.community.name}` : '';
  const author = post.author?.username ? `u/${post.author.username}` : '';
  const parts = [body];
  if (comm) parts.push(comm);
  if (author) parts.push(author);
  parts.push(OG_SITE_NAME);
  let out = parts.join(' · ');
  if (out.length > 300) out = `${out.slice(0, 297).trimEnd()}…`;
  return out;
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
  const usingPostImage = Boolean(primaryImage);
  const ogImage = primaryImage ?? fallbackLogo;
  const twitterCard = usingPostImage ? 'summary_large_image' : 'summary';
  const ogImageAlt = `Preview image for discussion: ${post.title}${post.community?.name ? ` · o/${post.community.name}` : ''}`.slice(0, 200);
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
  const ogDims =
    primaryImage && /c_fill,w_1200,h_630/i.test(primaryImage)
      ? `<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">`
      : '';

  const hero = primaryImage
    ? `<figure style="margin:0 0 1.25rem;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;background:#f3f4f6">
<img src="${e(primaryImage)}" alt="${e(ogImageAlt)}" width="1200" height="630" style="display:block;width:100%;height:auto;max-height:min(22rem,55vh);object-fit:cover" loading="lazy">
</figure>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(headline)}</title>
<link rel="canonical" href="${e(canonical)}">
<meta name="description" content="${e(description)}">
<meta property="og:title" content="${e(headline)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${e(canonical)}">
<meta property="og:site_name" content="${e(OG_SITE_NAME)}">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${e(ogImage)}">
<meta property="og:image:alt" content="${e(ogImageAlt)}">
${ogDims}
<meta property="article:published_time" content="${e(published)}">
<meta property="article:modified_time" content="${e(modified)}">
${section ? `<meta property="article:section" content="${e(section)}">` : ''}
<meta property="article:author" content="${e(authorName)}">
<meta name="twitter:card" content="${twitterCard}">
<meta name="twitter:title" content="${e(headline)}">
<meta name="twitter:description" content="${e(description)}">
<meta name="twitter:image" content="${e(ogImage)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
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
