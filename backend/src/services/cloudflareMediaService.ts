import { File } from 'node:buffer';
import { AppError } from '../middleware/errorHandler';

export type CloudflareMediaKind = 'image' | 'video';

export interface CloudflareUploadResult {
  public_id: string;
  secure_url: string;
  optimized_url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  format: string;
  resource_type: CloudflareMediaKind;
  bytes: number;
  duration?: number;
  provider: 'cloudflare_images' | 'cloudflare_stream';
}

function accountId(): string {
  return (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
}

function apiToken(): string {
  return (process.env.CLOUDFLARE_API_TOKEN || '').trim();
}

function imagesHash(): string {
  return (process.env.CLOUDFLARE_IMAGES_HASH || '').trim();
}

function imagesVariant(): string {
  return (process.env.CLOUDFLARE_IMAGES_VARIANT || 'public').trim() || 'public';
}

const PLACEHOLDERS = new Set([
  'your-account-id',
  'your-api-token',
  'your-images-hash',
  'placeholder',
  'changeme',
]);

export function isCloudflareImagesConfigured(): boolean {
  const id = accountId();
  const token = apiToken();
  if (!id || !token) return false;
  if (PLACEHOLDERS.has(id.toLowerCase()) || PLACEHOLDERS.has(token.toLowerCase())) return false;
  if (!/^[a-f0-9]{32}$/i.test(id)) return false;
  return token.length >= 20;
}

export function isCloudflareStreamConfigured(): boolean {
  return isCloudflareImagesConfigured();
}

export function isCloudflareMediaReady(): boolean {
  // Delivery URLs need the Images account hash (Dashboard → Images → Developer Resources)
  return isCloudflareImagesConfigured() && Boolean(imagesHash());
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${apiToken()}` };
}

async function cfJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || body?.success === false) {
    const msg =
      body?.errors?.[0]?.message ||
      body?.messages?.[0] ||
      `Cloudflare API ${res.status}`;
    throw new AppError(String(msg), res.status >= 400 && res.status < 600 ? res.status : 502);
  }
  return body.result as T;
}

function pickVariantUrl(variants: string[] | undefined, prefer?: string): string | null {
  if (!variants?.length) return null;
  if (prefer) {
    const match = variants.find((v) => v.endsWith(`/${prefer}`) || v.includes(`/${prefer}`));
    if (match) return match;
  }
  const publicVariant = variants.find((v) => v.endsWith('/public'));
  return publicVariant || variants[0] || null;
}

function buildImagesDeliveryUrl(imageId: string, variantOrFlex: string): string {
  const hash = imagesHash();
  if (!hash) return '';
  return `https://imagedelivery.net/${hash}/${imageId}/${variantOrFlex}`;
}

/** Named variants created in Cloudflare Images (Reddit-like sizes). */
function namedOrFlex(
  imageId: string,
  named: string,
  flex: string
): string {
  return (
    buildImagesDeliveryUrl(imageId, named) ||
    buildImagesDeliveryUrl(imageId, flex) ||
    buildImagesDeliveryUrl(imageId, imagesVariant())
  );
}

export function getCloudflareImageUrl(
  imageId: string,
  options: { width?: number; height?: number; avatar?: boolean; thumb?: boolean; banner?: boolean } = {}
): string {
  if (options.avatar) {
    return namedOrFlex(imageId, 'avatar', 'w=256,h=256,fit=cover,gravity=face,f=auto');
  }
  if (options.thumb) {
    const size = options.width || options.height || 64;
    return namedOrFlex(imageId, 'thumb', `w=${size},h=${size},fit=cover,f=auto`);
  }
  if (options.banner) {
    return namedOrFlex(imageId, 'banner', 'w=1920,h=1080,fit=scale-down,f=auto');
  }
  if (options.width || options.height) {
    const w = options.width || 1920;
    const h = options.height || 1920;
    return namedOrFlex(imageId, 'feed', `w=${w},h=${h},fit=scale-down,f=auto`);
  }
  // Default feed delivery — scale-down to 1920
  return namedOrFlex(imageId, 'feed', 'w=1920,h=1920,fit=scale-down,f=auto');
}

function toUploadFile(buffer: Buffer, originalName: string, mime: string): File {
  return new File([new Uint8Array(buffer)], originalName || 'upload.bin', { type: mime });
}

export async function uploadImageToCloudflare(
  buffer: Buffer,
  originalName: string,
  options: {
    isAvatar?: boolean;
    isBanner?: boolean;
    folder?: string;
    metadata?: Record<string, string>;
  } = {}
): Promise<CloudflareUploadResult> {
  if (!isCloudflareImagesConfigured()) {
    throw new AppError('Cloudflare Images not configured', 500);
  }

  // Direct Creator Upload — more reliable than /images/v1 multipart on some accounts
  const draftForm = new FormData();
  draftForm.append('requireSignedURLs', 'false');
  const meta: Record<string, string> = {
    source: 'orthoandspinetools',
    ...(options.folder ? { folder: options.folder } : {}),
    ...(options.metadata || {}),
  };
  draftForm.append('metadata', JSON.stringify(meta));
  // Prefer UUID ids from CF (custom slash ids complicate DELETE routes)
  // Do not set custom id unless needed for debugging.

  const draft = await cfJson<{ id: string; uploadURL: string }>(
    `https://api.cloudflare.com/client/v4/accounts/${accountId()}/images/v2/direct_upload`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: draftForm,
    }
  );

  if (!draft?.id || !draft?.uploadURL) {
    throw new AppError('Cloudflare Images did not return an upload URL', 502);
  }

  const fileForm = new FormData();
  fileForm.append(
    'file',
    toUploadFile(buffer, originalName || 'upload.jpg', guessMime(originalName, 'image/jpeg'))
  );
  const upRes = await fetch(draft.uploadURL, { method: 'POST', body: fileForm });
  let upBody: any = null;
  try {
    upBody = await upRes.json();
  } catch {
    upBody = null;
  }
  if (!upRes.ok || upBody?.success === false) {
    const msg = upBody?.errors?.[0]?.message || `Cloudflare Images upload failed (${upRes.status})`;
    throw new AppError(String(msg), 502);
  }

  const id = (upBody?.result?.id as string) || draft.id;
  const variants: string[] | undefined = upBody?.result?.variants;
  const fromApi = pickVariantUrl(variants, imagesVariant());

  const sized = options.isAvatar
    ? getCloudflareImageUrl(id, { avatar: true })
    : options.isBanner
      ? getCloudflareImageUrl(id, { banner: true })
      : getCloudflareImageUrl(id, { width: 1920, height: 1920 });

  const secure = sized || fromApi || getCloudflareImageUrl(id) || '';
  if (!secure) {
    throw new AppError(
      'Cloudflare Images upload succeeded but no delivery URL. Set CLOUDFLARE_IMAGES_HASH (Images → Developer Resources).',
      500
    );
  }

  const thumbnail = getCloudflareImageUrl(id, { thumb: true, width: 64 }) || secure;

  return {
    public_id: id,
    secure_url: secure,
    optimized_url: sized || secure,
    thumbnail_url: thumbnail,
    width: options.isAvatar ? 256 : 0,
    height: options.isAvatar ? 256 : 0,
    format: extOf(originalName) || 'jpg',
    resource_type: 'image',
    bytes: buffer.length,
    provider: 'cloudflare_images',
  };
}

