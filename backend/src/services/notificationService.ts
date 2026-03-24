import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

/** True when the `notifications` table is missing (migration not applied yet). Avoids 500s on reads. */
function isNotificationsTableMissing(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021';
}

function logNotificationsDegraded(reason: string, err: unknown) {
  logger.warn({
    msg: 'Notifications API degraded — run `npx prisma migrate deploy` if you expect this feature.',
    reason,
    error: err instanceof Error ? err.message : String(err),
  });
}

/** Notification type values stored in DB */
export const NotificationType = {
  COMMENT_ON_POST: 'COMMENT_ON_POST',
  REPLY_TO_COMMENT: 'REPLY_TO_COMMENT',
} as const;

export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  actorId?: string | null;
  postId?: string | null;
  commentId?: string | null;
};

/**
 * Create a notification. Swallows errors so callers (e.g. comment POST) never fail.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    if (!input.userId || input.userId === input.actorId) {
      return;
    }

    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? undefined,
        actorId: input.actorId ?? undefined,
        postId: input.postId ?? undefined,
        commentId: input.commentId ?? undefined,
      },
    });
  } catch (err) {
    logger.warn({
      msg: 'Failed to create notification (non-fatal)',
      error: err instanceof Error ? err.message : String(err),
      type: input.type,
      userId: input.userId,
    });
  }
}

export async function getUserNotifications(
  userId: string,
  options: { page?: number; limit?: number } = {}
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const skip = (page - 1) * limit;

  try {
    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  } catch (err) {
    if (isNotificationsTableMissing(err)) {
      logNotificationsDegraded('getUserNotifications', err);
      return { items: [], total: 0, page, limit, totalPages: 1 };
    }
    throw err;
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  try {
    return await prisma.notification.count({
      where: { userId, isRead: false },
    });
  } catch (err) {
    if (isNotificationsTableMissing(err)) {
      logNotificationsDegraded('getUnreadCount', err);
      return 0;
    }
    throw err;
  }
}

export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  try {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    return result.count > 0;
  } catch (err) {
    if (isNotificationsTableMissing(err)) {
      logNotificationsDegraded('markAsRead', err);
      return true;
    }
    throw err;
  }
}

export async function markAllAsRead(userId: string): Promise<number> {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  } catch (err) {
    if (isNotificationsTableMissing(err)) {
      logNotificationsDegraded('markAllAsRead', err);
      return 0;
    }
    throw err;
  }
}

export async function deleteNotification(notificationId: string, userId: string): Promise<boolean> {
  try {
    const result = await prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
    return result.count > 0;
  } catch (err) {
    if (isNotificationsTableMissing(err)) {
      logNotificationsDegraded('deleteNotification', err);
      return true;
    }
    return false;
  }
}
