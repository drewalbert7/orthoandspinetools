import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { AppError } from './errorHandler';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
const imagesDir = path.join(uploadsDir, 'images');
const xraysDir = path.join(uploadsDir, 'xrays');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}
if (!fs.existsSync(xraysDir)) {
  fs.mkdirSync(xraysDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    // Determine upload directory based on file type
    if (file.fieldname === 'xray') {
      cb(null, xraysDir);
    } else {
      cb(null, imagesDir);
    }
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

// Memory storage for Cloudinary uploads
const memoryStorage = multer.memoryStorage();

// Strict MIME type whitelist for security
const ALLOWED_MIME_TYPES = {
  images: [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp'
  ],
  videos: [
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
};

// Allowed file extensions (must match MIME types)
const ALLOWED_EXTENSIONS = {
  images: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  videos: ['.mp4', '.webm', '.mov']
};

// File size limits (in bytes) - Reddit-compatible
const FILE_SIZE_LIMITS = {
  images: 20 * 1024 * 1024, // 20MB (Reddit standard)
  videos: 1024 * 1024 * 1024, // 1GB (Reddit standard)
  avatars: 500 * 1024 // 500KB for profile avatars
};

// Enhanced file filter with strict validation
const createFileFilter = (fileType: 'images' | 'videos') => {
  return (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimeTypes = ALLOWED_MIME_TYPES[fileType];
    const allowedExtensions = ALLOWED_EXTENSIONS[fileType];
    
    // Get file extension
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Check MIME type whitelist
    const isValidMimeType = allowedMimeTypes.includes(file.mimetype);
    
    // Check extension whitelist
    const isValidExtension = allowedExtensions.includes(ext);
    
    // Security: Reject if MIME type and extension don't match
    if (!isValidMimeType || !isValidExtension) {
      return cb(new AppError(
        `Invalid file type. Allowed ${fileType}: ${allowedExtensions.join(', ')}`, 
        400
      ));
    }
    
    // Additional security: Check for suspicious file names
    const suspiciousPatterns = [
      /\.(exe|bat|cmd|scr|pif|com)$/i,
      /\.(php|asp|jsp|cgi)$/i,
      /\.(js|vbs|wsf)$/i,
      /\.(zip|rar|7z|tar|gz)$/i
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(file.originalname))) {
      return cb(new AppError('Suspicious file type detected', 400));
    }
    
    cb(null, true);
  };
};

// File filter for images
const imageFileFilter = createFileFilter('images');

// File filter for videos  
const videoFileFilter = createFileFilter('videos');

// Configure multer with enhanced security
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: FILE_SIZE_LIMITS.images, // 10MB for images
    files: 5, // Max 5 files per request
    fieldSize: 1024 * 1024, // 1MB field size limit
  },
  fileFilter: imageFileFilter
});

// Middleware for single image upload
export const uploadSingle = (fieldName: string) => upload.single(fieldName);

// Middleware for multiple image uploads
export const uploadMultiple = (fieldName: string, maxCount: number = 5) => 
  upload.array(fieldName, maxCount);

// Memory-based upload for Cloudinary with enhanced security
const uploadMemoryImages = multer({
  storage: memoryStorage,
  limits: {
    fileSize: FILE_SIZE_LIMITS.images, // 10MB for images
    files: 10, // Max 10 images per request
    fieldSize: 1024 * 1024, // 1MB field size limit
  },
  fileFilter: imageFileFilter
});

const uploadMemoryVideos = multer({
  storage: memoryStorage,
  limits: {
    fileSize: FILE_SIZE_LIMITS.videos, // 500MB for videos
    files: 5, // Max 5 videos per request
    fieldSize: 1024 * 1024, // 1MB field size limit
  },
  fileFilter: videoFileFilter
});

// Middleware for Cloudinary image uploads (memory storage)
export const uploadMultipleMemoryImages = (fieldName: string, maxCount: number = 10) => 
  uploadMemoryImages.array(fieldName, maxCount);

// Middleware for Cloudinary video uploads (memory storage)
export const uploadMultipleMemoryVideos = (fieldName: string, maxCount: number = 5) => 
  uploadMemoryVideos.array(fieldName, maxCount);

// Middleware for mixed uploads (tools and xrays)
export const uploadMixed = upload.fields([
  { name: 'toolImages', maxCount: 5 },
  { name: 'xray', maxCount: 3 }
]);

// Utility function to delete uploaded files
export const deleteFile = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

// Utility function to get file URL
export const getFileUrl = (req: Request, filename: string, type: 'images' | 'xrays' | 'videos' = 'images') => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/uploads/${type}/${filename}`;
};

// Utility function to validate image dimensions (for X-rays)
export const validateImageDimensions = (filePath: string, minWidth: number = 512, minHeight: number = 512) => {
  return new Promise<boolean>((resolve) => {
    // This would typically use a library like 'sharp' or 'jimp' to check dimensions
    // For now, we'll return true as a placeholder
    resolve(true);
  });
};

// Utility function to anonymize X-ray images (remove patient data)
export const anonymizeXray = (filePath: string) => {
  // This would typically use a library to remove EXIF data and patient information
  // For HIPAA compliance, this is crucial
  return new Promise<string>((resolve) => {
    // Placeholder - in production, implement actual anonymization
    resolve(filePath);
  });
};