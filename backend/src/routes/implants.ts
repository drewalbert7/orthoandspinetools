import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { authenticate, optionalAuth, type AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getPublicSiteUrl } from '../lib/sesConfig';
import {
  PUBLIC_IMPLANT_STATUSES,
  buildImplantMarkdown,
  buildImplantSearchText,
  searchImplantIds,
  slugifyImplant,
} from '../lib/implantSearch';
import { logger } from '../utils/logger';

const router = Router();

const listLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many implant directory requests' },
});

const detailLimiter = rateLimit({
  windowMs: 60_000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many implant profile requests' },
});

const reviewLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many review submissions. Try again later.' },
});

const ingestLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Ingest rate limit exceeded' },
});

function resolveIngestSecret(): string | null {
  return (
    process.env.IMPLANT_INGEST_SECRET?.trim() ||
    process.env.MAUDE_CRON_SECRET?.trim() ||
    process.env.EMAIL_DIGEST_CRON_SECRET?.trim() ||
    null
  );
}

function requireIngestAuth(req: AuthRequest): string {
  const configured = resolveIngestSecret();
  if (!configured) {
    throw new AppError('Implant ingest secret is not configured', 503);
  }
  const provided = req.get('x-implant-ingest-secret')?.trim();
  if (!provided || provided !== configured) {
    throw new AppError('Invalid implant ingest secret', 403);
  }
  return 'ingest:grokbot';
}

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
  seoTitle?: string | null;
  seoDescription?: string | null;
  status: string;
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
    seoTitle: implant.seoTitle ?? null,
    seoDescription: implant.seoDescription ?? null,
    status: implant.status,
    maudeBrandKey: implant.maudeBrandKey,
    reviewCount: implant._count.reviews,
    productImage: product ? { url: product.url, alt: product.alt } : null,
    xrayImage: xray ? { url: xray.url, alt: xray.alt } : null,
    markdownPath: `/implants/${implant.slug}.md`,
  };
}

async function refreshSearchText(implantId: string) {
  const implant = await prisma.implant.findUnique({
    where: { id: implantId },
    include: { aliases: true },
  });
  if (!implant) return;
  const searchText = buildImplantSearchText({
    brandName: implant.brandName,
    systemName: implant.systemName,
    company: implant.company,
    specialty: implant.specialty,
    anatomy: implant.anatomy,
    deviceClass: implant.deviceClass,
    description: implant.description,
    longDescription: implant.longDescription,
    maudeBrandKey: implant.maudeBrandKey,
    aliases: implant.aliases.map((a) => a.alias),
  });
  await prisma.implant.update({
    where: { id: implantId },
    data: { searchText },
  });
}

/** Public directory list (paginated + searchable) */
router.get(
  '/',
  listLimiter,
  [
    query('q').optional().isString().isLength({ max: 120 }),
    query('specialty').optional().isString().isLength({ max: 64 }),
    query('deviceClass').optional().isString().isLength({ max: 64 }),
    query('page').optional().isInt({ min: 1, max: 1000 }),
    query('pageSize').optional().isInt({ min: 1, max: 100 }),
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
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(
        1,
        parseInt(String(req.query.pageSize || req.query.limit || '24'), 10) || 24
      )
    );
    const offset = (page - 1) * pageSize;

    const { ids, total } = await searchImplantIds({
      q,
      specialty,
      deviceClass,
      statusIn: [...PUBLIC_IMPLANT_STATUSES],
      limit: pageSize,
      offset,
    });

    const implants =
      ids.length === 0
        ? []
        : await prisma.implant.findMany({
            where: { id: { in: ids } },
            include: {
              images: { orderBy: { sortOrder: 'asc' } },
              _count: { select: { reviews: true } },
            },
          });

    const byId = new Map(implants.map((i) => [i.id, i]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof implants;

    res.json({
      success: true,
      data: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        count: ordered.length,
        implants: ordered.map(publicImplantCard),
      },
    });
  })
);

