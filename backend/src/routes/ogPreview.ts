import { Router, Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import {
  buildCommunityNotFoundShareHtml,
  buildCommunityShareHtml,
  buildNotFoundShareHtml,
  buildPostShareHtml,
  buildUserNotFoundShareHtml,
  buildUserShareHtml,
  siteOriginFromRequest,
  type OgPostPayload,
} from '../lib/postOgPreviewHtml';

const router = Router();

const shareCache = 'public, max-age=120, stale-while-revalidate=300';

router.get(
  '/post/:id',
  [param('id').isString().isLength({ min: 1, max: 128 }).withMessage('Invalid id')],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).type('text/plain').send('Bad request');
      return;
    }

    const { id } = req.params;
    const origin = siteOriginFromRequest(req);

    const post = await prisma.post.findFirst({
      where: { id, isDeleted: false },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        community: {
          select: {
            name: true,
            slug: true,
          },
        },
        attachments: {
          select: {
            mimeType: true,
            optimizedUrl: true,
            cloudinaryUrl: true,
            thumbnailUrl: true,
            path: true,
          },
        },
      },
    });

    if (!post) {
      const html = buildNotFoundShareHtml(origin, id);
      res.status(404).type('html').set('Cache-Control', 'public, max-age=60').send(html);
      return;
    }

    const payload: OgPostPayload = {
      id: post.id,
      title: post.title,
      content: post.content,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: post.author,
      community: post.community,
      attachments: post.attachments,
    };

    const html = buildPostShareHtml(payload, origin);
    res.status(200).type('html').set('Cache-Control', shareCache).send(html);
  })
);

router.get(
  '/community/:slug',
  [param('slug').trim().isLength({ min: 1, max: 64 }).withMessage('Invalid slug')],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).type('text/plain').send('Bad request');
      return;
    }

    const { slug } = req.params;
    const origin = siteOriginFromRequest(req);

    const community = await prisma.community.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
        isActive: true,
      },
      select: {
        name: true,
        slug: true,
        description: true,
        profileImage: true,
        bannerImage: true,
        _count: {
          select: {
            members: true,
            posts: { where: { isDeleted: false } },
          },
        },
      },
    });

    if (!community) {
      const html = buildCommunityNotFoundShareHtml(origin, slug);
      res.status(404).type('html').set('Cache-Control', 'public, max-age=60').send(html);
      return;
    }

    const html = buildCommunityShareHtml(
      {
        name: community.name,
        slug: community.slug,
        description: community.description,
        profileImage: community.profileImage,
        bannerImage: community.bannerImage,
        memberCount: community._count.members,
        postCount: community._count.posts,
      },
      origin
    );
    res.status(200).type('html').set('Cache-Control', shareCache).send(html);
  })
);

router.get(
  '/user/:username',
  [param('username').trim().isLength({ min: 1, max: 64 }).withMessage('Invalid username')],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).type('text/plain').send('Bad request');
      return;
    }

    const { username } = req.params;
    const origin = siteOriginFromRequest(req);

    const user = await prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        isActive: true,
      },
      select: {
        username: true,
        firstName: true,
        lastName: true,
        specialty: true,
        bio: true,
        profileImage: true,
        _count: {
          select: {
            posts: { where: { isDeleted: false } },
            comments: { where: { isDeleted: false } },
          },
        },
      },
    });

    if (!user) {
      const html = buildUserNotFoundShareHtml(origin, username);
      res.status(404).type('html').set('Cache-Control', 'public, max-age=60').send(html);
      return;
    }

    const html = buildUserShareHtml(
      {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        specialty: user.specialty,
        bio: user.bio,
        profileImage: user.profileImage,
        postsCount: user._count.posts,
        commentsCount: user._count.comments,
      },
      origin
    );
    res.status(200).type('html').set('Cache-Control', shareCache).send(html);
  })
);

export default router;
