import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { buildLlmsFullText } from '../lib/buildLlmsFull';

const router = Router();

const postSelect = {
  id: true,
  title: true,
  content: true,
  createdAt: true,
  author: { select: { username: true } },
  community: { select: { slug: true, name: true } },
} as const;

const startupTagFilter = {
  tags: {
    some: {
      tag: {
        OR: [
          { name: { contains: 'startup', mode: 'insensitive' as const } },
          { description: { contains: 'startup', mode: 'insensitive' as const } },
        ],
      },
    },
  },
};

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const [communities, posts, startupPosts, users] = await Promise.all([
      prisma.community.findMany({
        where: { isActive: true },
        select: { slug: true, name: true, description: true },
        orderBy: { name: 'asc' },
      }),
      prisma.post.findMany({
        where: { isDeleted: false },
        select: postSelect,
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.post.findMany({
        where: { isDeleted: false, ...startupTagFilter },
        select: postSelect,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.user.findMany({
        where: {
          isActive: true,
          posts: { some: { isDeleted: false } },
        },
        select: { username: true, firstName: true, lastName: true, specialty: true },
        orderBy: { username: 'asc' },
      }),
    ]);

    res
      .type('text/plain; charset=utf-8')
      .set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
      .send(buildLlmsFullText({ communities, posts, startupPosts, users }));
  })
);

export default router;
