import { Router, Request, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import {
  getMaudeBrandSynopsis,
  getMaudeDailyTrends,
  listMaudeSpecialties,
  searchMaudeBrands,
  warmMaudeCaches,
} from '../lib/openFdaMaude';

const router = Router();

function resolveMaudeCronSecret(): string | null {
  const dedicated = process.env.MAUDE_CRON_SECRET?.trim();
  if (dedicated) return dedicated;
  const fallback = process.env.EMAIL_DIGEST_CRON_SECRET?.trim();
  return fallback || null;
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
