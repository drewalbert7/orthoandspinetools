import { AppError } from '../middleware/errorHandler';
import {
  deleteFromCloudinary,
  getOptimizedImageUrl as getCloudinaryOptimizedUrl,
  getThumbnailUrl as getCloudinaryThumbnailUrl,
  isCloudinaryMediaReady,
  uploadToCloudinary,
  type CloudinaryUploadResult,
} from './cloudinaryService';
import {
  deleteFromCloudflare,
  getCloudflareImageUrl,
  isCloudflareMediaReady,
  uploadImageToCloudflare,
  uploadVideoToCloudflare,
  type CloudflareUploadResult,
} from './cloudflareMediaService';
import {
  deleteFromR2,
  getR2PublicUrl,
  isR2MediaReady,
  uploadToR2,
  type R2UploadResult,
} from './r2MediaService';

export type MediaProvider = 'r2' | 'cloudflare' | 'cloudinary';

export interface MediaUploadResult {
  public_id: string;
  secure_url: string;
  optimized_url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  format: string;
  resource_type: 'image' | 'video';
  bytes: number;
  duration?: number;
  provider: MediaProvider;
}

function preferredProvider(): MediaProvider | null {
  const forced = (process.env.MEDIA_PROVIDER || 'auto').trim().toLowerCase();
  if (forced === 'r2' || forced === 'cloudflare_r2') {
    return isR2MediaReady() ? 'r2' : null;
  }
  if (forced === 'cloudflare' || forced === 'cloudflare_images') {
    return isCloudflareMediaReady() ? 'cloudflare' : null;
  }
  if (forced === 'cloudinary') {
    return isCloudinaryMediaReady() ? 'cloudinary' : null;
  }
  // auto: R2 → Cloudflare Images/Stream → Cloudinary
  if (isR2MediaReady()) return 'r2';
  if (isCloudflareMediaReady()) return 'cloudflare';
  if (isCloudinaryMediaReady()) return 'cloudinary';
  return null;
}

export function getActiveMediaProvider(): MediaProvider | null {
  return preferredProvider();
}

export function isMediaStorageReady(): boolean {
  return preferredProvider() !== null;
}

export function getMediaStatus() {
  const active = preferredProvider();
  return {
    activeProvider: active,
    r2Configured: isR2MediaReady(),
    cloudflareConfigured: isCloudflareMediaReady(),
    cloudinaryConfigured: isCloudinaryMediaReady(),
    mediaConfigured: active !== null,
  };
}

function fromCloudinary(result: CloudinaryUploadResult, kind: 'image' | 'video'): MediaUploadResult {
  const optimized =
    kind === 'image' ? getCloudinaryOptimizedUrl(result.public_id) || result.secure_url : result.secure_url;
  const thumbnail =
    kind === 'image' ? getCloudinaryThumbnailUrl(result.public_id) || result.secure_url : result.secure_url;
  return {
    public_id: result.public_id,
    secure_url: result.secure_url,
    optimized_url: optimized,
    thumbnail_url: thumbnail,
    width: result.width || 0,
    height: result.height || 0,
    format: result.format || '',
    resource_type: kind,
    bytes: result.bytes || 0,
    duration: result.duration,
    provider: 'cloudinary',
  };
}

function fromCloudflare(result: CloudflareUploadResult): MediaUploadResult {
  return {
    public_id: result.public_id,
    secure_url: result.secure_url,
    optimized_url: result.optimized_url || result.secure_url,
    thumbnail_url: result.thumbnail_url || result.secure_url,
    width: result.width || 0,
    height: result.height || 0,
    format: result.format || '',
    resource_type: result.resource_type,
    bytes: result.bytes || 0,
    duration: result.duration,
    provider: 'cloudflare',
  };
}

function fromR2(result: R2UploadResult): MediaUploadResult {
  return {
    public_id: result.public_id,
    secure_url: result.secure_url,
    optimized_url: result.optimized_url || result.secure_url,
    thumbnail_url: result.thumbnail_url || result.secure_url,
    width: result.width || 0,
    height: result.height || 0,
    format: result.format || '',
    resource_type: result.resource_type,
    bytes: result.bytes || 0,
    provider: 'r2',
  };
}

