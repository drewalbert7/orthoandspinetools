import { AppError } from '../middleware/errorHandler';

// Check if Cloudinary is properly configured with security validation
const isCloudinaryConfigured = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  
  // Security: Validate environment variables exist and are not placeholder values
  if (!cloudName || !apiKey || !apiSecret) {
    return false;
  }
  
  // Security: Reject placeholder/default values
  const placeholderValues = [
    'your-cloud-name',
    'your-api-key', 
    'your-api-secret',
    'placeholder',
    'default',
    'test'
  ];
  
  if (placeholderValues.some(placeholder => 
    cloudName.includes(placeholder) || 
    apiKey.includes(placeholder) || 
    apiSecret.includes(placeholder)
  )) {
    return false;
  }
  
  // Security: Validate API key format (should be numeric)
  if (!/^\d+$/.test(apiKey)) {
    return false;
  }
  
  // Security: Validate cloud name format (should be alphanumeric with hyphens)
  if (!/^[a-zA-Z0-9\-_]+$/.test(cloudName)) {
    return false;
  }
  
  return true;
};

// Lazy load Cloudinary to avoid module errors
let cloudinary: any = null;
const getCloudinary = () => {
  if (!cloudinary && isCloudinaryConfigured()) {
    try {
      cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    } catch (error) {
      console.warn('Cloudinary not available:', error);
      return null;
    }
  }
  return cloudinary;
};

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  resource_type: string;
  bytes: number;
  duration?: number;
}

// Upload file to Cloudinary with Reddit-compatible settings
export const uploadToCloudinary = async (
  buffer: Buffer,
  originalName: string,
  folder: string = 'orthoandspinetools',
  options: {
    isAvatar?: boolean;
    autoConvert?: boolean;
  } = {}
): Promise<CloudinaryUploadResult> => {
  const cloudinaryInstance = getCloudinary();
  if (!cloudinaryInstance) {
    throw new AppError('Cloudinary not configured', 500);
  }

  try {
    const uploadOptions: any = {
      folder: folder,
      resource_type: 'auto', // Automatically detect image/video
      quality: 'auto',
      fetch_format: 'auto',
      flags: 'progressive'
    };

    // Avatar-specific settings (256x256, PNG/JPG)
    if (options.isAvatar) {
      uploadOptions.transformation = [
        { width: 256, height: 256, crop: 'fill', gravity: 'face' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ];
    } else {
      // Regular post images/videos with Reddit-compatible limits
      uploadOptions.transformation = [
        { width: 1920, height: 1080, crop: 'limit' }, // Max 1920x1080 for images
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ];
    }

    // Auto-conversion settings
    if (options.autoConvert) {
      // PNG to JPEG conversion for storage efficiency
      if (originalName.toLowerCase().includes('.png')) {
        uploadOptions.format = 'jpg';
        uploadOptions.quality = 85; // Good quality JPEG
      }
      
      // GIF to MP4 conversion for better playback
      if (originalName.toLowerCase().includes('.gif')) {
        uploadOptions.resource_type = 'video';
        uploadOptions.format = 'mp4';
      }
    }

    const result = await new Promise<CloudinaryUploadResult>((resolve, reject) => {
      cloudinaryInstance.uploader.upload_stream(
        uploadOptions,
        (error: any, result: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      ).end(buffer);
    });

    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new AppError('Failed to upload to Cloudinary', 500);
  }
};

// Delete file from Cloudinary
export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  const cloudinaryInstance = getCloudinary();
  if (!cloudinaryInstance) {
    throw new AppError('Cloudinary not configured', 500);
  }

  try {
    await cloudinaryInstance.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new AppError('Failed to delete from Cloudinary', 500);
  }
};

// Get optimized image URL
export const getOptimizedImageUrl = (publicId: string, options: {
  width?: number;
  height?: number;
  quality?: string;
  format?: string;
} = {}): string => {
  const cloudinaryInstance = getCloudinary();
  if (!cloudinaryInstance) {
    return '';
  }

  const { width, height, quality = 'auto', format = 'auto' } = options;
  
  return cloudinaryInstance.url(publicId, {
    width,
    height,
    quality,
    format,
    crop: 'limit'
  });
};

// Get thumbnail URL
export const getThumbnailUrl = (publicId: string, size: number = 300): string => {
  return getOptimizedImageUrl(publicId, {
    width: size,
    height: size,
    quality: 'auto',
    format: 'auto'
  });
};