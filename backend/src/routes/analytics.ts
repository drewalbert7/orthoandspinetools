import { Router, Response } from 'express';
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

const router = Router();

const collectLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many analytics events' },
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

    await prisma.analyticsPageView.create({
      data: {
        path,
        referrer,
        visitorHash: analyticsVisitorHash(req),
        userId: req.user?.id ?? null,
      },
    });

    res.status(204).end();
  })
);

export default router;
