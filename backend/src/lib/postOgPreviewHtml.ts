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

export function pickOgImage(origin: string, attachments: OgPostPayload['attachments']): string | undefined {
  for (const a of attachments) {
    const mime = (a.mimeType || '').toLowerCase();
    if (!mime.startsWith('image/')) continue;
    const url = absolutizeMediaUrl(origin, a.optimizedUrl || a.cloudinaryUrl || a.thumbnailUrl || a.path);
    if (url) return url;
  }
  for (const a of attachments) {
    const mime = (a.mimeType || '').toLowerCase();
    if (!mime.startsWith('video/')) continue;
    const url = absolutizeMediaUrl(origin, a.thumbnailUrl || a.cloudinaryUrl || a.path);
    if (url) return url;
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

function buildDescription(post: OgPostPayload): string {
  const excerpt = post.content ? stripToPlainText(post.content, 200) : '';
  const lead = excerpt ? excerpt : post.title;
  const communityLabel = post.community?.name ? `o/${post.community.name}` : '';
  const parts: string[] = [];
  const leadTrim = lead.length > 240 ? `${lead.slice(0, 239).trim()}…` : lead;
  parts.push(leadTrim);
  if (communityLabel) parts.push(communityLabel);
  parts.push(OG_SITE_NAME);
  parts.push('Peer discussion for orthopedic and spine specialists.');
  const combined = parts.join(' · ');
  return combined.length > 300 ? `${combined.slice(0, 297)}…` : combined;
}

function authorDisplayName(author: OgPostPayload['author']): string {
  const full = [author.firstName, author.lastName].filter(Boolean).join(' ').trim();
  return full || author.username;
}

export function buildPostShareHtml(post: OgPostPayload, origin: string): string {
  const canonical = `${origin}/post/${post.id}`;
  const headline = formatHeadline(post.title, post.community?.name);
  const description = buildDescription(post);
  const primaryImage = pickOgImage(origin, post.attachments);
  const ogImage = primaryImage ?? defaultOgImage(origin);
  const twitterCard = primaryImage ? 'summary_large_image' : 'summary';
  const ogImageAlt = `${post.title}${post.community?.name ? ` · o/${post.community.name}` : ''}`.slice(0, 200);
  const authorName = authorDisplayName(post.author);
  const published = post.createdAt.toISOString();
  const modified = post.updatedAt.toISOString();
  const section = post.community?.name || '';

  const e = escapeHtml;
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
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1f2937;max-width:40rem;margin:2rem auto;padding:0 1rem">
<p style="color:#6b7280;font-size:0.875rem">${e(OG_SITE_NAME)}</p>
<h1 style="font-size:1.25rem;font-weight:600">${e(post.title)}</h1>
<p>${e(description)}</p>
<p><a href="${e(canonical)}">View full discussion</a></p>
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