/** Grokbot / admin ingest upsert — registered before /:slug */
router.post(
  '/ingest',
  ingestLimiter,
  [
    body('slug').optional().isString().isLength({ min: 1, max: 120 }),
    body('brandName').isString().isLength({ min: 1, max: 200 }),
    body('systemName').optional({ nullable: true }).isString().isLength({ max: 300 }),
    body('company').optional({ nullable: true }).isString().isLength({ max: 200 }),
    body('specialty').optional().isString().isLength({ max: 64 }),
    body('anatomy').optional({ nullable: true }).isString().isLength({ max: 64 }),
    body('deviceClass').isString().isLength({ min: 1, max: 64 }),
    body('description').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('longDescription').optional({ nullable: true }).isString().isLength({ max: 20000 }),
    body('indications').optional({ nullable: true }).isString().isLength({ max: 10000 }),
    body('contraindications').optional({ nullable: true }).isString().isLength({ max: 10000 }),
    body('seoTitle').optional({ nullable: true }).isString().isLength({ max: 120 }),
    body('seoDescription').optional({ nullable: true }).isString().isLength({ max: 200 }),
    body('maudeBrandKey').optional({ nullable: true }).isString().isLength({ max: 200 }),
    body('status').optional().isIn(['draft', 'published', 'verified']),
    body('aliases').optional().isArray({ max: 40 }),
    body('images').optional().isArray({ max: 20 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Invalid ingest payload', 400);
    }
    const actor = requireIngestAuth(req);

    const brandName = String(req.body.brandName).trim();
    const slug =
      (typeof req.body.slug === 'string' && req.body.slug.trim()
        ? slugifyImplant(req.body.slug)
        : slugifyImplant(brandName)) || slugifyImplant(`implant-${Date.now()}`);

    const status = (req.body.status as string) || 'draft';
    const aliases: string[] = Array.isArray(req.body.aliases)
      ? req.body.aliases.map((a: unknown) => String(a).trim()).filter(Boolean).slice(0, 40)
      : [];

    type ImageIn = {
      kind?: string;
      url?: string;
      alt?: string;
      attribution?: string;
      licenseNote?: string;
      sortOrder?: number;
    };
    const imagesIn: ImageIn[] = Array.isArray(req.body.images) ? req.body.images : [];
    for (const img of imagesIn) {
      const kind = String(img.kind || '');
      const url = String(img.url || '').trim();
      if (!url || !['product', 'xray', 'diagram'].includes(kind)) {
        throw new AppError('Each image needs kind (product|xray|diagram) and url', 400);
      }
      if ((kind === 'product' || kind === 'xray') && !String(img.licenseNote || '').trim()) {
        throw new AppError('product/xray images require licenseNote', 400);
      }
    }

    const existing = await prisma.implant.findUnique({ where: { slug } });
    const searchText = buildImplantSearchText({
      brandName,
      systemName: req.body.systemName,
      company: req.body.company,
      specialty: req.body.specialty || 'spine',
      anatomy: req.body.anatomy,
      deviceClass: req.body.deviceClass,
      description: req.body.description,
      longDescription: req.body.longDescription,
      maudeBrandKey: req.body.maudeBrandKey,
      aliases,
    });

    const baseData = {
      brandName,
      systemName: req.body.systemName?.trim() || null,
      company: req.body.company?.trim() || null,
      specialty: (req.body.specialty || 'spine').trim(),
      anatomy: req.body.anatomy?.trim() || null,
      deviceClass: String(req.body.deviceClass).trim(),
      description: req.body.description?.trim() || null,
      longDescription: req.body.longDescription?.trim() || null,
      indications: req.body.indications?.trim() || null,
      contraindications: req.body.contraindications?.trim() || null,
      seoTitle:
        req.body.seoTitle?.trim() ||
        `${brandName} implant — OrthoAndSpineTools Directory`,
      seoDescription:
        req.body.seoDescription?.trim() ||
        (req.body.description || `${brandName} orthopedic implant profile`).slice(0, 160),
      maudeBrandKey: req.body.maudeBrandKey?.trim() || null,
      status,
      searchText,
      publishedAt:
        status === 'draft'
          ? existing?.publishedAt ?? null
          : existing?.publishedAt ?? new Date(),
    };

    const implant = await prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.implant.update({ where: { slug }, data: baseData })
        : await tx.implant.create({ data: { slug, ...baseData } });

      if (aliases.length) {
        await tx.implantAlias.deleteMany({ where: { implantId: row.id } });
        await tx.implantAlias.createMany({
          data: aliases.map((alias) => ({ implantId: row.id, alias })),
          skipDuplicates: true,
        });
      }

      if (imagesIn.length) {
        await tx.implantImage.deleteMany({ where: { implantId: row.id } });
        await tx.implantImage.createMany({
          data: imagesIn.map((img, idx) => ({
            implantId: row.id,
            kind: String(img.kind),
            url: String(img.url).trim(),
            alt: img.alt?.trim() || null,
            attribution: img.attribution?.trim() || null,
            licenseNote: img.licenseNote?.trim() || null,
            sortOrder: typeof img.sortOrder === 'number' ? img.sortOrder : idx,
          })),
        });
      }

      await tx.implantEditLog.create({
        data: {
          implantId: row.id,
          actor,
          action: existing ? 'upsert' : 'create',
          detail: JSON.stringify({
            status,
            aliases: aliases.length,
            images: imagesIn.length,
          }),
        },
      });

      return row;
    });

    await refreshSearchText(implant.id);
    logger.info('Implant ingest upsert', { slug: implant.slug, status: implant.status, actor });

    res.status(existing ? 200 : 201).json({
      success: true,
      data: {
        id: implant.id,
        slug: implant.slug,
        status: implant.status,
        htmlPath: `/implants/${implant.slug}`,
        markdownPath: `/implants/${implant.slug}.md`,
      },
    });
  })
);

