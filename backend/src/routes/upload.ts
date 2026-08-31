import { Router, Request, Response, NextFunction } from 'express';
import { uploadSingle, uploadMultiple, uploadMultipleMemoryImages, uploadMultipleMemoryVideos, uploadSingleMemory, uploadSingleAvatarMemory, uploadMixed, getFileUrl, deleteFile, anonymizeXray } from '../middleware/upload';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { uploadRateLimit, checkStorageLimits, validateFileSecurity, logUploadAttempt } from '../middleware/uploadSecurity';
import { validateAvatarUpload, validateVideoDuration } from '../middleware/avatarValidation';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import {
  deleteMedia,
  getMediaStatus,
  getMediaThumbnailUrl,
  getOptimizedMediaImageUrl,
  isMediaStorageReady,
  uploadImageMedia,
  uploadVideoMedia,
} from '../services/mediaService';
import { virusScanService } from '../services/virusScanService';

const router = Router();

// Post media readiness (no auth; no secrets — ops + honest UI when storage is missing)
router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  const media = getMediaStatus();
  res.json({
    success: true,
    data: {
      // Prefer Cloudflare R2 when configured; Images/Stream + Cloudinary remain fallbacks
      mediaConfigured: media.mediaConfigured,
      activeProvider: media.activeProvider,
      r2Configured: media.r2Configured,
      cloudflareConfigured: media.cloudflareConfigured,
      cloudinaryConfigured: media.mediaConfigured, // UI gate: any ready provider
      limits: {
        imageMb: 20,
        videoMb: 1024,
      },
    },
  });
}));
// Upload single tool image
router.post('/tool-image', authenticate, uploadSingle('toolImage'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const fileUrl = getFileUrl(req, req.file.filename, 'images');
  
  // Log the upload for audit purposes
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'UPLOAD_TOOL_IMAGE',
      resource: 'tool_image',
      resourceId: req.file.filename,
      details: {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    data: {
      filename: req.file.filename,
      originalName: req.file.originalname,
      url: fileUrl,
      size: req.file.size,
      mimetype: req.file.mimetype,
    }
  });
}));

// Upload multiple tool images
router.post('/tool-images', authenticate, uploadMultiple('toolImages', 5), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
    throw new AppError('No files uploaded', 400);
  }

  const files = req.files as Express.Multer.File[];
  const uploadedFiles = files.map(file => ({
    filename: file.filename,
    originalName: file.originalname,
    url: getFileUrl(req, file.filename, 'images'),
    size: file.size,
    mimetype: file.mimetype,
  }));

  // Log the upload for audit purposes
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'UPLOAD_TOOL_IMAGES',
      resource: 'tool_images',
      resourceId: files.map(f => f.filename).join(','),
      details: {
        fileCount: files.length,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    data: uploadedFiles
  });
}));

// Upload X-ray image (with anonymization)
router.post('/xray', authenticate, uploadSingle('xray'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new AppError('No X-ray file uploaded', 400);
  }

  // Anonymize the X-ray image for HIPAA compliance
  const anonymizedPath = await anonymizeXray(req.file.path);
  const fileUrl = getFileUrl(req, req.file.filename, 'xrays');
  
  // Log the upload for audit purposes (HIPAA compliance)
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'UPLOAD_XRAY',
      resource: 'xray_image',
      resourceId: req.file.filename,
      details: {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        anonymized: true,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    data: {
      filename: req.file.filename,
      originalName: req.file.originalname,
      url: fileUrl,
      size: req.file.size,
      mimetype: req.file.mimetype,
      anonymized: true,
    }
  });
}));

// Upload mixed content (tools and X-rays)
router.post('/mixed', authenticate, uploadMixed, asyncHandler(async (req: AuthRequest, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  
  if (!files || Object.keys(files).length === 0) {
    throw new AppError('No files uploaded', 400);
  }

  const result: any = {};

  // Process tool images
  if (files.toolImages) {
    result.toolImages = files.toolImages.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      url: getFileUrl(req, file.filename, 'images'),
      size: file.size,
      mimetype: file.mimetype,
    }));
  }

  // Process X-ray images
  if (files.xray) {
    result.xrays = await Promise.all(files.xray.map(async (file) => {
      const anonymizedPath = await anonymizeXray(file.path);
      return {
        filename: file.filename,
        originalName: file.originalname,
        url: getFileUrl(req, file.filename, 'xrays'),
        size: file.size,
        mimetype: file.mimetype,
        anonymized: true,
      };
    }));
  }

  // Log the upload for audit purposes
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'UPLOAD_MIXED_CONTENT',
      resource: 'mixed_upload',
      resourceId: Object.values(files).flat().map(f => f.filename).join(','),
      details: {
        toolImages: files.toolImages?.length || 0,
        xrays: files.xray?.length || 0,
        totalSize: Object.values(files).flat().reduce((sum, file) => sum + file.size, 0),
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    data: result
  });
}));

