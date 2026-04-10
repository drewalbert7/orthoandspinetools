import { Router, Response, Request, NextFunction } from 'express';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import { requirePostModeration, canModeratePost } from '../middleware/authorization';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { body, param, query, validationResult } from 'express-validator';
import { updateUserKarma, calculateKarmaChange } from '../utils/karmaService';
import {
  parsePollOptionStrings,
  normalizeLinkUrl,
  enrichPostsPollData,
} from '../utils/postPoll';

const router = Router();

function normalizeCreatePostBody(req: Request, _res: Response, next: NextFunction) {
  const b = req.body as Record<string, unknown>;
  const t = b.type;
  if ((t === undefined || t === null || t === '') && typeof b.postType === 'string' && b.postType.trim()) {
    b.type = b.postType.trim();
  }
  next();
}

// Validation middleware
const validatePost = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('content').optional(),
  body('type').isIn(['discussion', 'case_study', 'tool_review', 'question', 'link', 'poll']).withMessage('Invalid post type'),
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
router.post('/', authenticate, normalizeCreatePostBody, validatePost, asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const {
    title,
    content: rawContent,
    type: typeRaw,
    communityId,
    specialty,
    caseType,
    patientAge,
    procedureType,
    attachments,
    tagIds: rawTagIds
  } = req.body;

  let type =
    typeof typeRaw === 'string' && typeRaw.trim()
      ? typeRaw.trim()
      : typeof (req.body as { postType?: string }).postType === 'string' &&
          String((req.body as { postType?: string }).postType).trim()
        ? String((req.body as { postType?: string }).postType).trim()
        : '';

  if (!type) {
    throw new AppError('Post type is required', 400);
  }

  if (type === 'discussion') {
    const pollParsed =
      Array.isArray(req.body.pollOptions) && parsePollOptionStrings(req.body.pollOptions);
    const pe = req.body.pollEndsAt;
    const hasPollEnd = pe != null && pe !== '';
    if (pollParsed && hasPollEnd) {
      type = 'poll';
    } else if (normalizeLinkUrl(req.body.linkUrl)) {
      type = 'link';
    }
  }

  const content = typeof rawContent === 'string' ? rawContent.trim() : '';
  const attachmentList = Array.isArray(attachments) ? attachments : [];
  const hasAtt = attachmentList.length > 0;

  let linkUrlValue: string | null = null;
  let pollOptionsValue: string[] | null = null;
  let pollEndsAtValue: Date | null = null;

  if (type === 'link') {
    const nu = normalizeLinkUrl(req.body.linkUrl);
    if (!nu) {
      throw new AppError('Valid link URL required (http or https)', 400);
    }
    linkUrlValue = nu;
    if (content.length > 10000) {
      throw new AppError('Body must be at most 10000 characters', 400);
    }
  } else if (type === 'poll') {
    const rawOpts = req.body.pollOptions;
    const arr = Array.isArray(rawOpts) ? rawOpts : [];
    const parsed = parsePollOptionStrings(arr);
    if (!parsed) {
      throw new AppError('Poll requires 2–6 options, each 1–200 characters', 400);
    }
    pollOptionsValue = parsed;
    const pe = req.body.pollEndsAt;
    if (pe == null || pe === '') {
      throw new AppError('Poll end time is required', 400);
    }
    const pollEnd = new Date(pe as string | number);
    if (Number.isNaN(pollEnd.getTime())) {
      throw new AppError('Invalid poll end time', 400);
    }
    const t = Date.now();
    const maxEnd = t + 7 * 24 * 60 * 60 * 1000;
    if (pollEnd.getTime() <= t) {
      throw new AppError('Poll must end in the future', 400);
    }
    if (pollEnd.getTime() > maxEnd) {
      throw new AppError('Poll duration cannot exceed 7 days', 400);
    }
    pollEndsAtValue = pollEnd;
    if (content.length > 10000) {
      throw new AppError('Body must be at most 10000 characters', 400);
    }
  } else if (!hasAtt && (content.length < 1 || content.length > 10000)) {
    throw new AppError(
      'Content must be 1-10000 characters, unless the post includes at least one attachment',
      400
    );
  }

  // Check if community exists
  const community = await prisma.community.findUnique({
    where: { id: communityId }
  });

  if (!community) {
    throw new AppError('Community not found', 404);
  }

  // Validate tags if provided
  let tagIds: string[] | undefined = undefined;
  if (rawTagIds && Array.isArray(rawTagIds) && rawTagIds.length > 0) {
    // Filter out invalid tag IDs (null, undefined, empty strings)
    const validTagIds = rawTagIds.filter((id) => id && typeof id === 'string' && id.trim().length > 0);
    
    if (validTagIds.length === 0) {
      // If all tag IDs were invalid, just continue without tags
      tagIds = undefined;
    } else if (validTagIds.length !== rawTagIds.length) {
      // Some tag IDs were invalid
      throw new AppError('Invalid tag IDs provided', 400);
    } else {
      // Verify all tags belong to this community
      const tags = await prisma.communityTag.findMany({
        where: {
          id: { in: validTagIds },
          communityId: communityId
        }
      });

      if (tags.length !== validTagIds.length) {
        throw new AppError('One or more tags do not belong to this community', 400);
      }
      
      // Use validated tag IDs
      tagIds = validTagIds;
    }
  }

  // Create the post
  const post = await prisma.post.create({
    data: {
      title,
      content,
      type,
      linkUrl: linkUrlValue,
      pollOptions: pollOptionsValue ?? undefined,
      pollEndsAt: pollEndsAtValue,
      specialty,
      caseType,
      patientAge: patientAge ? parseInt(patientAge) : null,
      procedureType,
      authorId: req.user!.id,
      communityId,
      attachments: hasAtt ? {
        create: attachmentList.map((raw: unknown) => {
          const attachment = raw as Record<string, unknown>;
          const url = String(
            attachment.url ||
              attachment.cloudinaryUrl ||
              attachment.secure_url ||
              attachment.path ||
              ''
          ).trim();
          if (!url) {
            throw new AppError('Each attachment must include a valid url', 400);
          }
          const mimeRaw =
            (typeof attachment.mimetype === 'string' && attachment.mimetype.trim()
              ? attachment.mimetype
              : typeof attachment.mimeType === 'string' && attachment.mimeType.trim()
                ? attachment.mimeType
                : '') || 'application/octet-stream';
          const mime = mimeRaw.trim();
          const size = Number(attachment.size);
          const optStr = (v: unknown): string | undefined =>
            typeof v === 'string' && v.trim() ? v.trim() : undefined;
          return {
            filename: String(attachment.filename || 'file').slice(0, 500),
            originalName: String(attachment.originalName || attachment.filename || 'file').slice(0, 500),
            mimeType: mime,
            size: Number.isFinite(size) && size >= 0 ? Math.floor(size) : 0,
            path: url,
            cloudinaryPublicId: optStr(attachment.cloudinaryPublicId),
            cloudinaryUrl: url,
            optimizedUrl: optStr(attachment.optimizedUrl),
            thumbnailUrl: optStr(attachment.thumbnailUrl),
            width: (() => {
              const n = attachment.width != null ? parseInt(String(attachment.width), 10) : NaN;
              return Number.isFinite(n) ? n : undefined;
            })(),
            height: (() => {
              const n = attachment.height != null ? parseInt(String(attachment.height), 10) : NaN;
              return Number.isFinite(n) ? n : undefined;
            })(),
            duration: (() => {
              const n = attachment.duration != null ? parseInt(String(attachment.duration), 10) : NaN;
              return Number.isFinite(n) ? n : undefined;
            })(),
          };
        })
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
          isVerifiedPhysician: true,
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

  const [postOut] = await enrichPostsPollData([post], req.user!.id);

  res.status(201).json({
    success: true,
    data: postOut
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
          isVerifiedPhysician: true,
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
      linkUrl: post.linkUrl,
      pollOptions: post.pollOptions,
      pollEndsAt: post.pollEndsAt,
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

  const postsEnriched = await enrichPostsPollData(postsWithVotes, req.user?.id);

  return res.json({
    success: true,
    data: {
      posts: postsEnriched,
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
  query('type').optional().isIn(['discussion', 'case_study', 'tool_review', 'question', 'link', 'poll']).withMessage('Invalid post type'),
  query('specialty').optional().isString().withMessage('Specialty must be a string'),
  query('sort').optional().isIn(['newest', 'oldest', 'popular', 'controversial', 'best', 'top', 'rising']).withMessage('Invalid sort option'),
  query('q').optional().isString().isLength({ max: 200 }).withMessage('Search query too long'),
  query('tag').optional().isString().isLength({ min: 1, max: 64 }).withMessage('Invalid tag filter'),
  query('tagMatch')
    .optional()
    .trim()
    .isLength({ min: 2, max: 64 })
    .withMessage('tagMatch must be 2-64 characters'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;
  const { community, type, specialty, sort, q, tag, tagMatch } = req.query;

  // Build where clause
  const where: any = {
    isDeleted: false,
  };

  const searchTerm = typeof q === 'string' ? q.trim() : '';
  if (searchTerm.length > 0) {
    where.OR = [
      { title: { contains: searchTerm, mode: 'insensitive' } },
      { content: { contains: searchTerm, mode: 'insensitive' } },
    ];
  }

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

  const tagFilter = typeof tag === 'string' ? tag.trim() : '';
  if (tagFilter) {
    const tagRow = await prisma.communityTag.findUnique({
      where: { id: tagFilter },
      select: { id: true, communityId: true },
    });
    if (!tagRow) {
      throw new AppError('Topic tag not found', 404);
    }
    if (where.communityId && tagRow.communityId !== where.communityId) {
      throw new AppError('That topic tag does not belong to this community', 400);
    }
    if (!where.communityId) {
      where.communityId = tagRow.communityId;
    }
    where.tags = { some: { tagId: tagRow.id } };
  } else {
    const tagMatchRaw = typeof tagMatch === 'string' ? tagMatch.trim() : '';
    if (tagMatchRaw.length >= 2) {
      const matchingTags = await prisma.communityTag.findMany({
        where: {
          OR: [
            { name: { contains: tagMatchRaw, mode: 'insensitive' } },
            { description: { contains: tagMatchRaw, mode: 'insensitive' } },
          ],
        },
        select: { id: true, communityId: true },
      });
      let tagIds = matchingTags.map((t) => t.id);
      if (where.communityId) {
        tagIds = matchingTags.filter((t) => t.communityId === where.communityId).map((t) => t.id);
      }
      if (tagIds.length === 0) {
        where.id = { in: [] as string[] };
      } else {
        where.tags = { some: { tagId: { in: tagIds } } };
      }
    }
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
            isVerifiedPhysician: true,
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
      }
    }
  });
}));

const validatePollVote = [
  param('id').isString().isLength({ min: 1 }).withMessage('Invalid post ID'),
  body('optionIndex').isInt({ min: 0 }).withMessage('optionIndex must be a non-negative integer'),
];

router.post('/:id/poll-vote', authenticate, validatePollVote, asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { id } = req.params;
  const optionIndex = Number(req.body.optionIndex);

  const post = await prisma.post.findFirst({
    where: { id, isDeleted: false },
    select: { id: true, type: true, pollOptions: true, pollEndsAt: true },
  });

  if (!post || post.type !== 'poll') {
    throw new AppError('Not a poll post', 400);
  }

  const opts = parsePollOptionStrings(post.pollOptions);
  if (!opts || optionIndex < 0 || optionIndex >= opts.length) {
    throw new AppError('Invalid poll option', 400);
  }

  if (post.pollEndsAt && new Date(post.pollEndsAt) <= new Date()) {
    throw new AppError('This poll has ended', 400);
  }

  await prisma.postPollVote.upsert({
    where: { postId_userId: { postId: id, userId: req.user!.id } },
    create: {
      postId: id,
      userId: req.user!.id,
      optionIndex,
    },
    update: { optionIndex },
  });

  const [enriched] = await enrichPostsPollData(
    [
      {
        id: post.id,
        type: post.type,
        pollOptions: post.pollOptions,
        pollEndsAt: post.pollEndsAt,
      },
    ],
    req.user!.id
  );

  return res.json({
    success: true,
    data: {
      pollVoteCounts: enriched.pollVoteCounts,
      userPollVoteIndex: enriched.userPollVoteIndex,
      pollClosed: enriched.pollClosed,
    },
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
          isVerifiedPhysician: true,
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
              isVerifiedPhysician: true,
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
    const commentUpvotes = comment.votes.filter((vote: any) => vote.type === 'upvote').length;
    const commentDownvotes = comment.votes.filter((vote: any) => vote.type === 'downvote').length;
    const commentUserVote = req.user ? comment.votes.find((vote: any) => vote.userId === req.user!.id) : null;

    return {
      ...comment,
      voteScore: commentUpvotes - commentDownvotes,
      upvotes: commentUpvotes,
      downvotes: commentDownvotes,
      userVote: commentUserVote ? commentUserVote.type : null,
    };
  });

  const base = {
    ...post,
    voteScore: upvotes - downvotes,
    upvotes,
    downvotes,
    userVote: userVote ? userVote.type : null,
    comments: commentsWithScores,
    isLocked: post.isLocked || false,
    isPinned: post.isPinned || false,
    isDeleted: post.isDeleted || false,
  };

  const [dataOut] = await enrichPostsPollData([base], req.user?.id);

  return res.json({
    success: true,
    data: dataOut,
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
          isVerifiedPhysician: true,
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
