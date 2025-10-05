import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { param, query, validationResult } from 'express-validator';
import { getUserKarmaStats, getTopUsersByKarma, recalculateUserKarma } from '../utils/karmaService';

const router = Router();

// Get user karma stats
router.get('/user/:userId', [
  param('userId').isString().isLength({ min: 1 }).withMessage('Invalid user ID'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { userId } = req.params;
  
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, firstName: true, lastName: true }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const karmaStats = await getUserKarmaStats(userId);

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      karma: karmaStats
    }
  });
}));

// Get top users by karma
router.get('/leaderboard', [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
], asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const limit = parseInt(req.query.limit as string) || 10;
  const topUsers = await getTopUsersByKarma(limit);

  res.json({
    success: true,
    data: topUsers.map(user => ({
      id: user.user.id,
      username: user.user.username,
      firstName: user.user.firstName,
      lastName: user.user.lastName,
      specialty: user.user.specialty,
      profileImage: user.user.profileImage,
      karma: {
        postKarma: user.postKarma,
        commentKarma: user.commentKarma,
        awardKarma: user.awardKarma,
        totalKarma: user.totalKarma
      }
    }))
  });
}));

// Recalculate karma for a user (admin only)
router.post('/recalculate/:userId', authenticate, [
  param('userId').isString().isLength({ min: 1 }).withMessage('Invalid user ID'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { userId } = req.params;
  
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const karmaStats = await recalculateUserKarma(userId);

  // Log the recalculation
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'RECALCULATE_KARMA',
      resource: 'user_karma',
      resourceId: userId,
      details: {
        targetUserId: userId,
        newKarmaStats: karmaStats,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: 'Karma recalculated successfully',
    data: {
      user: {
        id: user.id,
        username: user.username,
      },
      karma: karmaStats
    }
  });
}));

// Get karma history for a user
router.get('/user/:userId/history', authenticate, [
  param('userId').isString().isLength({ min: 1 }).withMessage('Invalid user ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { userId } = req.params;
  const limit = parseInt(req.query.limit as string) || 20;

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Get recent karma-related audit logs
  const karmaHistory = await prisma.auditLog.findMany({
    where: {
      OR: [
        {
          action: 'CREATE_POST_VOTE',
          details: {
            path: ['postId'],
            equals: userId
          }
        },
        {
          action: 'CREATE_COMMENT_VOTE',
          details: {
            path: ['commentId'],
            equals: userId
          }
        }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      action: true,
      details: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          username: true
        }
      }
    }
  });

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
      },
      history: karmaHistory
    }
  });
}));

export default router;
