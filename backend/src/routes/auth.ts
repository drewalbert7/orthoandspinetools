import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';

const router = Router();

// Validation middleware
const validateRegister = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('Username must be 3-30 characters, alphanumeric and underscores only'),
  body('firstName').trim().isLength({ min: 1, max: 50 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1, max: 50 }).withMessage('Last name is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('specialty').optional().isString().withMessage('Specialty must be a string'),
  body('medicalLicense').optional().isString().withMessage('Medical license must be a string'),
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const validatePasswordReset = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
];

const validatePasswordUpdate = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

// Register new user
router.post('/register', validateRegister, asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const {
    email,
    username,
    firstName,
    lastName,
    password,
    specialty,
    medicalLicense,
    institution,
    yearsExperience
  } = req.body;

  // Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { username }
      ]
    }
  });

  if (existingUser) {
    throw new AppError('User with this email or username already exists', 400);
  }

  // Hash password
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      username,
      firstName,
      lastName,
      passwordHash,
      specialty,
      medicalLicense,
      institution,
      yearsExperience: yearsExperience ? parseInt(yearsExperience) : null,
    },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      specialty: true,
      medicalLicense: true,
      institution: true,
      yearsExperience: true,
      createdAt: true,
    }
  });

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET || 'changeme',
    { expiresIn: (process.env.JWT_EXPIRES_IN as any) || '7d' }
  );

  // Log the registration for audit purposes
  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_REGISTER',
        resource: 'user',
        resourceId: user.id,
        details: {
          email: user.email,
          username: user.username,
          specialty: user.specialty,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      }
    });
  } catch (auditError) {
    logger.error('Failed to create audit log for registration', { error: auditError, userId: user.id });
  }

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user,
      token
    }
  });
}));

// Login user
router.post('/login', validateLogin, asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { email, password } = req.body;
  logger.info('AUTH: Login attempt received', { email });

  // Find user by email (case-insensitive to avoid UX issues)
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      passwordHash: true,
      specialty: true,
      medicalLicense: true,
      institution: true,
      yearsExperience: true,
      profileImage: true,
      bio: true,
      location: true,
      website: true,
      isActive: true,
      isEmailVerified: true,
      isAdmin: true,
      isVerifiedPhysician: true,
      lastLoginAt: true,
    }
  });

  if (!user || !user.isActive) {
    logger.info('AUTH: User not found or inactive', { email });
    throw new AppError('Invalid credentials', 401);
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    logger.info('AUTH: Invalid password', { email, passwordLength: password?.length || 0 });
    throw new AppError('Invalid credentials', 401);
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET || 'changeme',
    { expiresIn: (process.env.JWT_EXPIRES_IN as any) || '7d' }
  );

  // Log the login for audit purposes
  logger.info('AUTH: Login successful', { email });
  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        resource: 'user',
        resourceId: user.id,
        details: {
          email: user.email,
          username: user.username,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      }
    });
  } catch (auditError) {
    logger.error('Failed to create audit log for login', { error: auditError, userId: user.id });
  }

  // Remove password hash from response
  const { passwordHash, ...userWithoutPassword } = user;

  console.log('User object:', user);
  console.log('isAdmin field:', user.isAdmin);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        ...userWithoutPassword,
        isAdmin: user.isAdmin || false
      },
      token
    }
  });
}));

// Get current user profile
router.get('/me', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      specialty: true,
      subSpecialty: true,
      medicalLicense: true,
      institution: true,
      yearsExperience: true,
      bio: true,
      profileImage: true,
      location: true,
      website: true,
      isEmailVerified: true,
      isAdmin: true,
      isVerifiedPhysician: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      _count: {
        select: {
          posts: true,
          comments: true,
          toolReviews: true,
        }
      }
    }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: user
  });
}));

