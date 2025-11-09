import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';
import { AppError } from './errorHandler';

/**
 * Check if user is a global admin
 */
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError('Access denied. Authentication required.', 401));
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { isAdmin: true }
  });

  if (!user || !user.isAdmin) {
    return next(new AppError('Access denied. Admin privileges required.', 403));
  }

  next();
};

/**
 * Check if user is a moderator of a specific community
 */
export const requireCommunityModerator = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError('Access denied. Authentication required.', 401));
  }

  const communityId = req.params.communityId || req.params.id || req.body.communityId;
  
  if (!communityId) {
    return next(new AppError('Community ID required', 400));
  }

  // Check if user is admin (admins can moderate any community)
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { isAdmin: true }
  });

  if (user?.isAdmin) {
    return next();
  }

  // Check if user is moderator of this community
  const moderator = await prisma.communityModerator.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId: req.user.id,
      }
    }
  });

  if (!moderator) {
    // Also check if user is the community owner
    const community = await prisma.community.findUnique({
      where: { id: communityId },
      select: { ownerId: true }
    });

    if (!community || community.ownerId !== req.user.id) {
      return next(new AppError('Access denied. Community moderator privileges required.', 403));
    }
  }

  next();
};

/**
 * Check if user can moderate a specific post (must be admin, community moderator, or post author)
 */
export const canModeratePost = async (postId: string, userId: string): Promise<boolean> => {
  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true }
  });

  if (user?.isAdmin) {
    return true;
  }

  // Get the post and its community
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      authorId: true,
      communityId: true,
    }
  });

  if (!post) {
    return false;
  }

  // Post author can moderate their own post
  if (post.authorId === userId) {
    return true;
  }

  // Check if user is moderator of the community
  const moderator = await prisma.communityModerator.findUnique({
    where: {
      communityId_userId: {
        communityId: post.communityId,
        userId: userId,
      }
    }
  });

  if (moderator) {
    return true;
  }

  // Check if user is community owner
  const community = await prisma.community.findUnique({
    where: { id: post.communityId },
    select: { ownerId: true }
  });

  return community?.ownerId === userId;
};

/**
 * Check if user can moderate a specific comment (must be admin, community moderator, or comment author)
 */
export const canModerateComment = async (commentId: string, userId: string): Promise<boolean> => {
  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true }
  });

  if (user?.isAdmin) {
    return true;
  }

  // Get the comment and its post
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      authorId: true,
      postId: true,
    }
  });

  if (!comment) {
    return false;
  }

  // Comment author can moderate their own comment
  if (comment.authorId === userId) {
    return true;
  }

  // Get the post to find the community
  const post = await prisma.post.findUnique({
    where: { id: comment.postId },
    select: {
      communityId: true,
    }
  });

  if (!post) {
    return false;
  }

  // Check if user is moderator of the community
  const moderator = await prisma.communityModerator.findUnique({
    where: {
      communityId_userId: {
        communityId: post.communityId,
        userId: userId,
      }
    }
  });

  if (moderator) {
    return true;
  }

  // Check if user is community owner
  const community = await prisma.community.findUnique({
    where: { id: post.communityId },
    select: { ownerId: true }
  });

  return community?.ownerId === userId;
};

/**
 * Middleware to check if user can moderate a post
 */
export const requirePostModeration = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError('Access denied. Authentication required.', 401));
  }

  const postId = req.params.id || req.params.postId || req.body.postId;
  
  if (!postId) {
    return next(new AppError('Post ID required', 400));
  }

  const canModerate = await canModeratePost(postId, req.user.id);
  
  if (!canModerate) {
    return next(new AppError('Access denied. You do not have permission to moderate this post.', 403));
  }

  next();
};

/**
 * Middleware to check if user can moderate a comment
 */
export const requireCommentModeration = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError('Access denied. Authentication required.', 401));
  }

  const commentId = req.params.id || req.params.commentId || req.body.commentId;
  
  if (!commentId) {
    return next(new AppError('Comment ID required', 400));
  }

  const canModerate = await canModerateComment(commentId, req.user.id);
  
  if (!canModerate) {
    return next(new AppError('Access denied. You do not have permission to moderate this comment.', 403));
  }

  next();
};

