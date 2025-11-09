import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin, requireCommunityModerator, canModeratePost, canModerateComment } from '../middleware/authorization';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { body, param, query, validationResult } from 'express-validator';

const router = Router();

// Get moderation queue (posts/comments that need review)
router.get('/queue', authenticate, requireAdmin, [
  query('type').optional().isIn(['post', 'comment']).withMessage('Type must be post or comment'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const type = req.query.type as string || 'post';
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  if (type === 'post') {
    // Get posts that might need moderation (recent, high activity, etc.)
    const posts = await prisma.post.findMany({
      where: {
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          }
        },
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
          }
        },
        _count: {
          select: {
            comments: true,
            votes: true,
          }
        }
      }
    });

    const total = await prisma.post.count({
      where: { isDeleted: false }
    });

    return res.json({
      success: true,
      data: {
        items: posts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        }
      }
    });
  } else {
    // Get comments that might need moderation
    const comments = await prisma.comment.findMany({
      where: {
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          }
        },
        post: {
          select: {
            id: true,
            title: true,
            community: {
              select: {
                id: true,
                name: true,
                slug: true,
              }
            }
          }
        },
        _count: {
          select: {
            replies: true,
            votes: true,
          }
        }
      }
    });

    const total = await prisma.comment.count({
      where: { isDeleted: false }
    });

    return res.json({
      success: true,
      data: {
        items: comments,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        }
      }
    });
  }
}));

// Get all users (admin only)
router.get('/users', authenticate, requireAdmin, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string;
  const offset = (page - 1) * limit;

  const where: any = {};
  if (search) {
    where.OR = [
      { username: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    skip: offset,
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      isAdmin: true,
      isActive: true,
      specialty: true,
      createdAt: true,
      lastLoginAt: true,
      _count: {
        select: {
          posts: true,
          comments: true,
        }
      }
    }
  });

  const total = await prisma.user.count({ where });

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      }
    }
  });
}));

// Ban/Suspend user (admin only)
router.post('/users/:id/ban', authenticate, requireAdmin, [
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid user ID'),
  body('banned').isBoolean().withMessage('Banned must be a boolean'),
  body('reason').optional().isString().withMessage('Reason must be a string'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;
  const { banned, reason } = req.body;

  const user = await prisma.user.update({
    where: { id },
    data: { isActive: !banned }
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: banned ? 'BAN_USER' : 'UNBAN_USER',
      resource: 'user',
      resourceId: id,
      details: {
        targetUserId: id,
        targetUsername: user.username,
        reason,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: banned ? 'User banned successfully' : 'User unbanned successfully',
    data: { isActive: !banned }
  });
}));

// Promote user to admin (admin only)
router.post('/users/:id/promote', authenticate, requireAdmin, [
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid user ID'),
  body('isAdmin').isBoolean().withMessage('isAdmin must be a boolean'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;
  const { isAdmin } = req.body;

  // Prevent demoting yourself
  if (id === req.user!.id && !isAdmin) {
    throw new AppError('Cannot demote yourself', 400);
  }

  const user = await prisma.user.update({
    where: { id },
    data: { isAdmin }
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: isAdmin ? 'PROMOTE_TO_ADMIN' : 'DEMOTE_FROM_ADMIN',
      resource: 'user',
      resourceId: id,
      details: {
        targetUserId: id,
        targetUsername: user.username,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: isAdmin ? 'User promoted to admin' : 'User demoted from admin',
    data: { isAdmin }
  });
}));

// Add/Remove community moderator (admin or community owner only)
router.post('/communities/:communityId/moderators', authenticate, [
  param('communityId').isString().isLength({ min: 1 }).withMessage('Invalid community ID'),
  body('userId').isString().isLength({ min: 1 }).withMessage('Invalid user ID'),
  body('action').isIn(['add', 'remove']).withMessage('Action must be add or remove'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { communityId } = req.params;
  const { userId, action } = req.body;

  // Check if user is admin or community owner
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { isAdmin: true }
  });

  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { ownerId: true }
  });

  if (!community) {
    throw new AppError('Community not found', 404);
  }

  if (!user?.isAdmin && community.ownerId !== req.user!.id) {
    throw new AppError('Access denied. Admin or community owner privileges required.', 403);
  }

  if (action === 'add') {
    // Check if already a moderator
    const existing = await prisma.communityModerator.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        }
      }
    });

    if (existing) {
      throw new AppError('User is already a moderator of this community', 400);
    }

    await prisma.communityModerator.create({
      data: {
        communityId,
        userId,
        role: 'moderator',
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'ADD_COMMUNITY_MODERATOR',
        resource: 'community_moderator',
        resourceId: communityId,
        details: {
          communityId,
          moderatorUserId: userId,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      }
    });

    res.json({
      success: true,
      message: 'Moderator added successfully'
    });
  } else {
    // Remove moderator
    await prisma.communityModerator.deleteMany({
      where: {
        communityId,
        userId,
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'REMOVE_COMMUNITY_MODERATOR',
        resource: 'community_moderator',
        resourceId: communityId,
        details: {
          communityId,
          moderatorUserId: userId,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      }
    });

    res.json({
      success: true,
      message: 'Moderator removed successfully'
    });
  }
}));

// Get user's moderation permissions
router.get('/permissions', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      isAdmin: true,
      moderatedCommunities: {
        select: {
          communityId: true,
          role: true,
          community: {
            select: {
              id: true,
              name: true,
              slug: true,
            }
          }
        }
      },
      ownedCommunities: {
        select: {
          id: true,
          name: true,
          slug: true,
        }
      }
    }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: {
      isAdmin: user.isAdmin,
      moderatedCommunities: user.moderatedCommunities.map(m => ({
        communityId: m.communityId,
        role: m.role,
        community: m.community,
      })),
      ownedCommunities: user.ownedCommunities,
    }
  });
}));

export default router;

