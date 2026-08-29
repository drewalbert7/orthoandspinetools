import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { AppError } from '../middleware/errorHandler';

export interface R2UploadResult {
  public_id: string;
  secure_url: string;
  optimized_url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  format: string;
  resource_type: 'image' | 'video';
  bytes: number;
  provider: 'r2';
}

function accountId(): string {
  return (
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.R2_ACCOUNT_ID ||
    ''
  ).trim();
}

function accessKeyId(): string {
  return (process.env.R2_ACCESS_KEY_ID || '').trim();
}

function secretAccessKey(): string {
  return (process.env.R2_SECRET_ACCESS_KEY || '').trim();
}

function bucket(): string {
  return (process.env.R2_BUCKET || 'orthoandspinetools').trim();
}

function endpoint(): string {
  const explicit = (process.env.R2_ENDPOINT || '').trim().replace(/\/+$/, '');
  if (explicit) {
    // Allow pasting .../bucket — strip trailing bucket segment if present
    const b = bucket();
    if (b && explicit.endsWith(`/${b}`)) {
      return explicit.slice(0, -(b.length + 1));
    }
    return explicit;
  }
  const id = accountId();
  return id ? `https://${id}.r2.cloudflarestorage.com` : '';
}

function publicBaseUrl(): string {
  return (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
}

const PLACEHOLDERS = new Set([
  'your-access-key',
  'your-secret-key',
  'your_access_key_id',
  'your_secret_access_key',
  'placeholder',
  'changeme',
]);

export function isR2Configured(): boolean {
  const key = accessKeyId();
  const secret = secretAccessKey();
  const ep = endpoint();
  const b = bucket();
  if (!key || !secret || !ep || !b) return false;
  if (PLACEHOLDERS.has(key.toLowerCase()) || PLACEHOLDERS.has(secret.toLowerCase())) return false;
  return key.length >= 16 && secret.length >= 16;
}

export function isR2MediaReady(): boolean {
  return isR2Configured();
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!isR2Configured()) {
    throw new AppError('Cloudflare R2 not configured', 500);
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: endpoint(),
      credentials: {
        accessKeyId: accessKeyId(),
        secretAccessKey: secretAccessKey(),
      },
      forcePathStyle: false,
    });
  }
  return client;
}

export function resetR2Client(): void {
  client = null;
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function guessMime(name: string, kind: 'image' | 'video'): string {
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
  if (map[ext]) return map[ext];
  return kind === 'video' ? 'video/mp4' : 'image/jpeg';
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

function buildObjectKey(originalName: string, folder: string, kind: 'image' | 'video'): string {
  const ext = extOf(originalName) || (kind === 'video' ? 'mp4' : 'jpg');
  const safeFolder = (folder || 'uploads').replace(/^\/+|\/+$/g, '');
  return `${safeFolder}/${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeName(originalName)}.${ext}`;
}

async function publicOrSignedUrl(key: string): Promise<string> {
  const base = publicBaseUrl();
  if (base) {
    return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  // Private bucket fallback — long-lived signed GET (not ideal for permanent post embeds)
  const signed = await getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: 60 * 60 * 24 * 7 }
  );
  return signed;
}

export async function uploadToR2(
  buffer: Buffer,
  originalName: string,
  options: { folder?: string; kind?: 'image' | 'video'; contentType?: string } = {}
): Promise<R2UploadResult> {
  const kind = options.kind || (guessMime(originalName, 'image').startsWith('video/') ? 'video' : 'image');
  const key = buildObjectKey(originalName, options.folder || `orthoandspinetools/${kind}s`, kind);
  const contentType = options.contentType || guessMime(originalName, kind);

  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          source: 'orthoandspinetools',
          original: originalName.slice(0, 200),
        },
      })
    );
  } catch (error: any) {
    const msg = error?.message || 'R2 upload failed';
    throw new AppError(`Cloudflare R2 upload failed: ${msg}`, 502);
  }

  const url = await publicOrSignedUrl(key);

  return {
    public_id: key,
    secure_url: url,
    optimized_url: url,
    thumbnail_url: url,
    width: 0,
    height: 0,
    format: extOf(originalName) || (kind === 'video' ? 'mp4' : 'jpg'),
    resource_type: kind,
    bytes: buffer.length,
    provider: 'r2',
  };
}

export async function deleteFromR2(key: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: bucket(),
        Key: key,
      })
    );
  } catch (error: any) {
    throw new AppError(`Cloudflare R2 delete failed: ${error?.message || 'unknown error'}`, 502);
  }
}

export function getR2PublicUrl(key: string): string {
  const base = publicBaseUrl();
  if (!base) return '';
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** Best-effort connectivity check (does not require public URL). */
export async function verifyR2Bucket(): Promise<{ ok: boolean; endpoint: string; bucket: string; error?: string }> {
  const ep = endpoint();
  const b = bucket();
  if (!isR2Configured()) {
    return { ok: false, endpoint: ep, bucket: b, error: 'R2 credentials missing' };
  }
  try {
    await getClient().send(new HeadBucketCommand({ Bucket: b }));
    return { ok: true, endpoint: ep, bucket: b };
  } catch (error: any) {
    return { ok: false, endpoint: ep, bucket: b, error: error?.message || String(error) };
  }
}
