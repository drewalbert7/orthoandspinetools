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

// File filter for image types
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allow only image files
  const allowedTypes = /jpeg|jpg|png|gif|webp|dicom/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new AppError('Only image files are allowed!', 400));
  }
};

// Configure multer
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  },
  fileFilter: fileFilter
});

// Middleware for single image upload
export const uploadSingle = (fieldName: string) => upload.single(fieldName);

// Middleware for multiple image uploads
export const uploadMultiple = (fieldName: string, maxCount: number = 5) => 
  upload.array(fieldName, maxCount);

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
export const getFileUrl = (req: Request, filename: string, type: 'images' | 'xrays' = 'images') => {
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

