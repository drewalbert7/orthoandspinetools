import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { buildSitemapXml, STATIC_SITEMAP_PAGES } from '../lib/buildSitemapXml';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const [communities, posts, users] = await Promise.all([
      prisma.community.findMany({
        select: { slug: true, updatedAt: true },
        orderBy: { name: 'asc' },
      }),
      prisma.post.findMany({
        where: { isDeleted: false },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50000,
      }),
      prisma.user.findMany({
        where: {
          isActive: true,
          posts: { some: { isDeleted: false } },
        },
        select: { username: true, updatedAt: true },
        orderBy: { username: 'asc' },
      }),
    ]);

    const entries = [
      ...STATIC_SITEMAP_PAGES,
      ...communities.map((c) => ({
        path: `/community/${c.slug}`,
        lastmod: c.updatedAt,
        changefreq: 'daily',
        priority: '0.7',
      })),
      ...users.map((u) => ({
        path: `/user/${u.username}`,
        lastmod: u.updatedAt,
        changefreq: 'weekly',
        priority: '0.5',
      })),
      ...posts.map((p) => ({
        path: `/post/${p.id}`,
        lastmod: p.updatedAt,
        changefreq: 'weekly',
        priority: '0.6',
      })),
    ];

    res
      .type('application/xml')
      .set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
      .send(buildSitemapXml(entries));
  })
);

export default router;
