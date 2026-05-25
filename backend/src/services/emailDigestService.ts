import { prisma } from '../lib/prisma';
import { sendTransactionalEmail } from './emailService';
import { logger } from '../utils/logger';
import { escapeHtmlAttribute, escapeHtmlText, wrapDigestHtml } from '../lib/emailHtml';
import { getPublicSiteUrl } from '../lib/sesConfig';

export type DigestRunResult = {
  scanned: number;
  sent: number;
  skippedNoContent: number;
  skippedRateLimited: number;
  failed: number;
};

type DigestRunOptions = {
  maxUsers?: number;
  dryRun?: boolean;
};

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getBaseUrl(): string {
  return getPublicSiteUrl();
}

function buildDigestEmailHtml(params: {
  firstName: string;
  unreadCount: number;
  posts: Array<{ title: string; communityName: string; communitySlug: string; postId: string }>;
  baseUrl: string;
}): { subject: string; textBody: string; htmlBody: string } {
  const { firstName, unreadCount, posts, baseUrl } = params;
  const subject = `Your OrthoAndSpineTools summary: ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`;

  const postLines = posts.map(
    (p, i) => `${i + 1}. ${p.title} (${p.communityName}) — ${baseUrl}/post/${p.postId}`
  );

  const textBody = [
    `Hi ${firstName},`,
    '',
    `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}.`,
    posts.length > 0 ? 'Recent posts from communities you follow:' : 'No new followed-community posts in this period.',
    ...postLines,
    '',
    `Open your notifications: ${baseUrl}/`,
  ].join('\n');

  const safeName = escapeHtmlText(firstName);
  const preferencesUrl = `${baseUrl}/profile/settings`;
  const postItemsHtml = posts
    .map((p) => {
      const href = escapeHtmlAttribute(`${baseUrl}/post/${p.postId}`);
      const title = escapeHtmlText(p.title);
      const community = escapeHtmlText(p.communityName);
      return `<li><a href="${href}" style="color:#2563eb;">${title}</a> <span style="color:#666">(${community})</span></li>`;
    })
    .join('');

  const inner = `<p>Hi ${safeName},</p>
<p>You have <strong>${unreadCount}</strong> unread notification${unreadCount === 1 ? '' : 's'}.</p>
${posts.length > 0 ? `<p>Recent posts from communities you follow:</p><ul>${postItemsHtml}</ul>` : '<p>No new followed-community posts in this period.</p>'}
<p><a href="${escapeHtmlAttribute(`${baseUrl}/`)}" style="color:#2563eb;">Open OrthoAndSpineTools</a></p>`;

  const htmlBody = wrapDigestHtml(inner, preferencesUrl);
  const textBodyWithPrefs = [
    ...textBody.split('\n'),
    '',
    `Manage email preferences: ${preferencesUrl}`,
  ].join('\n');

  return { subject, textBody: textBodyWithPrefs, htmlBody };
}

async function latestDigestSentAt(userId: string): Promise<Date | null> {
  const row = await prisma.auditLog.findFirst({
    where: {
      userId,
      action: 'EMAIL_DIGEST_SENT',
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

export async function runNotificationDigest(options: DigestRunOptions = {}): Promise<DigestRunResult> {
  const enabled = (process.env.EMAIL_DIGEST_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    logger.info('Email digest run skipped (disabled)');
    return { scanned: 0, sent: 0, skippedNoContent: 0, skippedRateLimited: 0, failed: 0 };
  }

  const minHoursBetweenSends = parseIntEnv('EMAIL_DIGEST_MIN_HOURS', 96);
  const lookbackHours = parseIntEnv('EMAIL_DIGEST_LOOKBACK_HOURS', 168);
  const maxUsersPerRun = options.maxUsers ?? parseIntEnv('EMAIL_DIGEST_MAX_USERS_PER_RUN', 200);
  const maxPostsPerEmail = parseIntEnv('EMAIL_DIGEST_MAX_POSTS_PER_EMAIL', 5);
  const lookbackStart = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const minResendMs = minHoursBetweenSends * 60 * 60 * 1000;
  const baseUrl = getBaseUrl();

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      isEmailVerified: true,
      emailDigestEnabled: true,
      communities: { some: {} },
    },
    take: maxUsersPerRun,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      firstName: true,
      communities: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  const result: DigestRunResult = {
    scanned: users.length,
    sent: 0,
    skippedNoContent: 0,
    skippedRateLimited: 0,
    failed: 0,
  };

  for (const user of users) {
    const lastSentAt = await latestDigestSentAt(user.id);
    if (lastSentAt && Date.now() - lastSentAt.getTime() < minResendMs) {
      result.skippedRateLimited += 1;
      continue;
    }

    const followedIds = user.communities.map((c) => c.id);
    if (followedIds.length === 0) {
      result.skippedNoContent += 1;
      continue;
    }

    const [unreadCount, recentPosts] = await Promise.all([
      prisma.notification.count({
        where: { userId: user.id, isRead: false },
      }),
      prisma.post.findMany({
        where: {
          isDeleted: false,
          communityId: { in: followedIds },
          createdAt: { gte: lookbackStart },
        },
        orderBy: { createdAt: 'desc' },
        take: maxPostsPerEmail,
        select: {
          id: true,
          title: true,
          community: { select: { name: true, slug: true } },
        },
      }),
    ]);

    if (unreadCount === 0 && recentPosts.length === 0) {
      result.skippedNoContent += 1;
      continue;
    }

    const digestEmail = buildDigestEmailHtml({
      firstName: user.firstName || 'there',
      unreadCount,
      posts: recentPosts.map((p) => ({
        title: p.title,
        communityName: p.community.name,
        communitySlug: p.community.slug,
        postId: p.id,
      })),
      baseUrl,
    });

    if (options.dryRun) {
      result.sent += 1;
      continue;
    }

    const sendResult = await sendTransactionalEmail({
      to: user.email,
      subject: digestEmail.subject,
      textBody: digestEmail.textBody,
      htmlBody: digestEmail.htmlBody,
      kind: 'digest',
    });

    if (!sendResult.ok) {
      result.failed += 1;
      continue;
    }

    result.sent += 1;
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'EMAIL_DIGEST_SENT',
        resource: 'user',
        resourceId: user.id,
        details: {
          unreadCount,
          postCount: recentPosts.length,
          messageId: sendResult.messageId,
          lookbackHours,
        },
      },
    });
  }

  logger.info('Email digest run completed', result);
  return result;
}
