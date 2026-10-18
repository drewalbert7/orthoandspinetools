import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import { optionalAuth, type AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  analyticsVisitorHash,
  normalizeAnalyticsPath,
  sanitizeReferrer,
} from '../lib/analytics';
import { classifyBot } from '../lib/botClassify';
import { recordBotHit } from '../lib/botAnalytics';
import { lookupCountryCode } from '../lib/analyticsGeo';
import { buildGlobePayload, buildPublicSiteStats } from '../lib/publicSiteStats';

const router = Router();

const collectLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many analytics events' },
});

const publicStatsLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many stats requests' },
});

router.post(
  '/pageview',
  collectLimiter,
  optionalAuth,
  [
    body('path').isString().isLength({ min: 1, max: 512 }).withMessage('Invalid path'),
    body('referrer').optional({ nullable: true }).isString().isLength({ max: 512 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Invalid analytics payload' });
      return;
    }

    const path = normalizeAnalyticsPath(req.body.path);
    if (!path) {
      res.status(204).end();
      return;
    }

    // Bot UAs: record as bot traffic, never as human pageviews
    const bot = classifyBot(req.get('user-agent'));
    if (bot) {
      await recordBotHit({ classification: bot, path }).catch(() => {});
      res.status(204).end();
      return;
    }

    const referrer = sanitizeReferrer(req.body.referrer);
    const country = lookupCountryCode(req);

    await prisma.analyticsPageView.create({
      data: {
        path,
        referrer,
        visitorHash: analyticsVisitorHash(req),
        country,
        userId: req.user?.id ?? null,
      },
    });

    res.status(204).end();
  })
);

/** Public first-party stats (aggregates only: no visitor hashes / IPs). */
router.get(
  '/stats',
  publicStatsLimiter,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await buildPublicSiteStats();
    res.setHeader('Cache-Control', 'public, max-age=20');
    // OC-compatible flat payload (and success wrapper for our clients).
    res.json({ success: true, data, ...data });
  })
);

/** Live globe pins + feed for the public Stats page. */
router.get(
  '/globe',
  publicStatsLimiter,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await buildGlobePayload();
    res.setHeader('Cache-Control', 'public, max-age=8');
    res.json(data);
  })
);

export default router;