// Delete uploaded file
router.delete('/:filename', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { filename } = req.params;
  const { type } = req.query; // 'images' or 'xrays'

  if (!filename || !type) {
    throw new AppError('Filename and type are required', 400);
  }

  const filePath = `uploads/${type}/${filename}`;
  const deleted = deleteFile(filePath);

  if (!deleted) {
    throw new AppError('File not found or could not be deleted', 404);
  }

  // Log the deletion for audit purposes
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'DELETE_FILE',
      resource: 'uploaded_file',
      resourceId: filename,
      details: {
        filename,
        type,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: 'File deleted successfully'
  });
}));

// Get file info
router.get('/:filename', asyncHandler(async (req: Request, res: Response) => {
  const { filename } = req.params;
  const { type } = req.query;

  if (!filename || !type) {
    throw new AppError('Filename and type are required', 400);
  }

  const filePath = `uploads/${type}/${filename}`;
  const fs = require('fs');
  const path = require('path');

  try {
    const stats = fs.statSync(filePath);
    const fileUrl = getFileUrl(req, filename, type as 'images' | 'xrays');

    res.json({
      success: true,
      data: {
        filename,
        url: fileUrl,
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      }
    });
  } catch (error) {
    throw new AppError('File not found', 404);
  }
}));

// Upload community profile image to Cloudinary
router.post('/community-image-cloudinary', 
  authenticate, 
  uploadRateLimit, 
  uploadSingleMemory('image'), 
  validateFileSecurity,
  logUploadAttempt,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const file = req.file;

    // Ensure we have a buffer (should always be present with memory storage)
    if (!file.buffer) {
      throw new AppError('File buffer not available', 500);
    }

    try {
      // Virus scan the image
      const scanResult = await virusScanService.scanFile(file.buffer, file.originalname);
      if (!scanResult.clean) {
        logger.warn(`Virus scan failed for community image ${file.originalname}: ${scanResult.threat}`, {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
        throw new AppError(`Image security scan failed: ${scanResult.threat}`, 400);
      }

      const media = await uploadImageMedia(file.buffer, file.originalname, {
        isAvatar: true,
        folder: 'orthoandspinetools/communities',
      });

      logger.info(`Community profile image uploaded by user ${req.user!.id}: ${file.originalname}`, {
        userId: req.user!.id,
        fileName: file.originalname,
        fileSize: file.size,
        mediaId: media.public_id,
        provider: media.provider,
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'UPLOAD_COMMUNITY_IMAGE',
          resource: 'community_image',
          resourceId: media.public_id,
          details: {
            filename: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            mediaId: media.public_id,
            provider: media.provider,
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      res.json({
        success: true,
        data: {
          imageUrl: media.secure_url,
          optimizedUrl: media.optimized_url || getOptimizedMediaImageUrl(media.public_id, { width: 256, height: 256, avatar: true, provider: media.provider }),
          cloudinaryUrl: media.secure_url,
          cloudinaryPublicId: media.public_id,
          provider: media.provider,
          filename: media.public_id,
          originalName: file.originalname,
          size: media.bytes,
          mimetype: file.mimetype,
          width: media.width,
          height: media.height,
        },
      });
    } catch (error: any) {
      logger.error(`Failed to upload community image ${file.originalname}:`, error);
      throw new AppError(error.message || 'Failed to upload community image', 500);
    }
  })
);

// Upload community banner image to Cloudinary
router.post('/community-banner-cloudinary', 
  authenticate, 
  uploadRateLimit, 
  uploadSingleMemory('banner'), 
  validateFileSecurity,
  logUploadAttempt,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const file = req.file;

    // Ensure we have a buffer (should always be present with memory storage)
    if (!file.buffer) {
      throw new AppError('File buffer not available', 500);
    }

    try {
      // Virus scan the image
      const scanResult = await virusScanService.scanFile(file.buffer, file.originalname);
      if (!scanResult.clean) {
        logger.warn(`Virus scan failed for community banner ${file.originalname}: ${scanResult.threat}`, {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
        throw new AppError(`Image security scan failed: ${scanResult.threat}`, 400);
      }

      const media = await uploadImageMedia(file.buffer, file.originalname, {
        folder: 'orthoandspinetools/communities/banners',
      });

      logger.info(`Community banner uploaded by user ${req.user!.id}: ${file.originalname}`, {
        userId: req.user!.id,
        fileName: file.originalname,
        fileSize: file.size,
        mediaId: media.public_id,
        provider: media.provider,
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'UPLOAD_COMMUNITY_BANNER',
          resource: 'community_banner',
          resourceId: media.public_id,
          details: {
            filename: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            mediaId: media.public_id,
            provider: media.provider,
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      res.json({
        success: true,
        data: {
          imageUrl: media.secure_url,
          optimizedUrl: media.optimized_url || getOptimizedMediaImageUrl(media.public_id, { width: 1920, height: 1080, provider: media.provider }),
          cloudinaryUrl: media.secure_url,
          cloudinaryPublicId: media.public_id,
          provider: media.provider,
          filename: media.public_id,
          originalName: file.originalname,
          size: media.bytes,
          mimetype: file.mimetype,
          width: media.width,
          height: media.height,
        },
      });
    } catch (error: any) {
      logger.error(`Failed to upload community banner ${file.originalname}:`, error);
      throw new AppError(error.message || 'Failed to upload community banner', 500);
    }
  })
);

// Upload post images
router.post('/post-images', authenticate, uploadMultiple('images', 10), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
    throw new AppError('No files uploaded', 400);
  }

  const files = req.files as Express.Multer.File[];
  const uploadedFiles = [];

  for (const file of files) {
    const fileUrl = getFileUrl(req, file.filename, 'images');
    
    // Log the upload for audit purposes
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPLOAD_POST_IMAGE',
        resource: 'post_image',
        resourceId: file.filename,
        details: {
          filename: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    uploadedFiles.push({
      filename: file.filename,
      originalName: file.originalname,
      url: fileUrl,
      size: file.size,
      mimetype: file.mimetype,
    });
  }

  logger.info(`Post images uploaded by user ${req.user!.id}: ${uploadedFiles.length} files`);

  res.json({
    success: true,
    data: uploadedFiles,
  });
}));

// Upload post videos
router.post('/post-videos', authenticate, uploadMultiple('videos', 5), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
    throw new AppError('No files uploaded', 400);
  }

  const files = req.files as Express.Multer.File[];
  const uploadedFiles = [];

  for (const file of files) {
    const fileUrl = getFileUrl(req, file.filename, 'videos');
    
    // Log the upload for audit purposes
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPLOAD_POST_VIDEO',
        resource: 'post_video',
        resourceId: file.filename,
        details: {
          filename: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    uploadedFiles.push({
      filename: file.filename,
      originalName: file.originalname,
      url: fileUrl,
      size: file.size,
      mimetype: file.mimetype,
    });
  }

  logger.info(`Post videos uploaded by user ${req.user!.id}: ${uploadedFiles.length} files`);

  res.json({
    success: true,
    data: uploadedFiles,
  });
}));

// Upload post images to Cloudinary
router.post('/post-images-cloudinary', 
  authenticate, 
  uploadRateLimit, 
  checkStorageLimits, 
  uploadMultipleMemoryImages('images', 10), 
  validateFileSecurity,
  logUploadAttempt,
  asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
    throw new AppError('No files uploaded', 400);
  }

  const files = req.files as Express.Multer.File[];
  const uploadedFiles = [];

  for (const file of files) {
    try {
      // Virus scan the file
      const scanResult = await virusScanService.scanFile(file.buffer, file.originalname);
      if (!scanResult.clean) {
        logger.warn(`Virus scan failed for ${file.originalname}: ${scanResult.threat}`, {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
        throw new AppError(`File security scan failed: ${scanResult.threat}`, 400);
      }

      const media = await uploadImageMedia(file.buffer, file.originalname, {
        folder: 'orthoandspinetools/posts',
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'UPLOAD_POST_IMAGE_MEDIA',
          resource: 'post_image',
          resourceId: media.public_id,
          details: {
            filename: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            url: media.secure_url,
            public_id: media.public_id,
            provider: media.provider,
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      const originalName = String(file.originalname || '')
        .replace(/\u202F/g, ' ')
        .replace(/\u00A0/g, ' ');

      uploadedFiles.push({
        filename: media.public_id,
        originalName,
        url: media.secure_url,
        size: media.bytes,
        mimetype: file.mimetype,
        cloudinaryPublicId: media.public_id,
        cloudinaryUrl: media.secure_url,
        provider: media.provider,
        optimizedUrl: media.optimized_url || getOptimizedMediaImageUrl(media.public_id, { provider: media.provider }),
        thumbnailUrl: media.thumbnail_url || getMediaThumbnailUrl(media.public_id, 300, media.provider),
        width: media.width,
        height: media.height,
      });
    } catch (error) {
      logger.error(`Failed to upload ${file.originalname} to media storage:`, error);
      throw new AppError(`Failed to upload ${file.originalname}`, 500);
    }
  }

  logger.info(`Post images uploaded by user ${req.user!.id}: ${uploadedFiles.length} files`);

  res.json({
    success: true,
    data: uploadedFiles,
  });
}));

// Upload post videos to Cloudinary
router.post('/post-videos-cloudinary', 
  authenticate, 
  uploadRateLimit, 
  checkStorageLimits, 
  uploadMultipleMemoryVideos('videos', 5), 
  validateFileSecurity,
  validateVideoDuration,
  logUploadAttempt,
  asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
    throw new AppError('No files uploaded', 400);
  }

  const files = req.files as Express.Multer.File[];
  const uploadedFiles = [];

  for (const file of files) {
    try {
      // Virus scan the file
      const scanResult = await virusScanService.scanFile(file.buffer, file.originalname);
      if (!scanResult.clean) {
        logger.warn(`Virus scan failed for ${file.originalname}: ${scanResult.threat}`, {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
        throw new AppError(`File security scan failed: ${scanResult.threat}`, 400);
      }

      const media = await uploadVideoMedia(file.buffer, file.originalname, {
        folder: 'orthoandspinetools/posts',
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'UPLOAD_POST_VIDEO_MEDIA',
          resource: 'post_video',
          resourceId: media.public_id,
          details: {
            filename: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            url: media.secure_url,
            public_id: media.public_id,
            duration: media.duration,
            provider: media.provider,
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      uploadedFiles.push({
        filename: media.public_id,
        originalName: file.originalname,
        url: media.secure_url,
        size: media.bytes,
        mimetype: file.mimetype,
        cloudinaryPublicId: media.public_id,
        cloudinaryUrl: media.secure_url,
        provider: media.provider,
        duration: media.duration,
        width: media.width,
        height: media.height,
        optimizedUrl: media.optimized_url,
        thumbnailUrl: media.thumbnail_url,
      });
    } catch (error) {
      logger.error(`Failed to upload ${file.originalname} to media storage:`, error);
      throw new AppError(`Failed to upload ${file.originalname}`, 500);
    }
  }

  logger.info(`Post videos uploaded by user ${req.user!.id}: ${uploadedFiles.length} files`);

  res.json({
    success: true,
    data: uploadedFiles,
  });
}));

// Delete file from active media provider (Cloudflare or Cloudinary)
router.delete('/cloudinary/:publicId', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { publicId } = req.params;
  const kind = String(req.query.kind || 'image') === 'video' ? 'video' : 'image';

  if (!publicId) {
    throw new AppError('Public ID is required', 400);
  }
  if (!isMediaStorageReady()) {
    throw new AppError('No media storage configured', 500);
  }

  try {
    await deleteMedia(publicId, { kind });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'DELETE_MEDIA_FILE',
        resource: 'media_file',
        resourceId: publicId,
        details: {
          public_id: publicId,
          kind,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    res.json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    logger.error(`Failed to delete media file ${publicId}:`, error);
    throw new AppError('Failed to delete file', 500);
  }
}));

// Upload profile avatar to Cloudinary
router.post('/avatar-cloudinary', 
  authenticate, 
  uploadRateLimit, 
  uploadSingleAvatarMemory, 
  validateAvatarUpload,
  logUploadAttempt,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new AppError('No avatar file uploaded', 400);
    }

    const file = req.file;

    // Ensure we have a buffer (should always be present with memory storage)
    if (!file.buffer) {
      throw new AppError('File buffer not available', 500);
    }

    try {
      // Virus scan the avatar
      const scanResult = await virusScanService.scanFile(file.buffer, file.originalname);
      if (!scanResult.clean) {
        logger.warn(`Virus scan failed for avatar ${file.originalname}: ${scanResult.threat}`, {
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
        throw new AppError(`Avatar security scan failed: ${scanResult.threat}`, 400);
      }

      const media = await uploadImageMedia(file.buffer, file.originalname, {
        isAvatar: true,
        folder: 'orthoandspinetools/avatars',
      });

      logger.info(`Avatar uploaded by user ${req.user!.id}: ${file.originalname}`, {
        userId: req.user!.id,
        fileName: file.originalname,
        fileSize: file.size,
        mediaId: media.public_id,
        provider: media.provider,
      });

      res.json({
        success: true,
        data: {
          filename: media.public_id,
          originalName: file.originalname,
          url: media.secure_url,
          size: media.bytes,
          mimetype: file.mimetype,
          cloudinaryPublicId: media.public_id,
          cloudinaryUrl: media.secure_url,
          provider: media.provider,
          optimizedUrl:
            media.optimized_url ||
            getOptimizedMediaImageUrl(media.public_id, {
              width: 256,
              height: 256,
              avatar: true,
              provider: media.provider,
            }),
          thumbnailUrl: media.thumbnail_url || getMediaThumbnailUrl(media.public_id, 64, media.provider),
          width: media.width,
          height: media.height,
        },
      });
    } catch (error: unknown) {
      logger.error(`Failed to upload avatar ${file.originalname}:`, error);
      if (error instanceof AppError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : 'Failed to upload avatar';
      throw new AppError(msg, 500);
    }
  })
);

export default router;
