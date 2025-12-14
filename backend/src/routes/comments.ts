import { Router, Request, Response } from 'express';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import { requireCommentModeration, canModerateComment } from '../middleware/authorization';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { body, param, query, validationResult } from 'express-validator';
import { updateUserKarma, calculateKarmaChange } from '../utils/karmaService';
import { notifyPostAuthor, notifyCommentAuthor, notifyCommentUpvote } from '../services/notificationService';

const router = Router();

// Validation middleware
const validateComment = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ min: 1, max: 5000 })
    .withMessage('Content must be 1-5000 characters'),
  body('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
  body('parentId')
    .optional()
    .isString()
    .withMessage('Parent comment ID must be a string'),
];

const validateCommentVote = [
  param('id').isString().withMessage('Invalid comment ID'),
  body('type').isIn(['upvote', 'downvote']).withMessage('Vote type must be upvote or downvote'),
];

// Create a new comment
router.post('/', authenticate, validateComment, asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(e => {
      const param = 'param' in e ? e.param : 'unknown';
      return `${param}: ${e.msg}`;
    }).join(', ');
    throw new AppError(`Validation failed: ${errorMessages}`, 400);
  }

  const { content, postId, parentId } = req.body;

  // Check if post exists and is not locked/deleted
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      isLocked: true,
      isDeleted: true,
    }
  });

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  if (post.isDeleted) {
    throw new AppError('Cannot comment on deleted post', 400);
  }

  if (post.isLocked) {
    throw new AppError('This post is locked. Comments are disabled.', 403);
  }

  // If parentId is provided, check if parent comment exists
  if (parentId) {
    const parentComment = await prisma.comment.findUnique({
      where: { id: parentId }
    });

    if (!parentComment) {
      throw new AppError('Parent comment not found', 404);
    }

    if (parentComment.postId !== postId) {
      throw new AppError('Parent comment does not belong to this post', 400);
    }
  }

  // Create the comment
  const comment = await prisma.comment.create({
    data: {
      content,
      authorId: req.user!.id,
      postId,
      parentId: parentId || null,
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
      parent: {
        include: {
          author: {
            select: {
              id: true,
              username: true,
            }
          }
        }
      },
      replies: {
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
      votes: {
        select: {
          id: true,
          type: true,
          userId: true,
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

  // Calculate vote score for the comment
  const upvotes = (comment.votes as any[]).filter((vote: any) => vote.type === 'upvote').length;
  const downvotes = (comment.votes as any[]).filter((vote: any) => vote.type === 'downvote').length;
  const userVote = (comment.votes as any[]).find((vote: any) => vote.userId === req.user!.id);

  // Send notifications (non-blocking)
  const commentAuthorName = `${comment.author.firstName} ${comment.author.lastName}`.trim() || comment.author.username;
  
  if (parentId) {
    // Notify parent comment author
    notifyCommentAuthor(parentId, req.user!.id, commentAuthorName).catch(err => {
      logger.error('Error sending comment reply notification:', err);
    });
  } else {
    // Notify post author
    notifyPostAuthor(postId, req.user!.id, commentAuthorName).catch(err => {
      logger.error('Error sending post reply notification:', err);
    });
  }

  // Transform comment to match frontend interface
  const commentResponse = {
    ...comment,
    voteScore: upvotes - downvotes,
    upvotes,
    downvotes,
    userVote: userVote ? userVote.type : null,
    replies: (comment.replies as any[]).map((reply: any) => {
      const replyUpvotes = (reply.votes || []).filter((v: any) => v.type === 'upvote').length;
      const replyDownvotes = (reply.votes || []).filter((v: any) => v.type === 'downvote').length;
      const replyUserVote = (reply.votes || []).find((v: any) => v.userId === req.user!.id);
      return {
        ...reply,
        voteScore: replyUpvotes - replyDownvotes,
        upvotes: replyUpvotes,
        downvotes: replyDownvotes,
        userVote: replyUserVote ? replyUserVote.type : null,
        votes: (reply.votes || []).map((v: any) => ({
          id: v.id,
          commentId: reply.id,
          userId: v.userId,
          type: v.type,
        })),
      };
    }),
    votes: (comment.votes as any[]).map((v: any) => ({
      id: v.id,
      commentId: comment.id,
      userId: v.userId,
      type: v.type,
    })),
  };

  // Log the comment creation for audit purposes
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'CREATE_COMMENT',
      resource: 'comment',
      resourceId: comment.id,
      details: {
        postId,
        parentId: parentId || null,
        contentLength: content.length,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.status(201).json({
    success: true,
    data: commentResponse
  });
}));

// Get comments for a post
router.get('/post/:postId', optionalAuth, [
  param('postId').isString().isLength({ min: 1 }).withMessage('Invalid post ID'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { postId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  // Check if post exists
  const post = await prisma.post.findUnique({
    where: { id: postId }
  });

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: {
        postId,
        isDeleted: false,
        parentId: null, // Only top-level comments
      },
      orderBy: { createdAt: 'asc' },
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
        replies: {
          where: { isDeleted: false },
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
            replies: true,
            votes: true,
          }
        }
      }
    }),
    prisma.comment.count({
      where: {
        postId,
        isDeleted: false,
        parentId: null,
      }
    })
  ]);

  // Calculate vote scores for each comment and reply
  const commentsWithScores = comments.map(comment => {
    const upvotes = comment.votes.filter(vote => vote.type === 'upvote').length;
    const downvotes = comment.votes.filter(vote => vote.type === 'downvote').length;
    const userVote = req.user ? comment.votes.find(vote => vote.userId === req.user!.id) : null;

    const repliesWithScores = comment.replies.map(reply => {
      const replyUpvotes = reply.votes.filter(vote => vote.type === 'upvote').length;
      const replyDownvotes = reply.votes.filter(vote => vote.type === 'downvote').length;
      const replyUserVote = req.user ? reply.votes.find(vote => vote.userId === req.user!.id) : null;

      return {
        ...reply,
        voteScore: replyUpvotes - replyDownvotes,
        upvotes: replyUpvotes,
        downvotes: replyDownvotes,
        userVote: replyUserVote ? replyUserVote.type : null,
      };
    });

    return {
      ...comment,
      voteScore: upvotes - downvotes,
      upvotes,
      downvotes,
      userVote: userVote ? userVote.type : null,
      replies: repliesWithScores,
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
      }
    }
  });
}));

