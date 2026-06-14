import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { buildLlmsFullText } from '../lib/buildLlmsFull';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const [communities, posts, users] = await Promise.all([
      prisma.community.findMany({
        where: { isActive: true },
        select: { slug: true, name: true, description: true },
        orderBy: { name: 'asc' },
      }),
      prisma.post.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          title: true,
          createdAt: true,
          author: { select: { username: true } },
          community: { select: { slug: true, name: true } },
        },
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
      .send(buildLlmsFullText({ communities, posts, users }));
  })
);

export default router;
