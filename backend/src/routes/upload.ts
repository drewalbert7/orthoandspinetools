import { Router, Request, Response, NextFunction } from 'express';
import { uploadSingle, uploadMultiple, uploadMixed, getFileUrl, deleteFile, anonymizeXray } from '../middleware/upload';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../index';
import { logger } from '../utils/logger';

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

export default router;
