import { Router, Request, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import {
  buildNotFoundShareHtml,
  buildPostShareHtml,
  siteOriginFromRequest,
  type OgPostPayload,
} from '../lib/postOgPreviewHtml';

const router = Router();

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
    res
      .status(200)
      .type('html')
      .set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300')
      .send(html);
  })
);

export default router;