// Update user profile
router.put('/me', authenticate, [
  body('firstName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('First name must be 1-50 characters'),
  body('lastName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters'),
  body('bio').optional().trim().isLength({ max: 500 }).withMessage('Bio must be less than 500 characters'),
  body('specialty').optional().isString().withMessage('Specialty must be a string'),
  body('subSpecialty').optional().isString().withMessage('Sub-specialty must be a string'),
  body('institution').optional().isString().withMessage('Institution must be a string'),
  body('yearsExperience').optional().isInt({ min: 0, max: 50 }).withMessage('Years experience must be 0-50'),
  body('location').optional().isString().withMessage('Location must be a string'),
  body('website').optional().isURL().withMessage('Website must be a valid URL'),
  body('profileImage').optional().isString().isURL().withMessage('Profile image must be a valid URL'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const {
    firstName,
    lastName,
    bio,
    specialty,
    subSpecialty,
    institution,
    yearsExperience,
    location,
    website,
    profileImage
  } = req.body;

  // Get current user to check for old profile image
  const currentUser = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { profileImage: true }
  });

  // If updating profile image and user has an old Cloudinary image, delete it
  if (profileImage !== undefined && profileImage !== currentUser?.profileImage && currentUser?.profileImage) {
    try {
      const { deleteFromCloudinary, extractPublicIdFromUrl } = await import('../services/cloudinaryService');
      const oldImageUrl = currentUser.profileImage;
      
      if (oldImageUrl && oldImageUrl.includes('cloudinary.com')) {
        const publicId = extractPublicIdFromUrl(oldImageUrl);
        
        if (publicId) {
          await deleteFromCloudinary(publicId);
          
          logger.info(`Deleted old profile image from Cloudinary for user ${req.user!.id}`, {
            userId: req.user!.id,
            publicId: publicId,
            oldUrl: oldImageUrl
          });
        }
      }
    } catch (deleteError) {
      // Log error but don't fail the update - old image cleanup is not critical
      logger.warn(`Failed to delete old profile image from Cloudinary:`, deleteError);
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(bio !== undefined && { bio }),
      ...(specialty && { specialty }),
      ...(subSpecialty && { subSpecialty }),
      ...(institution && { institution }),
      ...(yearsExperience !== undefined && { yearsExperience: parseInt(yearsExperience) }),
      ...(location && { location }),
      ...(website && { website }),
      ...(profileImage !== undefined && { profileImage }),
    },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      specialty: true,
      subSpecialty: true,
      medicalLicense: true,
      institution: true,
      yearsExperience: true,
      bio: true,
      profileImage: true,
      location: true,
      website: true,
      isEmailVerified: true,
      createdAt: true,
      updatedAt: true,
    }
  });

  // Log the profile update
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'UPDATE_PROFILE',
      resource: 'user',
      resourceId: req.user!.id,
      details: {
        updatedFields: Object.keys(req.body),
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: updatedUser
  });
}));

// Change password
router.put('/change-password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { currentPassword, newPassword } = req.body;

  // Get user with password hash
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      passwordHash: true,
    }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCurrentPasswordValid) {
    throw new AppError('Current password is incorrect', 400);
  }

  // Hash new password
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { passwordHash: newPasswordHash }
  });

  // Log the password change
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'CHANGE_PASSWORD',
      resource: 'user',
      resourceId: req.user!.id,
      details: {},
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
}));

// Get user profile with posts and communities
router.get('/profile', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      posts: {
        take: 50, // Increased limit for profile page
        orderBy: { createdAt: 'desc' },
        where: {
          isDeleted: false,
        },
        include: {
          community: {
            select: {
              id: true,
              name: true,
              slug: true,
              profileImage: true,
            }
          },
          votes: {
            select: {
              type: true,
              userId: true,
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
      },
      communities: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
        }
      },
      comments: {
        take: 50, // Get user's comments
        orderBy: { createdAt: 'desc' },
        where: {
          isDeleted: false,
        },
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
                }
              }
            }
          },
          votes: {
            select: {
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
      },
      _count: {
        select: {
          posts: true,
          comments: true,
        }
      }
    }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Get real karma data from UserKarma table
  const userKarma = await prisma.userKarma.findUnique({
    where: { userId: user.id }
  });

  const karma = userKarma?.totalKarma || 0;

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
        specialty: user.specialty,
        subSpecialty: user.subSpecialty,
        institution: user.institution,
        bio: user.bio,
        profileImage: user.profileImage,
        location: user.location,
        website: user.website,
        yearsExperience: user.yearsExperience,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
      },
      stats: {
        karma,
        postKarma: userKarma?.postKarma || 0,
        commentKarma: userKarma?.commentKarma || 0,
        awardKarma: userKarma?.awardKarma || 0,
        totalKarma: karma,
        postsCount: (user as any)._count?.posts || 0,
        commentsCount: (user as any)._count?.comments || 0,
        communitiesCount: ((user as any).communities as any[])?.length || 0,
      },
      posts: ((user as any).posts as any[]).map((post: any) => {
        // Calculate user's vote for this post
        const userVote = post.votes.find((v: any) => v.userId === user.id);
        
        return {
          id: post.id,
          title: post.title,
          content: post.content,
          type: post.type,
          specialty: post.specialty,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          authorId: user.id,
          communityId: post.community.id,
          community: post.community,
          author: {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            specialty: user.specialty,
            profileImage: user.profileImage,
          },
          attachments: post.attachments || [],
          votes: post.votes.map((v: any) => ({
            id: v.id || '',
            postId: post.id,
            userId: v.userId,
            type: v.type,
          })),
          voteScore: post.votes.reduce((score: number, vote: any) => score + (vote.type === 'upvote' ? 1 : -1), 0),
          userVote: userVote ? (userVote.type === 'upvote' ? 'upvote' : 'downvote') : null,
          commentsCount: post._count.comments,
          _count: {
            comments: post._count.comments,
            votes: post._count.votes || post.votes.length,
          },
          isLocked: post.isLocked || false,
          isPinned: post.isPinned || false,
          isDeleted: post.isDeleted || false,
        };
      }),
      communities: ((user as any).communities as any[]).map((community: any) => ({
        ...community,
        memberCount: 0, // We'll calculate this separately if needed
      })),
      comments: ((user as any).comments as any[]).map((comment: any) => {
        // Calculate user's vote for this comment
        const userVote = comment.votes.find((v: any) => v.userId === user.id);
        
        return {
          id: comment.id,
          content: comment.content,
          authorId: user.id,
          postId: comment.postId,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          post: comment.post,
          author: {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            specialty: user.specialty,
            profileImage: user.profileImage,
          },
          votes: comment.votes.map((v: any) => ({
            id: v.id || '',
            commentId: comment.id,
            userId: v.userId,
            type: v.type,
          })),
          voteScore: comment.votes.reduce((score: number, vote: any) => score + (vote.type === 'upvote' ? 1 : -1), 0),
          userVote: userVote ? (userVote.type === 'upvote' ? 'upvote' : 'downvote') : null,
          _count: {
            replies: comment._count.replies,
            votes: comment._count.votes || comment.votes.length,
          },
          isDeleted: false,
          replies: [] as any[],
        };
      }),
    }
  });
}));

