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
  return isCloudflareImagesConfigured();
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

function avatarFlexVariant(): string {
  return 'w=256,h=256,fit=cover,gravity=face,f=auto';
}

function thumbFlexVariant(size = 300): string {
  return `w=${size},h=${size},fit=cover,f=auto`;
}

export function getCloudflareImageUrl(
  imageId: string,
  options: { width?: number; height?: number; avatar?: boolean; thumb?: boolean } = {}
): string {
  if (options.avatar) {
    return buildImagesDeliveryUrl(imageId, avatarFlexVariant()) || buildImagesDeliveryUrl(imageId, imagesVariant());
  }
  if (options.thumb) {
    const size = options.width || options.height || 300;
    return buildImagesDeliveryUrl(imageId, thumbFlexVariant(size)) || buildImagesDeliveryUrl(imageId, imagesVariant());
  }
  if (options.width || options.height) {
    const w = options.width || 1920;
    const h = options.height || 1080;
    return (
      buildImagesDeliveryUrl(imageId, `w=${w},h=${h},fit=scale-down,f=auto`) ||
      buildImagesDeliveryUrl(imageId, imagesVariant())
    );
  }
  return buildImagesDeliveryUrl(imageId, imagesVariant());
}

function toUploadFile(buffer: Buffer, originalName: string, mime: string): File {
  return new File([new Uint8Array(buffer)], originalName || 'upload.bin', { type: mime });
}

export async function uploadImageToCloudflare(
  buffer: Buffer,
  originalName: string,
  options: { isAvatar?: boolean; folder?: string; metadata?: Record<string, string> } = {}
): Promise<CloudflareUploadResult> {
  if (!isCloudflareImagesConfigured()) {
    throw new AppError('Cloudflare Images not configured', 500);
  }

  const form = new FormData();
  form.append('file', toUploadFile(buffer, originalName || 'upload.jpg', guessMime(originalName, 'image/jpeg')));

  const meta: Record<string, string> = {
    source: 'orthoandspinetools',
    ...(options.folder ? { folder: options.folder } : {}),
    ...(options.metadata || {}),
  };
  form.append('metadata', JSON.stringify(meta));

  if (options.folder) {
    const safe = `${options.folder}/${Date.now()}-${sanitizeName(originalName)}`.replace(/^\/+|\/+$/g, '');
    if (safe.length <= 1024 && !isUuid(safe)) {
      form.append('id', safe);
    }
  }

  const result = await cfJson<{
    id: string;
    filename?: string;
    variants?: string[];
  }>(`https://api.cloudflare.com/client/v4/accounts/${accountId()}/images/v1`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });

  const id = result.id;
  const fromApi = pickVariantUrl(result.variants, imagesVariant());
  const secure =
    fromApi ||
    getCloudflareImageUrl(id, options.isAvatar ? { avatar: true } : {}) ||
    getCloudflareImageUrl(id);
  if (!secure) {
    throw new AppError(
      'Cloudflare Images upload succeeded but no delivery URL. Set CLOUDFLARE_IMAGES_HASH (Images → Developer Resources).',
      500
    );
  }

  const optimized = options.isAvatar
    ? getCloudflareImageUrl(id, { avatar: true }) || secure
    : getCloudflareImageUrl(id) || secure;
  const thumbnail = getCloudflareImageUrl(id, { thumb: true, width: 64 }) || secure;

  return {
    public_id: id,
    secure_url: secure,
    optimized_url: optimized,
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
  const hls = result.playback?.hls || `https://videodelivery.net/${uid}/manifest/video.m3u8`;
  const thumb = result.thumbnail || `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg`;

  return {
    public_id: uid,
    secure_url: hls,
    optimized_url: hls,
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

function sanitizeName(name: string): string {
  return (
    name
      .replace(/\.[^/.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'file'
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
