import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { body, param, query, validationResult } from 'express-validator';

const router = Router();

// Validation middleware
const validatePost = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('content').trim().isLength({ min: 1, max: 10000 }).withMessage('Content must be 1-10000 characters'),
  body('type').isIn(['discussion', 'case_study', 'tool_review', 'question']).withMessage('Invalid post type'),
  body('communityId').isUUID().withMessage('Invalid community ID'),
  body('specialty').optional().isString().withMessage('Specialty must be a string'),
  body('caseType').optional().isString().withMessage('Case type must be a string'),
  body('patientAge').optional().isInt({ min: 0, max: 120 }).withMessage('Patient age must be 0-120'),
  body('procedureType').optional().isString().withMessage('Procedure type must be a string'),
];

const validateVote = [
  param('id').isUUID().withMessage('Invalid post ID'),
  body('type').isIn(['upvote', 'downvote']).withMessage('Vote type must be upvote or downvote'),
];

// Create a new post
router.post('/', authenticate, validatePost, asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const {
    title,
    content,
    type,
    communityId,
    specialty,
    caseType,
    patientAge,
    procedureType,
    attachments
  } = req.body;

  // Check if community exists
  const community = await prisma.community.findUnique({
    where: { id: communityId }
  });

  if (!community) {
    throw new AppError('Community not found', 404);
  }

  // Create the post
  const post = await prisma.post.create({
    data: {
      title,
      content,
      type,
      specialty,
      caseType,
      patientAge: patientAge ? parseInt(patientAge) : null,
      procedureType,
      authorId: req.user!.id,
      communityId,
      attachments: attachments ? {
        create: attachments.map((attachment: any) => ({
          filename: attachment.filename,
          originalName: attachment.originalName,
          mimeType: attachment.mimetype,
          size: attachment.size,
          path: attachment.url,
        }))
      } : undefined,
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          specialty: true,
          profileImage: true,
        }
      },
      community: {
        select: {
          id: true,
          name: true,
          slug: true,
        }
      },
      attachments: true,
      votes: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
            }
          }
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

  // Log the post creation for audit purposes
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'CREATE_POST',
      resource: 'post',
      resourceId: post.id,
      details: {
        title: post.title,
        type: post.type,
        communityId: post.communityId,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.status(201).json({
    success: true,
    data: post
  });
}));

// Get posts with pagination and filtering
router.get('/', optionalAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  query('community').optional().isUUID().withMessage('Invalid community ID'),
  query('type').optional().isIn(['discussion', 'case_study', 'tool_review', 'question']).withMessage('Invalid post type'),
  query('specialty').optional().isString().withMessage('Specialty must be a string'),
  query('sort').optional().isIn(['newest', 'oldest', 'popular', 'controversial']).withMessage('Invalid sort option'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;
  const { community, type, specialty, sort } = req.query;

  // Build where clause
  const where: any = {
    isDeleted: false,
  };

  if (community) {
    where.communityId = community;
  }

  if (type) {
    where.type = type;
  }

  if (specialty) {
    where.specialty = specialty;
  }

  // Build orderBy clause
  let orderBy: any = { createdAt: 'desc' };
  
  if (sort === 'oldest') {
    orderBy = { createdAt: 'asc' };
  } else if (sort === 'popular') {
    orderBy = { votes: { _count: 'desc' } };
  } else if (sort === 'controversial') {
    // This would need a more complex query to calculate controversy score
    orderBy = { createdAt: 'desc' };
  }

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy,
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
          }
        },
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
          }
        },
        attachments: true,
        votes: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              }
            }
          }
        },
        _count: {
          select: {
            comments: true,
            votes: true,
          }
        }
      }
    }),
    prisma.post.count({ where })
  ]);

  // Calculate vote scores for each post
  const postsWithScores = posts.map(post => {
    const upvotes = post.votes.filter(vote => vote.type === 'upvote').length;
    const downvotes = post.votes.filter(vote => vote.type === 'downvote').length;
    const userVote = req.user ? post.votes.find(vote => vote.userId === req.user!.id) : null;

    return {
      ...post,
      voteScore: upvotes - downvotes,
      upvotes,
      downvotes,
      userVote: userVote ? userVote.type : null,
    };
  });

  res.json({
    success: true,
    data: {
      posts: postsWithScores,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      }
    }
  });
}));

