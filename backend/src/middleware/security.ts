import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Enforce HTTPS in production
  if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.get('host')}${req.url}`);
  }

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Content Security Policy for uploads
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "img-src 'self' data: https://res.cloudinary.com https://*.cloudinary.com; " +
    "media-src 'self' https://res.cloudinary.com https://*.cloudinary.com; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' https://api.cloudinary.com; " +
    "frame-ancestors 'none';"
  );

  next();
};

// Rate limiting for API endpoints
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export const apiRateLimit = (maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    
    const current = rateLimitMap.get(key);
    
    if (current && current.resetTime > now) {
      if (current.count >= maxRequests) {
        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', new Date(current.resetTime).toISOString());
        
        return next(new AppError('Too many requests', 429));
      }
      current.count++;
    } else {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    }
    
    const currentLimit = rateLimitMap.get(key);
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', (maxRequests - currentLimit!.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(currentLimit!.resetTime).toISOString());
    
    next();
  };
};

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize file names
  if (req.files) {
    const files = req.files as Express.Multer.File[];
    files.forEach(file => {
      // Remove any potentially dangerous characters and normalize Unicode
      file.originalname = file.originalname
        .normalize('NFD') // Normalize Unicode characters
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
        .replace(/\.\./g, '') // Remove directory traversal attempts
        .replace(/[^\x20-\x7E]/g, '_') // Replace non-ASCII characters with underscore
        .trim();
    });
  }

  // Sanitize body parameters
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
          .replace(/javascript:/gi, '') // Remove javascript: protocol
          .replace(/on\w+\s*=/gi, ''); // Remove event handlers
      }
    });
  }

  next();
};

// File upload security validation
export const validateUploadSecurity = (req: Request, res: Response, next: NextFunction) => {
  const files = req.files as Express.Multer.File[];
  
  if (!files || files.length === 0) {
    return next();
  }

  for (const file of files) {
    // Check file size
    if (file.size === 0) {
      return next(new AppError('Empty file detected', 400));
    }

    // Check for suspicious file patterns
    const suspiciousPatterns = [
      /\.(exe|bat|cmd|scr|pif|com|msi)$/i,
      /\.(php|asp|jsp|cgi|pl|py|rb)$/i,
      /\.(js|vbs|wsf|ps1)$/i,
      /\.(zip|rar|7z|tar|gz|bz2)$/i,
      /\.(sql|db|mdb|accdb)$/i,
      /\.(dll|so|dylib)$/i
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(file.originalname))) {
      logger.warn(`Suspicious file upload attempt: ${file.originalname}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: (req as any).user?.id
      });
      return next(new AppError('Suspicious file type detected', 400));
    }

    // Check for double extensions (e.g., image.jpg.exe)
    const parts = file.originalname.split('.');
    if (parts.length > 2) {
      const lastExt = parts[parts.length - 1].toLowerCase();
      const secondLastExt = parts[parts.length - 2].toLowerCase();
      
      const dangerousExtensions = ['exe', 'bat', 'cmd', 'scr', 'pif', 'com', 'msi'];
      if (dangerousExtensions.includes(lastExt) || dangerousExtensions.includes(secondLastExt)) {
        return next(new AppError('Suspicious file extension detected', 400));
      }
    }

    // Check for null bytes or other malicious content
    if (file.originalname.includes('\0') || file.originalname.includes('\x00')) {
      return next(new AppError('Invalid filename', 400));
    }

    // Check for directory traversal attempts
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      return next(new AppError('Invalid filename path', 400));
    }
  }

  next();
};

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (value.resetTime < now) {
      rateLimitMap.delete(key);
    }
  }
}, 15 * 60 * 1000); // Clean up every 15 minutes