export async function uploadImageMedia(
  buffer: Buffer,
  originalName: string,
  options: { isAvatar?: boolean; folder?: string } = {}
): Promise<MediaUploadResult> {
  const provider = preferredProvider();
  if (!provider) {
    throw new AppError('No media storage configured (R2, Cloudflare Images, or Cloudinary)', 500);
  }

  if (provider === 'r2') {
    const folder = options.isAvatar
      ? 'orthoandspinetools/avatars'
      : options.folder || 'orthoandspinetools/images';
    return fromR2(await uploadToR2(buffer, originalName, { folder, kind: 'image' }));
  }

  if (provider === 'cloudflare') {
    return fromCloudflare(
      await uploadImageToCloudflare(buffer, originalName, {
        isAvatar: options.isAvatar,
        folder: options.folder || 'orthoandspinetools',
      })
    );
  }

  return fromCloudinary(
    await uploadToCloudinary(buffer, originalName, options.folder || 'orthoandspinetools', {
      isAvatar: options.isAvatar,
      autoConvert: true,
    }),
    'image'
  );
}

export async function uploadVideoMedia(
  buffer: Buffer,
  originalName: string,
  options: { folder?: string } = {}
): Promise<MediaUploadResult> {
  const provider = preferredProvider();
  if (!provider) {
    throw new AppError('No media storage configured (R2, Cloudflare Stream, or Cloudinary)', 500);
  }

  if (provider === 'r2') {
    return fromR2(
      await uploadToR2(buffer, originalName, {
        folder: options.folder || 'orthoandspinetools/videos',
        kind: 'video',
      })
    );
  }

  if (provider === 'cloudflare') {
    return fromCloudflare(
      await uploadVideoToCloudflare(buffer, originalName, {
        folder: options.folder || 'orthoandspinetools',
      })
    );
  }

  return fromCloudinary(
    await uploadToCloudinary(buffer, originalName, options.folder || 'orthoandspinetools', {
      autoConvert: true,
    }),
    'video'
  );
}

export function getOptimizedMediaImageUrl(
  publicId: string,
  options: {
    width?: number;
    height?: number;
    provider?: MediaProvider | null;
    avatar?: boolean;
  } = {}
): string {
  const provider = options.provider || preferredProvider();
  if (provider === 'r2') {
    return getR2PublicUrl(publicId) || publicId;
  }
  if (provider === 'cloudflare') {
    return getCloudflareImageUrl(publicId, {
      width: options.width,
      height: options.height,
      avatar: options.avatar,
    });
  }
  if (provider === 'cloudinary') {
    return getCloudinaryOptimizedUrl(publicId, {
      width: options.width,
      height: options.height,
      crop: options.avatar ? 'fill' : 'limit',
      gravity: options.avatar ? 'face' : undefined,
    });
  }
  return '';
}

export function getMediaThumbnailUrl(
  publicId: string,
  size = 300,
  provider: MediaProvider | null = preferredProvider()
): string {
  if (provider === 'r2') {
    return getR2PublicUrl(publicId) || publicId;
  }
  if (provider === 'cloudflare') {
    return getCloudflareImageUrl(publicId, { thumb: true, width: size, height: size });
  }
  if (provider === 'cloudinary') {
    return getCloudinaryThumbnailUrl(publicId, size);
  }
  return '';
}

export async function deleteMedia(
  publicId: string,
  options: { provider?: MediaProvider | null; kind?: 'image' | 'video' } = {}
): Promise<void> {
  const provider = options.provider || preferredProvider();
  if (!provider) {
    throw new AppError('No media storage configured', 500);
  }
  if (provider === 'r2') {
    await deleteFromR2(publicId);
    return;
  }
  if (provider === 'cloudflare') {
    await deleteFromCloudflare(publicId, options.kind || 'image');
    return;
  }
  await deleteFromCloudinary(publicId);
}
