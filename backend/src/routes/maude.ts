import { Router, Request, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getMaudeDailyTrends, listMaudeSpecialties } from '../lib/openFdaMaude';

const router = Router();

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
  '/trends',
  [
    query('days').optional().isInt({ min: 14, max: 365 }).toInt(),
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

export default router;
