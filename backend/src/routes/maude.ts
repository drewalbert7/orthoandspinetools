import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { sendTransactionalEmail, isSesEmailConfigured } from '../services/emailService';
import {
  getMaudeBrandSynopsis,
  getMaudeDailyTrends,
  listMaudeSpecialties,
  searchMaudeBrands,
  warmMaudeCaches,
} from '../lib/openFdaMaude';

const router = Router();

const brandRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many brand requests. Please try again later.' },
});

function resolveMaudeCronSecret(): string | null {
  const dedicated = process.env.MAUDE_CRON_SECRET?.trim();
  if (dedicated) return dedicated;
  const fallback = process.env.EMAIL_DIGEST_CRON_SECRET?.trim();
  return fallback || null;
}

function resolveBrandRequestNotifyTo(): string | null {
  const dedicated = process.env.MAUDE_REQUEST_TO?.trim();
  if (dedicated) return dedicated;
  const uptime = process.env.UPTIME_ALERT_TO?.trim();
  return uptime || null;
}

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

router.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    const hasApiKey = Boolean(process.env.OPENFDA_API_KEY?.trim());
    res.json({
      success: true,
      data: {
        hasApiKey,
        dailyLimitHint: hasApiKey ? 120000 : 1000,
        signupUrl: 'https://api.data.gov/signup/',
        docsUrl: 'https://open.fda.gov/apis/authentication/',
      },
    });
  })
);

router.get(
  '/specialties',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: listMaudeSpecialties(),
    });
  })
);

/** Backward-compatible alias */
router.get(
  '/presets',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: listMaudeSpecialties().map((s) => ({ id: s.id, label: s.label })),
    });
  })
);

router.get(
  '/search',
  [
    query('q').isString().trim().isLength({ min: 2, max: 80 }),
    query('specialty').optional().isString().trim().isLength({ max: 40 }),
    query('limit').optional().isInt({ min: 5, max: 25 }).toInt(),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Invalid search parameters', 400);
    }
    const q = String(req.query.q || '');
    const specialty = typeof req.query.specialty === 'string' ? req.query.specialty : undefined;
    const limit = typeof req.query.limit === 'number' ? req.query.limit : Number(req.query.limit) || 12;

    try {
      const data = await searchMaudeBrands({ q, specialty, limit });
      res.set('Cache-Control', 'public, max-age=120');
      res.json({ success: true, data: { q, specialty: specialty || 'all', results: data } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError(`Unable to search MAUDE brands: ${message}`, 502);
    }
  })
);

/**
 * Public (optional auth): request that we prioritize / add a brand or company
 * that did not show up in MAUDE search.
 */