// Get single comment
router.get('/:id', optionalAuth, [
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid comment ID'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;

  const comment = await prisma.comment.findUnique({
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
      post: {
        select: {
          id: true,
          title: true,
        }
      },
      parent: {
        include: {
          author: {
            select: {
              id: true,
              username: true,
            }
          }
        }
      },
      replies: {
        where: { isDeleted: false },
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
    }
  });

  if (!comment) {
    throw new AppError('Comment not found', 404);
  }

  // Calculate vote scores
  const upvotes = comment.votes.filter(vote => vote.type === 'upvote').length;
  const downvotes = comment.votes.filter(vote => vote.type === 'downvote').length;
  const userVote = req.user ? comment.votes.find(vote => vote.userId === req.user!.id) : null;

  // Calculate reply vote scores
  const repliesWithScores = comment.replies.map(reply => {
    const replyUpvotes = reply.votes.filter(vote => vote.type === 'upvote').length;
    const replyDownvotes = reply.votes.filter(vote => vote.type === 'downvote').length;
    const replyUserVote = req.user ? reply.votes.find(vote => vote.userId === req.user!.id) : null;

    return {
      ...reply,
      voteScore: replyUpvotes - replyDownvotes,
      upvotes: replyUpvotes,
      downvotes: replyDownvotes,
      userVote: replyUserVote ? replyUserVote.type : null,
    };
  });

  return res.json({
    success: true,
    data: {
      ...comment,
      voteScore: upvotes - downvotes,
      upvotes,
      downvotes,
      userVote: userVote ? userVote.type : null,
      replies: repliesWithScores,
    }
  });
}));

