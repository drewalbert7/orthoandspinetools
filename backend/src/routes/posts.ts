import { Router, Request, Response } from 'express';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import { requirePostModeration, canModeratePost } from '../middleware/authorization';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { body, param, query, validationResult } from 'express-validator';
import { updateUserKarma, calculateKarmaChange } from '../utils/karmaService';

const router = Router();

// Validation middleware
const validatePost = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('content').trim().isLength({ min: 1, max: 10000 }).withMessage('Content must be 1-10000 characters'),
  body('type').isIn(['discussion', 'case_study', 'tool_review', 'question']).withMessage('Invalid post type'),
  body('communityId').isString().withMessage('Invalid community ID'),
  body('specialty').optional().isString().withMessage('Specialty must be a string'),
  body('caseType').optional().isString().withMessage('Case type must be a string'),
  body('patientAge').optional().isInt({ min: 0, max: 120 }).withMessage('Patient age must be 0-120'),
  body('procedureType').optional().isString().withMessage('Procedure type must be a string'),
];

const validateVote = [
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid post ID'),
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
    attachments,
    tagIds
  } = req.body;

  // Check if community exists
  const community = await prisma.community.findUnique({
    where: { id: communityId }
  });

  if (!community) {
    throw new AppError('Community not found', 404);
  }

  // Validate tags if provided
  if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
    // Verify all tags belong to this community
    const tags = await prisma.communityTag.findMany({
      where: {
        id: { in: tagIds },
        communityId: communityId
      }
    });

    if (tags.length !== tagIds.length) {
      throw new AppError('One or more tags do not belong to this community', 400);
    }
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
          // Cloudinary fields
          cloudinaryPublicId: attachment.cloudinaryPublicId,
          cloudinaryUrl: attachment.url,
          optimizedUrl: attachment.optimizedUrl,
          thumbnailUrl: attachment.thumbnailUrl,
          width: attachment.width,
          height: attachment.height,
          duration: attachment.duration,
        }))
      } : undefined,
      tags: tagIds && Array.isArray(tagIds) && tagIds.length > 0 ? {
        create: tagIds.map((tagId: string) => ({
          tagId: tagId
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
      tags: {
        include: {
          tag: true
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

// Get feed posts from followed communities (Reddit-style)
router.get('/feed', authenticate, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  query('sort').optional().isIn(['newest', 'oldest', 'popular', 'controversial', 'best', 'top', 'rising']).withMessage('Invalid sort option'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const sort = req.query.sort as string || 'newest';
  const offset = (page - 1) * limit;

  // Get user's followed communities
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      communities: {
        select: { id: true }
      }
    }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const followedCommunityIds = user.communities.map(c => c.id);

  if (followedCommunityIds.length === 0) {
    // If user follows no communities, return empty feed
    return res.json({
      success: true,
      data: {
        posts: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0,
        }
      }
    });
  }

  // Build sort order
  let orderBy: any = {};
  switch (sort) {
    case 'oldest':
      orderBy = { createdAt: 'asc' };
      break;
    case 'popular':
    case 'hot':
      orderBy = { voteScore: 'desc' };
      break;
    case 'top':
      orderBy = { voteScore: 'desc' };
      break;
    case 'best':
      orderBy = { voteScore: 'desc' };
      break;
    case 'rising':
      orderBy = { votes: { _count: 'desc' } };
      break;
    case 'controversial':
      orderBy = { _count: { votes: 'desc' } };
      break;
    default: // newest, new
      orderBy = { createdAt: 'desc' };
  }

  // Get posts from followed communities
  const posts = await prisma.post.findMany({
    where: {
      communityId: { in: followedCommunityIds },
      isDeleted: false,
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
        select: {
          id: true,
          type: true,
          userId: true,
          createdAt: true,
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
    },
    orderBy,
    skip: offset,
    take: limit,
  });

  // Calculate vote scores and user votes
  const postsWithVotes = posts.map(post => {
    const upvotes = post.votes.filter(vote => vote.type === 'upvote').length;
    const downvotes = post.votes.filter(vote => vote.type === 'downvote').length;
    const voteScore = upvotes - downvotes;
    
    // Check if current user has voted
    let userVote: 'upvote' | 'downvote' | null = null;
    if (req.user) {
      const userVoteRecord = post.votes.find(vote => vote.userId === req.user!.id);
      if (userVoteRecord) {
        userVote = userVoteRecord.type as 'upvote' | 'downvote';
      }
    }

    return {
      id: post.id,
      title: post.title,
      content: post.content,
      type: post.type,
      isPinned: post.isPinned,
      isLocked: post.isLocked,
      isDeleted: post.isDeleted,
      specialty: post.specialty,
      caseType: post.caseType,
      patientAge: post.patientAge,
      procedureType: post.procedureType,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      authorId: post.authorId,
      communityId: post.communityId,
      author: post.author,
      community: post.community,
      attachments: post.attachments,
      votes: post.votes,
      _count: post._count,
      voteScore,
      upvotes,
      downvotes,
      userVote,
    };
  });

  // Get total count for pagination
  const total = await prisma.post.count({
    where: {
      communityId: { in: followedCommunityIds },
      isDeleted: false,
    }
  });

  return res.json({
    success: true,
    data: {
      posts: postsWithVotes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      }
    }
  });
}));

// Get posts with pagination and filtering
router.get('/', optionalAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  query('community').optional().isString().withMessage('Invalid community ID'),
  query('type').optional().isIn(['discussion', 'case_study', 'tool_review', 'question']).withMessage('Invalid post type'),
  query('specialty').optional().isString().withMessage('Specialty must be a string'),
  query('sort').optional().isIn(['newest', 'oldest', 'popular', 'controversial', 'best', 'top', 'rising']).withMessage('Invalid sort option'),
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
    // Check if community exists and get its ID
    const communityRecord = await prisma.community.findFirst({
      where: {
        OR: [
          { id: community as string },
          { slug: community as string }
        ]
      },
      select: { id: true }
    });
    
    if (!communityRecord) {
      throw new AppError('Community not found', 404);
    }
    
    where.communityId = communityRecord.id;
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
  } else if (sort === 'popular' || sort === 'hot') {
    // Hot/Popular: Posts with most votes
    orderBy = { votes: { _count: 'desc' } };
  } else if (sort === 'top') {
    // Top: Posts with most votes (proxy for vote score)
    orderBy = { votes: { _count: 'desc' } };
  } else if (sort === 'best') {
    // Best: Posts with most votes (proxy for Reddit's algorithm)
    orderBy = { votes: { _count: 'desc' } };
  } else if (sort === 'rising') {
    // Rising: Posts gaining traction quickly (most votes)
    orderBy = { votes: { _count: 'desc' } };
  } else if (sort === 'controversial') {
    // Controversial: Posts with high engagement
    orderBy = { votes: { _count: 'desc' } };
  } else if (sort === 'newest' || sort === 'new') {
    // New: Most recent posts
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
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid post ID'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;

  const post = await prisma.post.findFirst({
    where: { 
      id,
      isDeleted: false, // Only return non-deleted posts
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
      comments: {
        where: {
          isDeleted: false, // Only return non-deleted comments
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

  return res.json({
    success: true,
    data: {
      ...post,
      voteScore: upvotes - downvotes,
      upvotes,
      downvotes,
      userVote: userVote ? userVote.type : null,
      comments: commentsWithScores,
      isLocked: post.isLocked || false,
      isPinned: post.isPinned || false,
      isDeleted: post.isDeleted || false,
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

      // Update karma for post author
      const karmaChange = calculateKarmaChange(existingVote.type, 'remove');
      if (karmaChange !== 0) {
        await updateUserKarma(post.authorId, 'post', karmaChange);
      }

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
            karmaChange,
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

      // Update karma for post author
      const karmaChange = calculateKarmaChange(existingVote.type, type);
      if (karmaChange !== 0) {
        await updateUserKarma(post.authorId, 'post', karmaChange);
      }

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
            karmaChange,
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

  // Update karma for post author
  const karmaChange = calculateKarmaChange(null, type);
  if (karmaChange !== 0) {
    await updateUserKarma(post.authorId, 'post', karmaChange);
  }

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
        karmaChange,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  return res.json({
    success: true,
    message: 'Vote recorded',
    data: { voteType: type }
  });
}));

// Update post
router.put('/:id', authenticate, [
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid post ID'),
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

// Delete post (author, moderator, or admin)
router.delete('/:id', authenticate, [
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid post ID'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;

  // Check if post exists
  const post = await prisma.post.findUnique({
    where: { id }
  });

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  // Check if user can delete (author, moderator, or admin)
  const canDelete = await canModeratePost(id, req.user!.id);
  if (!canDelete) {
    throw new AppError('Not authorized to delete this post', 403);
  }

  const isModeratorAction = post.authorId !== req.user!.id;

  // Soft delete the post
  await prisma.post.update({
    where: { id },
    data: { isDeleted: true }
  });

  // Log the post deletion
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: isModeratorAction ? 'MODERATOR_DELETE_POST' : 'DELETE_POST',
      resource: 'post',
      resourceId: id,
      details: {
        title: post.title,
        authorId: post.authorId,
        isModeratorAction,
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

// Moderation: Lock/Unlock post (moderator/admin only)
router.post('/:id/lock', authenticate, requirePostModeration, [
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid post ID'),
  body('locked').isBoolean().withMessage('Locked must be a boolean'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;
  const { locked } = req.body;

  const post = await prisma.post.update({
    where: { id },
    data: { isLocked: locked }
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: locked ? 'LOCK_POST' : 'UNLOCK_POST',
      resource: 'post',
      resourceId: id,
      details: { title: post.title },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: locked ? 'Post locked successfully' : 'Post unlocked successfully',
    data: { isLocked: locked }
  });
}));

// Moderation: Pin/Unpin post (moderator/admin only)
router.post('/:id/pin', authenticate, requirePostModeration, [
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid post ID'),
  body('pinned').isBoolean().withMessage('Pinned must be a boolean'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;
  const { pinned } = req.body;

  const post = await prisma.post.update({
    where: { id },
    data: { isPinned: pinned }
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: pinned ? 'PIN_POST' : 'UNPIN_POST',
      resource: 'post',
      resourceId: id,
      details: { title: post.title },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: pinned ? 'Post pinned successfully' : 'Post unpinned successfully',
    data: { isPinned: pinned }
  });
}));

export default router;
