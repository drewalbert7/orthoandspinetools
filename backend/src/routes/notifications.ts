import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireAdmin } from '../middleware/authorization';
import { body, param, query, validationResult } from 'express-validator';
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../services/notificationService';
import { runNotificationDigest } from '../services/emailDigestService';

const router = Router();

router.get(
  '/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be 1-50'),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(errors.array().map((e) => e.msg).join(', '), 400);
    }
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const data = await getUserNotifications(req.user!.id, { page, limit });
    res.json({ success: true, data });
  })
);

router.get('/unread-count', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const count = await getUnreadCount(req.user!.id);
  res.json({ success: true, data: { count } });
}));

router.put(
  '/:id/read',
  authenticate,
  [param('id').isString().isLength({ min: 1 }).withMessage('Invalid id')],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(errors.array().map((e) => e.msg).join(', '), 400);
    }
    const ok = await markAsRead(req.params.id, req.user!.id);
    if (!ok) {
      throw new AppError('Notification not found', 404);
    }
    res.json({ success: true, message: 'Marked as read' });
  })
);

router.put('/read-all', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const updated = await markAllAsRead(req.user!.id);
  res.json({ success: true, data: { updated } });
}));

router.delete(
  '/:id',
  authenticate,
  [param('id').isString().isLength({ min: 1 }).withMessage('Invalid id')],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(errors.array().map((e) => e.msg).join(', '), 400);
    }
    const ok = await deleteNotification(req.params.id, req.user!.id);
    if (!ok) {
      throw new AppError('Notification not found', 404);
    }
    res.json({ success: true, message: 'Deleted' });
  })
);

router.post(
  '/digest/run',
  authenticate,
  requireAdmin,
  [
    body('maxUsers').optional().isInt({ min: 1, max: 500 }).withMessage('maxUsers must be 1-500'),
    body('dryRun').optional().isBoolean().withMessage('dryRun must be a boolean'),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(errors.array().map((e) => e.msg).join(', '), 400);
    }
    const maxUsers = req.body.maxUsers != null ? parseInt(String(req.body.maxUsers), 10) : undefined;
    const dryRun = req.body.dryRun === true;
    const result = await runNotificationDigest({ maxUsers, dryRun });
    res.json({ success: true, data: result });
  })
);

router.post('/digest/cron', asyncHandler(async (req: AuthRequest, res: Response) => {
  const configuredSecret = process.env.EMAIL_DIGEST_CRON_SECRET?.trim();
  if (!configuredSecret) {
    throw new AppError('Digest cron secret is not configured', 503);
  }
  const provided = req.get('x-digest-secret')?.trim();
  if (!provided || provided !== configuredSecret) {
    throw new AppError('Invalid digest secret', 403);
  }
  const result = await runNotificationDigest();
  res.json({ success: true, data: result });
}));

export default router;