// Vote on a comment
router.post('/:id/vote', authenticate, validateCommentVote, asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;
  const { type } = req.body;

  // Check if comment exists and get author info
  const comment = await prisma.comment.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
        }
      }
    }
  });

  if (!comment) {
    throw new AppError('Comment not found', 404);
  }

  // Check if user already voted
  const existingVote = await prisma.commentVote.findUnique({
    where: {
      commentId_userId: {
        commentId: id,
        userId: req.user!.id,
      }
    }
  });

  if (existingVote) {
    if (existingVote.type === type) {
      // Remove the vote if it's the same type
      await prisma.commentVote.delete({
        where: { id: existingVote.id }
      });

      // Update karma for comment author
      const karmaChange = calculateKarmaChange(existingVote.type, 'remove');
      if (karmaChange !== 0) {
        await updateUserKarma(comment.authorId, 'comment', karmaChange);
      }

      // Log the vote removal
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'REMOVE_COMMENT_VOTE',
          resource: 'comment_vote',
          resourceId: existingVote.id,
          details: {
            commentId: id,
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
      await prisma.commentVote.update({
        where: { id: existingVote.id },
        data: { type }
      });

      // Update karma for comment author
      const karmaChange = calculateKarmaChange(existingVote.type, type);
      if (karmaChange !== 0) {
        await updateUserKarma(comment.authorId, 'comment', karmaChange);
      }

      // Log the vote update
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'UPDATE_COMMENT_VOTE',
          resource: 'comment_vote',
          resourceId: existingVote.id,
          details: {
            commentId: id,
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

  // Get voter info for notifications
  const voter = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
    }
  });

  // Create new vote
  const vote = await prisma.commentVote.create({
    data: {
      commentId: id,
      userId: req.user!.id,
      type
    }
  });

  // Update karma for comment author
  const karmaChange = calculateKarmaChange(null, type);
  if (karmaChange !== 0) {
    await updateUserKarma(comment.authorId, 'comment', karmaChange);
  }

  // Send notification for upvotes (non-blocking)
  if (type === 'upvote' && voter) {
    const voterName = `${voter.firstName} ${voter.lastName}`.trim() || voter.username;
    notifyCommentUpvote(id, req.user!.id, voterName).catch(err => {
      logger.error('Error sending comment upvote notification:', err);
    });
  }

  // Log the vote creation
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'CREATE_COMMENT_VOTE',
      resource: 'comment_vote',
      resourceId: vote.id,
      details: {
        commentId: id,
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

// Update comment
router.put('/:id', authenticate, [
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid comment ID'),
  body('content').trim().isLength({ min: 1, max: 5000 }).withMessage('Content must be 1-5000 characters'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;
  const { content } = req.body;

  // Check if comment exists and user owns it
  const comment = await prisma.comment.findUnique({
    where: { id }
  });

  if (!comment) {
    throw new AppError('Comment not found', 404);
  }

  if (comment.authorId !== req.user!.id) {
    throw new AppError('Not authorized to edit this comment', 403);
  }

  // Update the comment
  const updatedComment = await prisma.comment.update({
    where: { id },
    data: { content },
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
      post: {
        select: {
          id: true,
          title: true,
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

  // Log the comment update
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'UPDATE_COMMENT',
      resource: 'comment',
      resourceId: id,
      details: {
        contentLength: content.length,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    data: updatedComment
  });
}));

// Delete comment (author, moderator, or admin)
router.delete('/:id', authenticate, [
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid comment ID'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;

  // Check if comment exists
  const comment = await prisma.comment.findUnique({
    where: { id }
  });

  if (!comment) {
    throw new AppError('Comment not found', 404);
  }

  // Check if user can delete (author, moderator, or admin)
  const canDelete = await canModerateComment(id, req.user!.id);
  if (!canDelete) {
    throw new AppError('Not authorized to delete this comment', 403);
  }

  const isModeratorAction = comment.authorId !== req.user!.id;

  // Soft delete the comment
  await prisma.comment.update({
    where: { id },
    data: { isDeleted: true }
  });

  // Log the comment deletion
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: isModeratorAction ? 'MODERATOR_DELETE_COMMENT' : 'DELETE_COMMENT',
      resource: 'comment',
      resourceId: id,
      details: {
        contentLength: comment.content.length,
        authorId: comment.authorId,
        isModeratorAction,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: 'Comment deleted successfully'
  });
}));

export default router;