/** Markdown twin for AI SEO / citation */
router.get(
  '/:slug/markdown',
  detailLimiter,
  [param('slug').isString().isLength({ min: 1, max: 120 })],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const slug = String(req.params.slug || '').replace(/\.md$/i, '');
    const implant = await prisma.implant.findFirst({
      where: { slug, status: { in: [...PUBLIC_IMPLANT_STATUSES] } },
      include: { aliases: true },
    });
    if (!implant) {
      throw new AppError('Implant not found', 404);
    }

    const md = buildImplantMarkdown({
      origin: getPublicSiteUrl(),
      implant: {
        slug: implant.slug,
        brandName: implant.brandName,
        systemName: implant.systemName,
        company: implant.company,
        specialty: implant.specialty,
        anatomy: implant.anatomy,
        deviceClass: implant.deviceClass,
        description: implant.description,
        longDescription: implant.longDescription,
        indications: implant.indications,
        contraindications: implant.contraindications,
        maudeBrandKey: implant.maudeBrandKey,
        aliases: implant.aliases.map((a) => a.alias),
        updatedAt: implant.updatedAt,
      },
    });

    res
      .type('text/markdown; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
      .send(md);
  })
);

/** Public profile; reviews only when authenticated */
router.get(
  '/:slug',
  detailLimiter,
  optionalAuth,
  [param('slug').isString().isLength({ min: 1, max: 120 })],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const slug = String(req.params.slug || '').replace(/\.md$/i, '');
    const implant = await prisma.implant.findFirst({
      where: {
        slug,
        status: { in: [...PUBLIC_IMPLANT_STATUSES] },
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
        longDescription: implant.longDescription,
        indications: implant.indications,
        contraindications: implant.contraindications,
        aliases: implant.aliases.map((a) => a.alias),
        images: implant.images.map((i) => ({
          kind: i.kind,
          url: i.url,
          alt: i.alt,
          attribution: i.attribution,
          licenseNote: i.licenseNote,
        })),
        reviews,
        reviewsLocked: !req.user,
        canonicalPath: `/implants/${implant.slug}`,
        markdownPath: `/implants/${implant.slug}.md`,
      },
    });
  })
);

/** Members-only: create or update own review */
router.post(
  '/:slug/reviews',
  reviewLimiter,
  authenticate,
  [
    param('slug').isString().isLength({ min: 1, max: 120 }),
    body('rating').isInt({ min: 1, max: 5 }),
    body('title').optional({ nullable: true }).isString().isLength({ max: 160 }),
    body('body').isString().isLength({ min: 20, max: 8000 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Invalid review payload (min 20 characters)', 400);
    }
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const slug = String(req.params.slug || '');
    const implant = await prisma.implant.findFirst({
      where: { slug, status: { in: [...PUBLIC_IMPLANT_STATUSES] } },
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

/** Promote draft → published|verified (ingest secret) */
router.post(
  '/:slug/publish',
  ingestLimiter,
  [
    param('slug').isString().isLength({ min: 1, max: 120 }),
    body('status').optional().isIn(['published', 'verified']),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const actor = requireIngestAuth(req);
    const slug = String(req.params.slug || '');
    const nextStatus = (req.body.status as string) || 'published';

    const implant = await prisma.implant.findUnique({ where: { slug } });
    if (!implant) {
      throw new AppError('Implant not found', 404);
    }

    const updated = await prisma.implant.update({
      where: { slug },
      data: {
        status: nextStatus,
        publishedAt: implant.publishedAt ?? new Date(),
      },
    });

    await prisma.implantEditLog.create({
      data: {
        implantId: updated.id,
        actor,
        action: 'publish',
        detail: JSON.stringify({ from: implant.status, to: nextStatus }),
      },
    });

    res.json({
      success: true,
      data: {
        slug: updated.slug,
        status: updated.status,
        htmlPath: `/implants/${updated.slug}`,
        markdownPath: `/implants/${updated.slug}.md`,
      },
    });
  })
);

export default router;
