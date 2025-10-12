import { Router, Request, Response, NextFunction } from 'express';
import { uploadSingle, uploadMultiple, uploadMultipleMemoryImages, uploadMultipleMemoryVideos, uploadMixed, getFileUrl, deleteFile, anonymizeXray } from '../middleware/upload';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { uploadRateLimit, checkStorageLimits, validateFileSecurity, logUploadAttempt } from '../middleware/uploadSecurity';
import { validateAvatarUpload, validateVideoDuration } from '../middleware/avatarValidation';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { uploadToCloudinary, deleteFromCloudinary, getOptimizedImageUrl, getThumbnailUrl } from '../services/cloudinaryService';
import { virusScanService } from '../services/virusScanService';

const router = Router();

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

// Upload community profile image
router.post('/community-image', authenticate, uploadSingle('image'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const fileUrl = getFileUrl(req, req.file.filename, 'images');
  
  // Log the upload for audit purposes
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'UPLOAD_COMMUNITY_IMAGE',
      resource: 'community_image',
      resourceId: req.file.filename,
      details: {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    },
  });

  logger.info(`Community image uploaded by user ${req.user!.id}: ${req.file.filename}`);

  res.json({
    success: true,
    data: {
      imageUrl: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    },
  });
}));

// Upload community banner image
router.post('/community-banner', authenticate, uploadSingle('banner'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const fileUrl = getFileUrl(req, req.file.filename, 'images');
  
  // Log the upload for audit purposes
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'UPLOAD_COMMUNITY_BANNER',
      resource: 'community_banner',
      resourceId: req.file.filename,
      details: {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    },
  });

  logger.info(`Community banner uploaded by user ${req.user!.id}: ${req.file.filename}`);

  res.json({
    success: true,
    data: {
      imageUrl: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    },
  });
}));

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

      // Upload to Cloudinary
      const cloudinaryResult = await uploadToCloudinary(file.buffer, file.originalname, 'orthoandspinetools/posts');
      
      // Log the upload for audit purposes
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'UPLOAD_POST_IMAGE_CLOUDINARY',
          resource: 'post_image',
          resourceId: cloudinaryResult.public_id,
          details: {
            filename: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            cloudinary_url: cloudinaryResult.secure_url,
            public_id: cloudinaryResult.public_id,
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      uploadedFiles.push({
        filename: cloudinaryResult.public_id,
        originalName: file.originalname,
        url: cloudinaryResult.secure_url,
        size: cloudinaryResult.bytes,
        mimetype: file.mimetype,
        cloudinaryPublicId: cloudinaryResult.public_id,
        optimizedUrl: getOptimizedImageUrl(cloudinaryResult.public_id),
        thumbnailUrl: getThumbnailUrl(cloudinaryResult.public_id),
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
      });
    } catch (error) {
      logger.error(`Failed to upload ${file.originalname} to Cloudinary:`, error);
      throw new AppError(`Failed to upload ${file.originalname}`, 500);
    }
  }

  logger.info(`Post images uploaded to Cloudinary by user ${req.user!.id}: ${uploadedFiles.length} files`);

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

      // Upload to Cloudinary
      const cloudinaryResult = await uploadToCloudinary(file.buffer, file.originalname, 'orthoandspinetools/posts');
      
      // Log the upload for audit purposes
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'UPLOAD_POST_VIDEO_CLOUDINARY',
          resource: 'post_video',
          resourceId: cloudinaryResult.public_id,
          details: {
            filename: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            cloudinary_url: cloudinaryResult.secure_url,
            public_id: cloudinaryResult.public_id,
            duration: cloudinaryResult.duration,
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      uploadedFiles.push({
        filename: cloudinaryResult.public_id,
        originalName: file.originalname,
        url: cloudinaryResult.secure_url,
        size: cloudinaryResult.bytes,
        mimetype: file.mimetype,
        cloudinaryPublicId: cloudinaryResult.public_id,
        duration: cloudinaryResult.duration,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
      });
    } catch (error) {
      logger.error(`Failed to upload ${file.originalname} to Cloudinary:`, error);
      throw new AppError(`Failed to upload ${file.originalname}`, 500);
    }
  }

  logger.info(`Post videos uploaded to Cloudinary by user ${req.user!.id}: ${uploadedFiles.length} files`);

  res.json({
    success: true,
    data: uploadedFiles,
  });
}));

// Delete file from Cloudinary
router.delete('/cloudinary/:publicId', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { publicId } = req.params;

  if (!publicId) {
    throw new AppError('Public ID is required', 400);
  }

  try {
    await deleteFromCloudinary(publicId);
    
    // Log the deletion for audit purposes
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'DELETE_CLOUDINARY_FILE',
          resource: 'cloudinary_file',
          resourceId: publicId,
          details: {
            public_id: publicId,
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
    logger.error(`Failed to delete Cloudinary file ${publicId}:`, error);
    throw new AppError('Failed to delete file', 500);
  }
}));

// Upload profile avatar to Cloudinary
router.post('/avatar-cloudinary', 
  authenticate, 
  uploadRateLimit, 
  uploadSingle('avatar'), 
  validateAvatarUpload,
  logUploadAttempt,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new AppError('No avatar file uploaded', 400);
    }

    const file = req.file;

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

      // Upload to Cloudinary with avatar-specific settings
      const cloudinaryResult = await uploadToCloudinary(
        file.buffer, 
        file.originalname, 
        'orthoandspinetools/avatars',
        { isAvatar: true, autoConvert: true }
      );

      logger.info(`Avatar uploaded by user ${req.user!.id}: ${file.originalname}`, {
        userId: req.user!.id,
        fileName: file.originalname,
        fileSize: file.size,
        cloudinaryId: cloudinaryResult.public_id
      });

      res.json({
        success: true,
        data: {
          filename: cloudinaryResult.public_id,
          originalName: file.originalname,
          url: cloudinaryResult.secure_url,
          size: cloudinaryResult.bytes,
          mimetype: file.mimetype,
          cloudinaryPublicId: cloudinaryResult.public_id,
          cloudinaryUrl: cloudinaryResult.secure_url,
          optimizedUrl: getOptimizedImageUrl(cloudinaryResult.public_id, { width: 256, height: 256 }),
          thumbnailUrl: getThumbnailUrl(cloudinaryResult.public_id, 64),
          width: cloudinaryResult.width,
          height: cloudinaryResult.height
        }
      });
    } catch (error: any) {
      logger.error(`Failed to upload avatar ${file.originalname}:`, error);
      throw new AppError(error.message || 'Failed to upload avatar', 500);
    }
  })
);

export default router;