// Get single post
router.get('/:id', optionalAuth, [
  param('id').isUUID().withMessage('Invalid post ID'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          specialty: true,
          profileImage: true,
        }
      },
      community: {
        select: {
          id: true,
          name: true,
          slug: true,
        }
      },
      attachments: true,
      votes: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
            }
          }
        }
      },
      comments: {
        include: {
          author: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              specialty: true,
              profileImage: true,
            }
          },
          votes: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
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
        },
        orderBy: { createdAt: 'asc' }
      },
      _count: {
        select: {
          comments: true,
          votes: true,
        }
      }
    }
  });

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  // Calculate vote scores
  const upvotes = post.votes.filter(vote => vote.type === 'upvote').length;
  const downvotes = post.votes.filter(vote => vote.type === 'downvote').length;
  const userVote = req.user ? post.votes.find(vote => vote.userId === req.user!.id) : null;

  // Calculate comment vote scores
  const commentsWithScores = post.comments.map(comment => {
    const commentUpvotes = comment.votes.filter(vote => vote.type === 'upvote').length;
    const commentDownvotes = comment.votes.filter(vote => vote.type === 'downvote').length;
    const commentUserVote = req.user ? comment.votes.find(vote => vote.userId === req.user!.id) : null;

    return {
      ...comment,
      voteScore: commentUpvotes - commentDownvotes,
      upvotes: commentUpvotes,
      downvotes: commentDownvotes,
      userVote: commentUserVote ? commentUserVote.type : null,
    };
  });

  res.json({
    success: true,
    data: {
      ...post,
      voteScore: upvotes - downvotes,
      upvotes,
      downvotes,
      userVote: userVote ? userVote.type : null,
      comments: commentsWithScores,
    }
  });
}));

// Vote on a post
router.post('/:id/vote', authenticate, validateVote, asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;
  const { type } = req.body;

  // Check if post exists
  const post = await prisma.post.findUnique({
    where: { id }
  });

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  // Check if user already voted
  const existingVote = await prisma.postVote.findUnique({
    where: {
      postId_userId: {
        postId: id,
        userId: req.user!.id,
      }
    }
  });

  if (existingVote) {
    if (existingVote.type === type) {
      // Remove the vote if it's the same type
      await prisma.postVote.delete({
        where: { id: existingVote.id }
      });

      // Log the vote removal
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'REMOVE_POST_VOTE',
          resource: 'post_vote',
          resourceId: existingVote.id,
          details: {
            postId: id,
            voteType: type,
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        }
      });

      return res.json({
        success: true,
        message: 'Vote removed',
        data: { voteType: null }
      });
    } else {
      // Update the vote type
      await prisma.postVote.update({
        where: { id: existingVote.id },
        data: { type }
      });

      // Log the vote update
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'UPDATE_POST_VOTE',
          resource: 'post_vote',
          resourceId: existingVote.id,
          details: {
            postId: id,
            voteType: type,
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        }
      });

      return res.json({
        success: true,
        message: 'Vote updated',
        data: { voteType: type }
      });
    }
  }

  // Create new vote
  const vote = await prisma.postVote.create({
    data: {
      postId: id,
      userId: req.user!.id,
      type
    }
  });

  // Log the vote creation
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'CREATE_POST_VOTE',
      resource: 'post_vote',
      resourceId: vote.id,
      details: {
        postId: id,
        voteType: type,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: 'Vote recorded',
    data: { voteType: type }
  });
}));

// Update post
router.put('/:id', authenticate, [
  param('id').isUUID().withMessage('Invalid post ID'),
  body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('content').optional().trim().isLength({ min: 1, max: 10000 }).withMessage('Content must be 1-10000 characters'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;
  const { title, content } = req.body;

  // Check if post exists and user owns it
  const post = await prisma.post.findUnique({
    where: { id }
  });

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  if (post.authorId !== req.user!.id) {
    throw new AppError('Not authorized to edit this post', 403);
  }

  // Update the post
  const updatedPost = await prisma.post.update({
    where: { id },
    data: {
      ...(title && { title }),
      ...(content && { content }),
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          specialty: true,
          profileImage: true,
        }
      },
      community: {
        select: {
          id: true,
          name: true,
          slug: true,
        }
      },
      attachments: true,
      _count: {
        select: {
          comments: true,
          votes: true,
        }
      }
    }
  });

  // Log the post update
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'UPDATE_POST',
      resource: 'post',
      resourceId: id,
      details: {
        changes: { title, content },
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    data: updatedPost
  });
}));

// Delete post
router.delete('/:id', authenticate, [
  param('id').isUUID().withMessage('Invalid post ID'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;

  // Check if post exists and user owns it
  const post = await prisma.post.findUnique({
    where: { id }
  });

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  if (post.authorId !== req.user!.id) {
    throw new AppError('Not authorized to delete this post', 403);
  }

  // Soft delete the post
  await prisma.post.update({
    where: { id },
    data: { isDeleted: true }
  });

  // Log the post deletion
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'DELETE_POST',
      resource: 'post',
      resourceId: id,
      details: {
        title: post.title,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: 'Post deleted successfully'
  });
}));

export default router;
