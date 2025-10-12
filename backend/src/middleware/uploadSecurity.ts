import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';

// Upload rate limiting configuration - Reddit-compatible
const UPLOAD_LIMITS = {
  // Per user limits
  MAX_UPLOADS_PER_HOUR: 20,
  MAX_UPLOADS_PER_DAY: 100,
  MAX_UPLOADS_PER_POST: 10,
  
  // Per file limits (Reddit standards)
  MAX_FILE_SIZE_IMAGES: 20 * 1024 * 1024, // 20MB (Reddit standard)
  MAX_FILE_SIZE_VIDEOS: 1024 * 1024 * 1024, // 1GB (Reddit standard)
  MAX_FILE_SIZE_AVATARS: 500 * 1024, // 500KB for profile avatars
  
  // Video duration limits
  MAX_VIDEO_DURATION: 15 * 60, // 15 minutes in seconds
  
  // Total storage limits per user
  MAX_STORAGE_PER_USER: 5 * 1024 * 1024 * 1024, // 5GB (increased for Reddit compatibility)
};

// Track upload attempts per user
const uploadAttempts = new Map<string, { count: number; resetTime: number }>();

// Rate limiting middleware for uploads
export const uploadRateLimit = async (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return next(new AppError('Authentication required for uploads', 401));
  }

  const now = Date.now();
  const hourKey = `hour_${userId}`;
  const dayKey = `day_${userId}`;

  // Check hourly limit
  const hourAttempts = uploadAttempts.get(hourKey);
  if (hourAttempts && hourAttempts.resetTime > now) {
    if (hourAttempts.count >= UPLOAD_LIMITS.MAX_UPLOADS_PER_HOUR) {
      return next(new AppError(
        `Upload limit exceeded. Maximum ${UPLOAD_LIMITS.MAX_UPLOADS_PER_HOUR} uploads per hour.`, 
        429
      ));
    }
    hourAttempts.count++;
  } else {
    uploadAttempts.set(hourKey, { count: 1, resetTime: now + 60 * 60 * 1000 });
  }

  // Check daily limit
  const dayAttempts = uploadAttempts.get(dayKey);
  if (dayAttempts && dayAttempts.resetTime > now) {
    if (dayAttempts.count >= UPLOAD_LIMITS.MAX_UPLOADS_PER_DAY) {
      return next(new AppError(
        `Upload limit exceeded. Maximum ${UPLOAD_LIMITS.MAX_UPLOADS_PER_DAY} uploads per day.`, 
        429
      ));
    }
    dayAttempts.count++;
  } else {
    uploadAttempts.set(dayKey, { count: 1, resetTime: now + 24 * 60 * 60 * 1000 });
  }

  next();
};

// Check user storage limits
export const checkStorageLimits = async (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return next(new AppError('Authentication required for uploads', 401));
  }

  try {
    // Get user's total storage usage
    const userAttachments = await prisma.postAttachment.findMany({
      where: {
        post: {
          authorId: userId
        }
      },
      select: {
        size: true
      }
    });

    const totalStorage = userAttachments.reduce((sum, attachment) => sum + attachment.size, 0);
    
    if (totalStorage >= UPLOAD_LIMITS.MAX_STORAGE_PER_USER) {
      return next(new AppError(
        `Storage limit exceeded. Maximum ${UPLOAD_LIMITS.MAX_STORAGE_PER_USER / (1024 * 1024)}MB per user.`, 
        413
      ));
    }

    next();
  } catch (error) {
    logger.error('Error checking storage limits:', error);
    next(new AppError('Error checking storage limits', 500));
  }
};

// Enhanced file validation middleware
export const validateFileSecurity = (req: Request, res: Response, next: NextFunction) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return next();
  }

  // Check file count limit
  if (files.length > UPLOAD_LIMITS.MAX_UPLOADS_PER_POST) {
    return next(new AppError(
      `Too many files. Maximum ${UPLOAD_LIMITS.MAX_UPLOADS_PER_POST} files per post.`, 
      400
    ));
  }

  // Validate each file
  for (const file of files) {
    // Check file size
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');
    
    if (isImage && file.size > UPLOAD_LIMITS.MAX_FILE_SIZE_IMAGES) {
      return next(new AppError(
        `File too large. Maximum ${UPLOAD_LIMITS.MAX_FILE_SIZE_IMAGES / (1024 * 1024)}MB for images.`, 
        413
      ));
    }
    
    if (isVideo && file.size > UPLOAD_LIMITS.MAX_FILE_SIZE_VIDEOS) {
      return next(new AppError(
        `File too large. Maximum ${UPLOAD_LIMITS.MAX_FILE_SIZE_VIDEOS / (1024 * 1024 * 1024)}GB for videos.`, 
        413
      ));
    }

    // Additional security checks
    if (file.originalname.length > 255) {
      return next(new AppError('Filename too long', 400));
    }

    // Check for suspicious patterns in filename
    const suspiciousPatterns = [
      /\.(exe|bat|cmd|scr|pif|com)$/i,
      /\.(php|asp|jsp|cgi)$/i,
      /\.(js|vbs|wsf)$/i,
      /\.(zip|rar|7z|tar|gz)$/i,
      /\.(sql|db|mdb)$/i
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(file.originalname))) {
      return next(new AppError('Suspicious file type detected', 400));
    }

    // Check for null bytes or other malicious content
    if (file.originalname.includes('\0') || file.originalname.includes('\x00')) {
      return next(new AppError('Invalid filename', 400));
    }
  }

  next();
};

// Log upload attempts for security monitoring
export const logUploadAttempt = async (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.id;
  const files = req.files as Express.Multer.File[];
  
  if (files && files.length > 0) {
    try {
      // Log upload attempt for security monitoring
      await prisma.auditLog.create({
        data: {
          userId: userId,
          action: 'UPLOAD_ATTEMPT',
          resource: 'file_upload',
          resourceId: `upload_${Date.now()}`,
          details: {
            fileCount: files.length,
            fileNames: files.map(f => f.originalname),
            fileSizes: files.map(f => f.size),
            mimeTypes: files.map(f => f.mimetype),
            userAgent: req.get('User-Agent'),
            ipAddress: req.ip
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      logger.info(`Upload attempt by user ${userId}: ${files.length} files`, {
        userId,
        fileCount: files.length,
        fileNames: files.map(f => f.originalname),
        ipAddress: req.ip
      });
    } catch (error) {
      logger.error('Error logging upload attempt:', error);
      // Don't fail the request if logging fails
    }
  }

  next();
};

// Clean up old upload attempts periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of uploadAttempts.entries()) {
    if (value.resetTime < now) {
      uploadAttempts.delete(key);
    }
  }
}, 60 * 60 * 1000); // Clean up every hour
