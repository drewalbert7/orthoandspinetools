import { Router, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { getUserKarmaStats } from '../utils/karmaService';
import { getPointsLevelState } from '../utils/pointsLevel';
import { enrichPostsPollData } from '../utils/postPoll';

const router = Router();
const prisma = new PrismaClient();

const publicUserSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  specialty: true,
  subSpecialty: true,
  institution: true,
  bio: true,
  profileImage: true,
  location: true,
  website: true,
  yearsExperience: true,
  isVerifiedPhysician: true,
  isVerifiedFounder: true,
  createdAt: true,
} as const;

async function findActiveUserByUsername(username: string) {
  const user = await prisma.user.findFirst({
    where: {
      username: { equals: username, mode: 'insensitive' },
      isActive: true,
    },
    select: publicUserSelect,
  });
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return user;
}

router.get(
  '/:username/posts',
  optionalAuth,
  [
    param('username').trim().isLength({ min: 1, max: 64 }).withMessage('Invalid username'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(`Validation failed: ${errors.array().map((e) => e.msg).join(', ')}`, 400);
    }

    const { username } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const skip = (page - 1) * limit;

    const user = await findActiveUserByUsername(username);

    const where = {
      authorId: user.id,
      isDeleted: false,
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              specialty: true,
              profileImage: true,
              isVerifiedPhysician: true,
              isVerifiedFounder: true,
            },
          },
          community: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          attachments: true,
          tags: { include: { tag: true } },
          votes: {
            include: {
              user: {
                select: { id: true, username: true },
              },
            },
          },
          _count: {
            select: {
              comments: true,
              votes: true,
            },
          },
        },
      }),
      prisma.post.count({ where }),
    ]);

    const postsWithScores = posts.map((post) => {
      const upvotes = post.votes.filter((vote) => vote.type === 'upvote').length;
      const downvotes = post.votes.filter((vote) => vote.type === 'downvote').length;
      const userVote = req.user ? post.votes.find((vote) => vote.userId === req.user!.id) : null;
      return {
        ...post,
        voteScore: upvotes - downvotes,
        upvotes,
        downvotes,
        userVote: userVote ? userVote.type : null,
        commentsCount: post._count.comments,
      };
    });

    const postsEnriched = await enrichPostsPollData(postsWithScores, req.user?.id);

    res.json({
      success: true,
      data: {
        posts: postsEnriched,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  })
);

router.get(
  '/:username/comments',
  optionalAuth,
  [
    param('username').trim().isLength({ min: 1, max: 64 }).withMessage('Invalid username'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(`Validation failed: ${errors.array().map((e) => e.msg).join(', ')}`, 400);
    }

    const { username } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const skip = (page - 1) * limit;

    const user = await findActiveUserByUsername(username);

    const where = {
      authorId: user.id,
      isDeleted: false,
    };

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          post: {
            select: {
              id: true,
              title: true,
              community: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
          votes: true,
          _count: {
            select: {
              replies: true,
              votes: true,
            },
          },
        },
      }),
      prisma.comment.count({ where }),
    ]);

    const commentsWithScores = comments.map((comment) => {
      const upvotes = comment.votes.filter((vote) => vote.type === 'upvote').length;
      const downvotes = comment.votes.filter((vote) => vote.type === 'downvote').length;
      const userVote = req.user ? comment.votes.find((vote) => vote.userId === req.user!.id) : null;
      return {
        id: comment.id,
        content: comment.content,
        authorId: comment.authorId,
        postId: comment.postId,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        post: comment.post,
        voteScore: upvotes - downvotes,
        userVote: userVote ? userVote.type : null,
        _count: comment._count,
      };
    });

    res.json({
      success: true,
      data: {
        comments: commentsWithScores,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  })
);

router.get(
  '/:username',
  [
    param('username').trim().isLength({ min: 1, max: 64 }).withMessage('Invalid username'),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(`Validation failed: ${errors.array().map((e) => e.msg).join(', ')}`, 400);
    }

    const user = await findActiveUserByUsername(req.params.username);

    const [postsCount, commentsCount, karmaStats] = await Promise.all([
      prisma.post.count({
        where: { authorId: user.id, isDeleted: false },
      }),
      prisma.comment.count({
        where: { authorId: user.id, isDeleted: false },
      }),
      getUserKarmaStats(user.id),
    ]);

    const pointLevel = getPointsLevelState(karmaStats.totalKarma);

    res.json({
      success: true,
      data: {
        user: {
          ...user,
          createdAt: user.createdAt.toISOString(),
        },
        stats: {
          postsCount,
          commentsCount,
          postKarma: karmaStats.postKarma,
          commentKarma: karmaStats.commentKarma,
          awardKarma: karmaStats.awardKarma,
          totalKarma: karmaStats.totalKarma,
          level: pointLevel.level,
          maxLevel: pointLevel.maxLevel,
        },
      },
    });
  })
);

export default router;
