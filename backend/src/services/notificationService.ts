import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export type NotificationType = 'comment_reply' | 'post_reply' | 'mention' | 'vote' | 'mod_action';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  relatedPostId?: string;
  relatedCommentId?: string;
  relatedUserId?: string;
}

/**
 * Create a notification for a user
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    // Don't notify users about their own actions
    if (params.relatedUserId === params.userId) {
      return;
    }

    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
        relatedPostId: params.relatedPostId,
        relatedCommentId: params.relatedCommentId,
        relatedUserId: params.relatedUserId,
      },
    });
  } catch (error) {
    logger.error('Error creating notification:', error);
    // Don't throw - notifications are non-critical
  }
}

/**
 * Notify post author when someone comments on their post
 */
export async function notifyPostAuthor(
  postId: string,
  commentAuthorId: string,
  commentAuthorName: string
): Promise<void> {
  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, title: true },
    });

    if (!post || post.authorId === commentAuthorId) {
      return; // Don't notify if post doesn't exist or user is commenting on their own post
    }

    await createNotification({
      userId: post.authorId,
      type: 'post_reply',
      title: 'New comment on your post',
      message: `${commentAuthorName} commented on your post "${post.title}"`,
      link: `/post/${postId}`,
      relatedPostId: postId,
      relatedUserId: commentAuthorId,
    });
  } catch (error) {
    logger.error('Error notifying post author:', error);
  }
}

/**
 * Notify parent comment author when someone replies to their comment
 */
export async function notifyCommentAuthor(
  parentCommentId: string,
  replyAuthorId: string,
  replyAuthorName: string
): Promise<void> {
  try {
    const parentComment = await prisma.comment.findUnique({
      where: { id: parentCommentId },
      select: { authorId: true, postId: true, content: true },
    });

    if (!parentComment || parentComment.authorId === replyAuthorId) {
      return; // Don't notify if comment doesn't exist or user is replying to their own comment
    }

    const commentPreview = parentComment.content.length > 50
      ? parentComment.content.substring(0, 50) + '...'
      : parentComment.content;

    await createNotification({
      userId: parentComment.authorId,
      type: 'comment_reply',
      title: 'New reply to your comment',
      message: `${replyAuthorName} replied to your comment: "${commentPreview}"`,
      link: `/post/${parentComment.postId}#comment-${parentCommentId}`,
      relatedPostId: parentComment.postId,
      relatedCommentId: parentCommentId,
      relatedUserId: replyAuthorId,
    });
  } catch (error) {
    logger.error('Error notifying comment author:', error);
  }
}

/**
 * Notify post author when someone upvotes their post
 */
export async function notifyPostUpvote(
  postId: string,
  voterId: string,
  voterName: string
): Promise<void> {
  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, title: true },
    });

    if (!post || post.authorId === voterId) {
      return; // Don't notify if post doesn't exist or user is upvoting their own post
    }

    await createNotification({
      userId: post.authorId,
      type: 'vote',
      title: 'Your post got an upvote',
      message: `${voterName} upvoted your post "${post.title}"`,
      link: `/post/${postId}`,
      relatedPostId: postId,
      relatedUserId: voterId,
    });
  } catch (error) {
    logger.error('Error notifying post upvote:', error);
  }
}

/**
 * Notify comment author when someone upvotes their comment
 */
export async function notifyCommentUpvote(
  commentId: string,
  voterId: string,
  voterName: string
): Promise<void> {
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true, postId: true, content: true },
    });

    if (!comment || comment.authorId === voterId) {
      return; // Don't notify if comment doesn't exist or user is upvoting their own comment
    }

    const commentPreview = comment.content.length > 50
      ? comment.content.substring(0, 50) + '...'
      : comment.content;

    await createNotification({
      userId: comment.authorId,
      type: 'vote',
      title: 'Your comment got an upvote',
      message: `${voterName} upvoted your comment: "${commentPreview}"`,
      link: `/post/${comment.postId}#comment-${commentId}`,
      relatedPostId: comment.postId,
      relatedCommentId: commentId,
      relatedUserId: voterId,
    });
  } catch (error) {
    logger.error('Error notifying comment upvote:', error);
  }
}

