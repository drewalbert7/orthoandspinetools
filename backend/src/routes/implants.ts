import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { authenticate, optionalAuth, type AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

function publicImplantCard(implant: {
  id: string;
  slug: string;
  brandName: string;
  systemName: string | null;
  company: string | null;
  specialty: string;
  anatomy: string | null;
  deviceClass: string;
  description: string | null;
  maudeBrandKey: string | null;
  images: Array<{ kind: string; url: string; alt: string | null; sortOrder: number }>;
  _count: { reviews: number };
}) {
  const sortedImages = [...implant.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const product =
    sortedImages.find((i) => i.kind === 'product') || sortedImages[0] || null;
  const xray = sortedImages.find((i) => i.kind === 'xray') || null;
  return {
    id: implant.id,
    slug: implant.slug,
    brandName: implant.brandName,
    systemName: implant.systemName,
    company: implant.company,
    specialty: implant.specialty,
    anatomy: implant.anatomy,
    deviceClass: implant.deviceClass,
    description: implant.description,
    maudeBrandKey: implant.maudeBrandKey,
    reviewCount: implant._count.reviews,
    productImage: product
      ? { url: product.url, alt: product.alt }
      : null,
    xrayImage: xray ? { url: xray.url, alt: xray.alt } : null,
  };
}

/** Public directory list */
router.get(
  '/',
  [
    query('q').optional().isString().isLength({ max: 120 }),
    query('specialty').optional().isString().isLength({ max: 64 }),
    query('deviceClass').optional().isString().isLength({ max: 64 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Invalid query', 400);
    }

    const q = String(req.query.q || '').trim();
    const specialty = String(req.query.specialty || '').trim();
    const deviceClass = String(req.query.deviceClass || '').trim();
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));

    const implants = await prisma.implant.findMany({
      where: {
        status: { in: ['published', 'verified'] },
        ...(specialty ? { specialty } : {}),
        ...(deviceClass ? { deviceClass } : {}),
        ...(q
          ? {
              OR: [
                { brandName: { contains: q, mode: 'insensitive' } },
                { systemName: { contains: q, mode: 'insensitive' } },
                { company: { contains: q, mode: 'insensitive' } },
                { aliases: { some: { alias: { contains: q, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { reviews: true } },
      },
      orderBy: [{ brandName: 'asc' }],
      take: limit,
    });

    res.json({
      success: true,
      data: {
        count: implants.length,
        implants: implants.map(publicImplantCard),
      },
    });
  })
);

/** Public profile; reviews only when authenticated */
router.get(
  '/:slug',
  optionalAuth,
  [param('slug').isString().isLength({ min: 1, max: 120 })],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const slug = String(req.params.slug || '');
    const implant = await prisma.implant.findFirst({
      where: {
        slug,
        status: { in: ['published', 'verified'] },
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        aliases: true,
        _count: { select: { reviews: true } },
      },
    });

    if (!implant) {
      throw new AppError('Implant not found', 404);
    }

    const card = publicImplantCard(implant);
    let reviews: Array<{
      id: string;
      rating: number;
      title: string | null;
      body: string;
      createdAt: string;
      author: { username: string; firstName: string; lastName: string };
    }> | null = null;

    if (req.user) {
      const rows = await prisma.implantReview.findMany({
        where: { implantId: implant.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: { select: { username: true, firstName: true, lastName: true } },
        },
      });
      reviews = rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        author: r.user,
      }));
    }

    res.json({
      success: true,
      data: {
        ...card,
        aliases: implant.aliases.map((a) => a.alias),
        images: implant.images.map((i) => ({
          kind: i.kind,
          url: i.url,
          alt: i.alt,
          attribution: i.attribution,
        })),
        reviews, // null when anonymous — members-only
        reviewsLocked: !req.user,
      },
    });
  })
);

/** Members-only: create or update own review */
router.post(
  '/:slug/reviews',
  authenticate,
  [
    param('slug').isString().isLength({ min: 1, max: 120 }),
    body('rating').isInt({ min: 1, max: 5 }),
    body('title').optional({ nullable: true }).isString().isLength({ max: 160 }),
    body('body').isString().isLength({ min: 1, max: 8000 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Invalid review payload', 400);
    }
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const slug = String(req.params.slug || '');
    const implant = await prisma.implant.findFirst({
      where: { slug, status: { in: ['published', 'verified'] } },
      select: { id: true },
    });
    if (!implant) {
      throw new AppError('Implant not found', 404);
    }

    const rating = Number(req.body.rating);
    const title =
      typeof req.body.title === 'string' && req.body.title.trim()
        ? req.body.title.trim().slice(0, 160)
        : null;
    const bodyText = String(req.body.body || '').trim();
    if (!bodyText) {
      throw new AppError('Review body is required', 400);
    }

    const review = await prisma.implantReview.upsert({
      where: {
        implantId_userId: { implantId: implant.id, userId: req.user.id },
      },
      create: {
        implantId: implant.id,
        userId: req.user.id,
        rating,
        title,
        body: bodyText,
      },
      update: {
        rating,
        title,
        body: bodyText,
      },
      include: {
        user: { select: { username: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: review.id,
        rating: review.rating,
        title: review.title,
        body: review.body,
        createdAt: review.createdAt.toISOString(),
        author: review.user,
      },
    });
  })
);

export default router;
