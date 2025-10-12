import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';

// Profile avatar validation middleware
export const validateAvatarUpload = (req: Request, res: Response, next: NextFunction) => {
  const file = req.file as Express.Multer.File;
  
  if (!file) {
    return next(new AppError('No avatar file uploaded', 400));
  }

  // Check file type
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return next(new AppError('Avatar must be PNG or JPG format', 400));
  }

  // Check file size (500KB limit)
  const maxSize = 500 * 1024; // 500KB
  if (file.size > maxSize) {
    return next(new AppError('Avatar must be under 500KB', 413));
  }

  // Check filename extension
  const allowedExtensions = ['.jpg', '.jpeg', '.png'];
  const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  if (!allowedExtensions.includes(ext)) {
    return next(new AppError('Avatar must have .jpg, .jpeg, or .png extension', 400));
  }

  // Note: Dimension validation (256x256) would require image processing library
  // This is typically handled by the frontend or image processing service
  logger.info(`Avatar upload validated: ${file.originalname}, ${file.size} bytes, ${file.mimetype}`);
  
  next();
};

// Video duration validation (requires ffprobe or similar)
export const validateVideoDuration = async (req: Request, res: Response, next: NextFunction) => {
  const files = req.files as Express.Multer.File[];
  
  if (!files || files.length === 0) {
    return next();
  }

  // For now, we'll use file size as a proxy for duration
  // In production, you'd use ffprobe to get actual duration
  const maxDuration = 15 * 60; // 15 minutes in seconds
  const maxSize = 1024 * 1024 * 1024; // 1GB
  
  for (const file of files) {
    if (file.mimetype.startsWith('video/')) {
      // Rough estimation: 1GB file ≈ 15 minutes at reasonable quality
      if (file.size > maxSize) {
        return next(new AppError('Video too large. Maximum 1GB or 15 minutes duration.', 413));
      }
      
      logger.info(`Video upload validated: ${file.originalname}, ${file.size} bytes`);
    }
  }
  
  next();
};

// Image format auto-conversion hints
export const getImageConversionHints = (file: Express.Multer.File) => {
  const hints = {
    shouldConvert: false,
    targetFormat: file.mimetype,
    reason: ''
  };

  // PNG to JPEG conversion for storage efficiency
  if (file.mimetype === 'image/png') {
    hints.shouldConvert = true;
    hints.targetFormat = 'image/jpeg';
    hints.reason = 'PNG will be converted to JPEG for storage efficiency';
  }

  // GIF to MP4 conversion for better playback
  if (file.mimetype === 'image/gif') {
    hints.shouldConvert = true;
    hints.targetFormat = 'video/mp4';
    hints.reason = 'GIF will be converted to MP4 for better playback';
  }

  return hints;
};