router.post(
  '/brand-request',
  brandRequestLimiter,
  optionalAuth,
  [
    body('brand').isString().trim().isLength({ min: 2, max: 120 }),
    body('company').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('specialty').optional({ nullable: true }).isString().trim().isLength({ max: 40 }),
    body('note').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
    body('contactEmail').optional({ nullable: true }).isEmail().normalizeEmail(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Invalid brand request', 400);
    }

    const brand = String(req.body.brand || '').trim();
    const company =
      typeof req.body.company === 'string' && req.body.company.trim()
        ? req.body.company.trim()
        : null;
    const specialty =
      typeof req.body.specialty === 'string' && req.body.specialty.trim()
        ? req.body.specialty.trim()
        : null;
    const note =
      typeof req.body.note === 'string' && req.body.note.trim() ? req.body.note.trim() : null;
    const contactEmail =
      typeof req.body.contactEmail === 'string' && req.body.contactEmail.trim()
        ? req.body.contactEmail.trim().toLowerCase()
        : req.user?.email || null;

    // Soft-dedupe identical pending requests in the last 7 days
    const recent = await prisma.maudeBrandRequest.findFirst({
      where: {
        brand: { equals: brand, mode: 'insensitive' },
        status: 'pending',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      res.status(200).json({
        success: true,
        data: {
          id: recent.id,
          duplicate: true,
          message: 'Thanks — we already have a pending request for this brand.',
        },
      });
      return;
    }

    const created = await prisma.maudeBrandRequest.create({
      data: {
        brand,
        company,
        specialty,
        note,
        contactEmail,
        userId: req.user?.id || null,
        ipHash: hashIp(req.ip),
        status: 'pending',
      },
    });

    logger.info('MAUDE brand request received', {
      id: created.id,
      brand,
      company,
      specialty,
      userId: req.user?.id || null,
    });

    const notifyTo = resolveBrandRequestNotifyTo();
    if (notifyTo && isSesEmailConfigured()) {
      const subject = `[MAUDE] Brand request: ${brand.slice(0, 60)}`;
      const textBody = [
        'New MAUDE brand / company request',
        '',
        `Brand: ${brand}`,
        `Company: ${company || '(not provided)'}`,
        `Specialty filter: ${specialty || 'all'}`,
        `Contact: ${contactEmail || '(anonymous)'}`,
        `User: ${req.user ? `${req.user.username} (${req.user.id})` : '(guest)'}`,
        `Note: ${note || '(none)'}`,
        `Request id: ${created.id}`,
        '',
        'Review in DB table maude_brand_requests, then add curated mapping / filter coverage as needed.',
      ].join('\n');
      const htmlBody = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${textBody
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre>`;
      const sent = await sendTransactionalEmail({
        to: notifyTo,
        subject,
        textBody,
        htmlBody,
      });
      if (!sent.ok && !('skipped' in sent && sent.skipped)) {
        logger.warn('MAUDE brand request notify email failed', {
          id: created.id,
          error: 'error' in sent ? sent.error : 'unknown',
        });
      } else if (sent.ok) {
        logger.info('MAUDE brand request notify email sent', {
          id: created.id,
          toDomain: notifyTo.split('@')[1],
          messageId: 'messageId' in sent ? sent.messageId : undefined,
        });
      } else {
        logger.warn('MAUDE brand request notify email skipped', {
          id: created.id,
          toDomain: notifyTo.split('@')[1],
        });
      }
    }

    res.status(201).json({
      success: true,
      data: {
        id: created.id,
        duplicate: false,
        message: 'Thanks — we received your request and will review it.',
      },
    });
  })
);

router.get(
  '/trends',
  [
    query('days').optional().isInt({ min: 14, max: 3650 }).toInt(),
    query('specialty').optional().isString().trim().isLength({ max: 40 }),
    query('preset').optional().isString().trim().isLength({ max: 40 }),
    query('productCode').optional().isString().trim().isLength({ min: 3, max: 3 }),
    query('brand').optional().isString().trim().isLength({ max: 80 }),
    query('deviceName').optional().isString().trim().isLength({ max: 200 }),
    query('q').optional().isString().trim().isLength({ max: 120 }),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Invalid query parameters', 400);
    }

    const days = typeof req.query.days === 'number' ? req.query.days : Number(req.query.days) || 90;
    const specialty =
      typeof req.query.specialty === 'string'
        ? req.query.specialty
        : typeof req.query.preset === 'string'
          ? req.query.preset
          : undefined;
    const productCode =
      typeof req.query.productCode === 'string' ? req.query.productCode : undefined;
    const brand = typeof req.query.brand === 'string' ? req.query.brand : undefined;
    const deviceName =
      typeof req.query.deviceName === 'string' ? req.query.deviceName : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;

    try {
      const data = await getMaudeDailyTrends({
        days,
        specialty,
        productCode,
        brand,
        deviceName,
        q,
      });
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ success: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError(`Unable to load MAUDE trends: ${message}`, 502);
    }
  })
);

router.get(
  '/synopsis',
  [
    query('brand').isString().trim().isLength({ min: 2, max: 80 }),
    query('days').optional().isInt({ min: 14, max: 3650 }).toInt(),
    query('specialty').optional().isString().trim().isLength({ max: 40 }),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Invalid synopsis parameters', 400);
    }
    const brand = String(req.query.brand || '');
    const days = typeof req.query.days === 'number' ? req.query.days : Number(req.query.days) || 1095;
    const specialty = typeof req.query.specialty === 'string' ? req.query.specialty : undefined;

    try {
      const data = await getMaudeBrandSynopsis({ brand, specialty, days });
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ success: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError(`Unable to load MAUDE synopsis: ${message}`, 502);
    }
  })
);

/**
 * Host cron: refresh in-memory openFDA caches after FDA's weekly MAUDE publish.
 * Auth: header x-maude-secret = MAUDE_CRON_SECRET (or EMAIL_DIGEST_CRON_SECRET fallback).
 */
router.post(
  '/warm',
  asyncHandler(async (req: Request, res: Response) => {
    const configured = resolveMaudeCronSecret();
    if (!configured) {
      throw new AppError('MAUDE warm cron secret is not configured', 503);
    }
    const provided = req.get('x-maude-secret')?.trim();
    if (!provided || provided !== configured) {
      throw new AppError('Invalid MAUDE warm secret', 403);
    }

    const data = await warmMaudeCaches();
    res.json({ success: true, data });
  })
);

export default router;
