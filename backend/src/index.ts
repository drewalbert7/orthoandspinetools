import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import communityRoutes from './routes/communities';
import postRoutes from './routes/posts';
import commentRoutes from './routes/comments';
import toolRoutes from './routes/tools';
import uploadRoutes from './routes/upload';
import karmaRoutes from './routes/karma';
import moderationRoutes from './routes/moderation';
import notificationRoutes from './routes/notifications';
import ogPreviewRoutes from './routes/ogPreview';
import sesEventsRoutes from './routes/sesEvents';
import sitemapRoutes from './routes/sitemap';
import llmsFullRoutes from './routes/llmsFull';
import maudeRoutes from './routes/maude';
import implantRoutes from './routes/implants';
import analyticsRoutes from './routes/analytics';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { createApiLimiters, parseTrustProxy } from './middleware/rateLimits';
import { securityHeaders, sanitizeInput, validateUploadSecurity } from './middleware/security';
import { logger } from './utils/logger';
import { prisma } from './lib/prisma';
import { validateSesConfigurationAtStartup } from './lib/sesConfig';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const server = createServer(app);

// Trust proxy for rate limiting behind nginx (only trust nginx).
// Default 1 hop; override with TRUST_PROXY (number, true/false, or a subnet list).
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
      mediaSrc: ["'self'", "https://res.cloudinary.com", "https://*.cloudinary.com"],
      connectSrc: ["'self'", "https://api.cloudinary.com"],
      frameAncestors: ["'none'"],
    },
  },
}));

// Enhanced security middleware
app.use(securityHeaders);
app.use(sanitizeInput);

// CORS configuration
const allowedOrigins = (process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean)) || [
  'https://orthoandspinetools.com',
  'https://www.orthoandspinetools.com',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, or same-origin)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));

// Rate limiting: separate buckets for safe reads and for writes (see middleware/rateLimits.ts).
// Auth, analytics, implant and MAUDE routes keep their own dedicated limiters as well.
const { readLimiter, writeLimiter, config: rateLimitConfig } = createApiLimiters();
app.use(readLimiter);
app.use(writeLimiter);

// SNS posts SES notifications as text/plain JSON; parse this route before global json middleware.
app.use('/api/ses/events', express.text({ type: 'text/plain', limit: '1mb' }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      service: 'orthoandspinetools-api',
      version: '1.0.0',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      error: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Static file serving for uploads
app.use('/uploads', express.static('uploads'));

// Link-preview HTML for social crawlers (used by nginx rewrite for /post/:id)
app.use('/api/og', ogPreviewRoutes);

// Dynamic sitemap (proxied by nginx at GET /sitemap.xml)
app.use('/sitemap.xml', sitemapRoutes);
app.use('/llms-full.txt', llmsFullRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/karma', karmaRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ses/events', sesEventsRoutes);
app.use('/api/maude', maudeRoutes);
app.use('/api/implants', implantRoutes);
app.use('/api/analytics', analyticsRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl 
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Verify database connection before starting server
async function startServer() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ Database connection verified');
    validateSesConfigurationAtStartup();

    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      logger.info(`🚀 OrthoAndSpineTools API server running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 CORS Origins: ${(process.env.CORS_ORIGINS || allowedOrigins.join(', '))}`);
      logger.info(`🔒 Trust Proxy: ${app.get('trust proxy')}`);
      logger.info(`🚦 Rate limits: reads ${rateLimitConfig.readMax}/${rateLimitConfig.readWindowMs}ms, writes ${rateLimitConfig.writeMax}/${rateLimitConfig.writeWindowMs}ms per client IP`);
    });
  } catch (error: any) {
    logger.error({
      error: 'Failed to connect to database on startup',
      message: error.message,
      stack: error.stack,
    });
    logger.error('❌ Server startup aborted - database connection failed');
    process.exit(1);
  }
}

// Start server with database verification
startServer();

export default app;
