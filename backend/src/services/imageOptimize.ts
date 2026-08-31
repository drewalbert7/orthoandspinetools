import sharp from 'sharp';

export type OptimizedImageKind = 'feed' | 'avatar' | 'banner';

export interface OptimizedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: 'jpeg' | 'webp' | 'png';
  contentType: string;
  bytes: number;
  originalName: string;
}

const LIMITS: Record<
  OptimizedImageKind,
  { maxWidth: number; maxHeight: number; fit: keyof sharp.FitEnum; quality: number }
> = {
  // Reddit-ish feed: long edge capped, aspect preserved
  feed: { maxWidth: 1920, maxHeight: 1920, fit: 'inside', quality: 82 },
  avatar: { maxWidth: 256, maxHeight: 256, fit: 'cover', quality: 85 },
  banner: { maxWidth: 1920, maxHeight: 1080, fit: 'inside', quality: 82 },
};

/** Soft cap when Cloudflare Images/Stream will apply variants on delivery. */
const CF_SOFT: Record<OptimizedImageKind, { maxWidth: number; maxHeight: number; fit: keyof sharp.FitEnum }> = {
  feed: { maxWidth: 4096, maxHeight: 4096, fit: 'inside' },
  avatar: { maxWidth: 1024, maxHeight: 1024, fit: 'inside' },
  banner: { maxWidth: 4096, maxHeight: 2160, fit: 'inside' },
};

/**
 * Normalize user uploads to web-friendly size/format (Reddit-like).
 * GIFs are left alone so animation is preserved.
 * mode=light: EXIF rotate + soft dimension cap only (for Cloudflare Images delivery variants).
 */
export async function optimizeImageForUpload(
  input: Buffer,
  originalName: string,
  kind: OptimizedImageKind = 'feed',
  options: { mode?: 'full' | 'light' } = {}
): Promise<OptimizedImage> {
  const mode = options.mode || 'full';
  const lower = (originalName || '').toLowerCase();
  if (lower.endsWith('.gif')) {
    const meta = await sharp(input, { animated: true })
      .metadata()
      .catch((): null => null);
    return {
      buffer: input,
      width: meta?.width || 0,
      height: meta?.height || 0,
      format: 'png',
      contentType: 'image/gif',
      bytes: input.length,
      originalName: originalName || 'upload.gif',
    };
  }

  if (mode === 'light') {
    const soft = CF_SOFT[kind];
    const out = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({
        width: soft.maxWidth,
        height: soft.maxHeight,
        fit: soft.fit,
        withoutEnlargement: true,
      })
      .toBuffer({ resolveWithObject: true });
    const fmt = (out.info.format || 'jpeg').toLowerCase();
    const format: OptimizedImage['format'] =
      fmt === 'png' || fmt === 'webp' ? fmt : 'jpeg';
    const ext = format === 'jpeg' ? 'jpg' : format;
    const contentType =
      format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
    const base = (originalName || 'upload').replace(/\.[^/.]+$/, '') || 'upload';
    return {
      buffer: out.data,
      width: out.info.width || 0,
      height: out.info.height || 0,
      format,
      contentType,
      bytes: out.data.length,
      originalName: `${base}.${ext}`,
    };
  }

  const limits = LIMITS[kind];
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  const pipeline = sharp(input, { failOn: 'none' }).rotate().resize({
    width: limits.maxWidth,
    height: limits.maxHeight,
    fit: limits.fit,
    withoutEnlargement: true,
  });

  const hasAlpha = Boolean(meta.hasAlpha);
  const usePng = hasAlpha && kind !== 'avatar' && input.length < 1.5 * 1024 * 1024;

  let out: Buffer;
  let format: OptimizedImage['format'];
  let contentType: string;
  let ext: string;

  if (kind === 'avatar') {
    out = await pipeline.webp({ quality: limits.quality }).toBuffer();
    format = 'webp';
    contentType = 'image/webp';
    ext = 'webp';
  } else if (usePng) {
    out = await pipeline.png({ compressionLevel: 8 }).toBuffer();
    format = 'png';
    contentType = 'image/png';
    ext = 'png';
  } else {
    out = await pipeline.jpeg({ quality: limits.quality, mozjpeg: true }).toBuffer();
    format = 'jpeg';
    contentType = 'image/jpeg';
    ext = 'jpg';
  }

  const outMeta = await sharp(out).metadata();
  const base = (originalName || 'upload').replace(/\.[^/.]+$/, '') || 'upload';

  return {
    buffer: out,
    width: outMeta.width || width || 0,
    height: outMeta.height || height || 0,
    format,
    contentType,
    bytes: out.length,
    originalName: `${base}.${ext}`,
  };
}