// Get user's followed communities
router.get('/communities', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      communities: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
        }
      }
    }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: user.communities.map(community => ({
      ...community,
      memberCount: 0, // We'll calculate this separately if needed
    }))
  });
}));

// Follow/Unfollow a community
router.post('/communities/:communityId/follow', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { communityId } = req.params;

  // Check if community exists
  const community = await prisma.community.findUnique({
    where: { id: communityId }
  });

  if (!community) {
    throw new AppError('Community not found', 404);
  }

  // Check if user is already following
  const existingFollow = await prisma.user.findFirst({
    where: {
      id: req.user!.id,
      communities: {
        some: {
          id: communityId
        }
      }
    }
  });

  if (existingFollow) {
    // Unfollow
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        communities: {
          disconnect: { id: communityId }
        }
      }
    });

    res.json({
      success: true,
      message: 'Community unfollowed',
      following: false
    });
  } else {
    // Follow
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        communities: {
          connect: { id: communityId }
        }
      }
    });

    res.json({
      success: true,
      message: 'Community followed',
      following: true
    });
  }
}));

// Logout (client-side token removal, but we can log it)
router.post('/logout', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  // Log the logout
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: 'USER_LOGOUT',
      resource: 'user',
      resourceId: req.user!.id,
      details: {},
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  res.json({
    success: true,
    message: 'Logout successful'
  });
}));

// Request password reset
router.post('/forgot-password', validatePasswordReset, asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { email } = req.body;

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    // Don't reveal if user exists or not for security
    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });
    return;
  }

  // Generate reset token (in production, use crypto.randomBytes)
  const resetToken = jwt.sign(
    { userId: user.id, type: 'password-reset' },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '1h' }
  );

  // In production, send email with reset link
  // For now, we'll log it (remove in production)
  logger.info(`Password reset token for ${email}: ${resetToken}`);

  res.json({
    success: true,
    message: 'If the email exists, a password reset link has been sent',
    // Remove this in production - only for development
    resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
  });
}));

// Reset password with token
router.post('/reset-password', validatePasswordUpdate, asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { token, password } = req.body;

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
    
    if (decoded.type !== 'password-reset') {
      throw new AppError('Invalid reset token', 400);
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Update password
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    // Log password change
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'password_reset',
        resource: 'user',
        resourceId: user.id,
        details: { method: 'token_reset' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    });

    res.json({
      success: true,
      message: 'Password reset successful'
    });

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('Invalid or expired reset token', 400);
    }
    throw error;
  }
}));

// Verify/Unverify physician (Admin only)
router.put('/verify/:userId', authenticate, [
  param('userId').isString().isLength({ min: 1 }).withMessage('Invalid user ID'),
  body('isVerified').isBoolean().withMessage('isVerified must be a boolean'),
], asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(`Validation failed: ${errors.array().map(e => e.msg).join(', ')}`, 400);
  }

  const { userId } = req.params;
  const { isVerified } = req.body;

  // Check if requester is admin
  if (!req.user!.isAdmin) {
    throw new AppError('Only administrators can verify physicians', 403);
  }

  // Get the user to verify
  const userToVerify = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      isVerifiedPhysician: true,
    }
  });

  if (!userToVerify) {
    throw new AppError('User not found', 404);
  }

  // Update verification status
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { isVerifiedPhysician: isVerified },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      isVerifiedPhysician: true,
      profileImage: true,
    }
  });

  // Log the verification action
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: isVerified ? 'VERIFY_PHYSICIAN' : 'UNVERIFY_PHYSICIAN',
      resource: 'user',
      resourceId: userId,
      details: {
        verifiedUserId: userId,
        verifiedUsername: userToVerify.username,
        isVerified: isVerified,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }
  });

  logger.info(`${isVerified ? 'Verified' : 'Unverified'} physician: ${userToVerify.username}`, {
    adminId: req.user!.id,
    userId: userId,
    isVerified: isVerified
  });

  res.json({
    success: true,
    message: `Physician ${isVerified ? 'verified' : 'unverified'} successfully`,
    data: updatedUser
  });
}));

export default router;