export async function uploadVideoToCloudflare(
  buffer: Buffer,
  originalName: string,
  options: { folder?: string; metadata?: Record<string, string> } = {}
): Promise<CloudflareUploadResult> {
  if (!isCloudflareStreamConfigured()) {
    throw new AppError('Cloudflare Stream not configured', 500);
  }

  const form = new FormData();
  form.append('file', toUploadFile(buffer, originalName || 'upload.mp4', guessMime(originalName, 'video/mp4')));
  form.append(
    'meta',
    JSON.stringify({
      name: originalName,
      source: 'orthoandspinetools',
      ...(options.folder ? { folder: options.folder } : {}),
      ...(options.metadata || {}),
    })
  );

  const result = await cfJson<{
    uid: string;
    thumbnail?: string;
    playback?: { hls?: string; dash?: string };
    duration?: number;
    input?: { width?: number; height?: number };
    size?: number;
  }>(`https://api.cloudflare.com/client/v4/accounts/${accountId()}/stream`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });

  const uid = result.uid;
  const hls =
    result.playback?.hls || `https://videodelivery.net/${uid}/manifest/video.m3u8`;
  // Prefer customer subdomain from HLS for iframe / MP4 (works in <video> after encode)
  const hostMatch = /^https:\/\/([^/]+)\//i.exec(hls);
  const host = hostMatch?.[1] || 'videodelivery.net';
  const iframe = `https://${host}/${uid}/iframe`;
  const mp4 = `https://${host}/${uid}/downloads/default.mp4`;
  const thumb =
    result.thumbnail || `https://${host}/${uid}/thumbnails/thumbnail.jpg`;

  return {
    public_id: uid,
    // iframe is always playable; frontend also handles Stream hosts
    secure_url: iframe,
    optimized_url: mp4,
    thumbnail_url: thumb,
    width: result.input?.width || 0,
    height: result.input?.height || 0,
    format: extOf(originalName) || 'mp4',
    resource_type: 'video',
    bytes: typeof result.size === 'number' ? result.size : buffer.length,
    duration: typeof result.duration === 'number' ? Math.round(result.duration) : undefined,
    provider: 'cloudflare_stream',
  };
}

export async function deleteCloudflareImage(imageId: string): Promise<void> {
  if (!isCloudflareImagesConfigured()) {
    throw new AppError('Cloudflare Images not configured', 500);
  }
  await cfJson(`https://api.cloudflare.com/client/v4/accounts/${accountId()}/images/v1/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function deleteCloudflareStreamVideo(uid: string): Promise<void> {
  if (!isCloudflareStreamConfigured()) {
    throw new AppError('Cloudflare Stream not configured', 500);
  }
  await cfJson(`https://api.cloudflare.com/client/v4/accounts/${accountId()}/stream/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function deleteFromCloudflare(publicId: string, kind: CloudflareMediaKind = 'image'): Promise<void> {
  if (kind === 'video') {
    await deleteCloudflareStreamVideo(publicId);
    return;
  }
  await deleteCloudflareImage(publicId);
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function guessMime(name: string, fallback: string): string {
  const ext = extOf(name);
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
  };
  return map[ext] || fallback;
}
