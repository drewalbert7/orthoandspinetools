import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { query, param, validationResult } from 'express-validator';

const router = Router();

// Get all notifications for the authenticated user
router.get('/', authenticate, [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid query parameters' });
  }

  const userId = req.user!.id;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;

  const [notifications, totalCount, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        link: true,
        isRead: true,
        relatedPostId: true,
        relatedCommentId: true,
        relatedUserId: true,
        createdAt: true,
        readAt: true,
      },
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return res.json({
    notifications,
    pagination: {
      total: totalCount,
      unread: unreadCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount,
    },
  });
}));

// Get unread notification count
router.get('/unread-count', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const count = await prisma.notification.count({
    where: { userId, isRead: false },
  });

  res.json({ count });
}));

// Mark a notification as read
router.put('/:id/read', authenticate, [
  param('id').isString().withMessage('Invalid notification ID'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid notification ID' });
  }

  const userId = req.user!.id;
  const notificationId = req.params.id;

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true, isRead: true },
  });

  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  if (notification.userId !== userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!notification.isRead) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  return res.json({ success: true });
}));

// Mark all notifications as read
router.put('/mark-all-read', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return res.json({ success: true });
}));

// Delete a notification
router.delete('/:id', authenticate, [
  param('id').isString().withMessage('Invalid notification ID'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid notification ID' });
  }

  const userId = req.user!.id;
  const notificationId = req.params.id;

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true },
  });

  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  if (notification.userId !== userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  await prisma.notification.delete({
    where: { id: notificationId },
  });

  return res.json({ success: true });
}));

export default router;

