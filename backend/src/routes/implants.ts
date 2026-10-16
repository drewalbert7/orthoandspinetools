import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { authenticate, optionalAuth, type AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorization';
import { prisma } from '../lib/prisma';
import { getPublicSiteUrl } from '../lib/sesConfig';
import {
  PUBLIC_IMPLANT_STATUSES,
  buildImplantMarkdown,
  buildImplantSearchText,
  searchImplantIds,
  slugifyImplant,
} from '../lib/implantSearch';
import {
  IMPLANT_SPECIALTIES,
  isKnownImplantSpecialty,
  normalizeImplantSpecialty,
} from '../lib/implantSpecialties';
import {
  recomputeAllImplantDirectoryScores,
  recomputeImplantDirectoryScore,
} from '../lib/implantDirectoryScore';
import {
  listCountSelect,
  productImageInclude,
  toImplantDetailBase,
  toImplantListCard,
} from '../lib/implantApiCards';
import {
  loadImplantCommentThread,
  mapNewImplantComment,
  talliesForOneComment,
} from '../lib/implantComments';
import {
  getVerifiedImplantCount,
  invalidateVerifiedImplantCountCache,
} from '../lib/implantVerifiedCount';
import { normalizeTechniqueGuideFields } from '../lib/techniqueGuide';
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

const commentLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many implant comments. Try again later.' },
});

const commentVoteLimiter = rateLimit({
  windowMs: 60_000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many votes. Slow down.' },
});

const ingestLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Ingest rate limit exceeded' },
});

/** Dedicated ingest secret only — do not share MAUDE/digest cron secrets. */
function resolveIngestSecret(): string | null {
  const dedicated = process.env.IMPLANT_INGEST_SECRET?.trim();
  return dedicated || null;
}

/** Grokbot secret header, or logged-in platform admin (JWT). */
async function requireIngestOrAdmin(req: AuthRequest): Promise<string> {
  const provided = req.get('x-implant-ingest-secret')?.trim();
  const configured = resolveIngestSecret();
  if (provided && configured && provided === configured) {
    return 'ingest:grokbot';
  }

  if (req.user?.isAdmin) {
    return `admin:${req.user.id}`;
  }

  if (req.user) {
    throw new AppError('Admin privileges required to edit implants', 403);
  }

  if (!configured) {
    throw new AppError('Implant ingest secret is not configured', 503);
  }
  throw new AppError('Invalid implant ingest secret or admin auth required', 403);
}

async function refreshMemberRatingAvg(implantId: string) {
  const agg = await prisma.implantReview.aggregate({
    where: { implantId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.implant.update({
    where: { id: implantId },
    data: {
      memberRatingAvg:
        agg._count._all > 0 && agg._avg.rating != null
          ? Math.round(agg._avg.rating * 10) / 10
          : null,
    },
  });
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
    query('verified').optional().isIn(['1', 'true', '0', 'false']),
    query('sort').optional().isIn(['ai', 'name', 'reviews']),
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
    const specialtyRaw = String(req.query.specialty || '').trim();
    // Return 400 for unknown specialty (not empty or 'all')
    if (specialtyRaw && specialtyRaw !== 'all' && !isKnownImplantSpecialty(specialtyRaw)) {
      throw new AppError(
        `Unknown specialty "${specialtyRaw}". Use one of: all, ${IMPLANT_SPECIALTIES.map((s) => s.id).join(', ')}`,
        400
      );
    }
    const specialty = normalizeImplantSpecialty(specialtyRaw);
    const deviceClass = String(req.query.deviceClass || '').trim();
    const verifiedOnly =
      req.query.verified === '1' || req.query.verified === 'true';
    const sortRaw = String(req.query.sort || 'ai');
    const sort =
      sortRaw === 'name' || sortRaw === 'reviews' ? sortRaw : ('ai' as const);
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(
        1,
        parseInt(String(req.query.pageSize || req.query.limit || '24'), 10) || 24
      )
    );
    const offset = (page - 1) * pageSize;

    const { ids, total, inferredSpecialty } = await searchImplantIds({
      q,
      specialty,
      deviceClass,
      statusIn: verifiedOnly ? ['verified'] : [...PUBLIC_IMPLANT_STATUSES],
      sort,
      limit: pageSize,
      offset,
    });

    const implants =
      ids.length === 0
        ? []
        : await prisma.implant.findMany({
            where: { id: { in: ids } },
            include: {
              images: productImageInclude,
              _count: { select: listCountSelect },
            },
          });

    const byId = new Map(implants.map((i) => [i.id, i]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof implants;
    const verifiedCount = await getVerifiedImplantCount();

    res
      .set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
      .json({
        success: true,
        data: {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          count: ordered.length,
          specialty: specialty || 'all',
          inferredSpecialty: inferredSpecialty || null,
          verifiedCount,
          implants: ordered.map(toImplantListCard),
        },
      });
  })
);

/** Specialty catalog for directory filters (aligned with communities / MAUDE) */
router.get(
  '/meta/specialties',
  listLimiter,
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res
      .set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
      .json({
        success: true,
        data: {
          specialties: [
            { id: 'all', label: 'All specialties' },
            ...IMPLANT_SPECIALTIES.map((s) => ({ id: s.id, label: s.label })),
          ],
        },
      });
  })
);

/** Admin: recompute all Directory Scores (ost-dir-v2 + MAUDE facets). */
router.post(
  '/admin/recompute-scores',
  ingestLimiter,
  authenticate,
  requireAdmin,
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const n = await recomputeAllImplantDirectoryScores();
    logger.info('Admin recomputed implant directory scores', { count: n });
    res.json({ success: true, data: { recomputed: n, version: 'ost-dir-v2' } });
  })
);

/** Admin: draft / unpublished queue (before /:slug). */
router.get(
  '/admin/drafts',
  listLimiter,
  authenticate,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1, max: 1000 }),
    query('pageSize').optional().isInt({ min: 1, max: 100 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new AppError('Invalid query', 400);

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.pageSize || '24'), 10) || 24)
    );
    const where = { status: 'draft' as const };
    const [total, rows] = await Promise.all([
      prisma.implant.count({ where }),
      prisma.implant.findMany({
        where,
        include: {
          images: productImageInclude,
          _count: { select: listCountSelect },
        },
        orderBy: [{ updatedAt: 'desc' }, { brandName: 'asc' }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);

    res
      .set('Cache-Control', 'private, no-store')
      .json({
        success: true,
        data: {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          implants: rows.map(toImplantListCard),
        },
      });
  })
);

/** Grokbot / admin ingest upsert — registered before /:slug */
router.post(
  '/ingest',
  ingestLimiter,
  optionalAuth,
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
    body('techniqueGuideUrl').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('techniqueGuideTitle').optional({ nullable: true }).isString().isLength({ max: 120 }),
    body('aiRating').optional({ nullable: true }).isFloat({ min: 0, max: 10 }),
    body('aiSummary').optional({ nullable: true }).isString().isLength({ max: 500 }),
    body('status').optional().isIn(['draft', 'published', 'verified']),
    body('aliases').optional().isArray({ max: 40 }),
    body('images').optional().isArray({ max: 20 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Invalid ingest payload', 400);
    }
    const actor = await requireIngestOrAdmin(req);

    const brandName = String(req.body.brandName).trim();
    const slug =
      (typeof req.body.slug === 'string' && req.body.slug.trim()
        ? slugifyImplant(req.body.slug)
        : slugifyImplant(brandName)) || slugifyImplant(`implant-${Date.now()}`);

    const status = (req.body.status as string) || 'draft';
    const specialtyRaw = String(req.body.specialty || 'spine').trim();
    if (specialtyRaw && !isKnownImplantSpecialty(specialtyRaw)) {
      throw new AppError(
        `Unknown specialty. Use one of: ${IMPLANT_SPECIALTIES.map((s) => s.id).join(', ')}`,
        400
      );
    }
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
      specialty: specialtyRaw || 'spine',
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
      specialty: specialtyRaw || 'spine',
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
      ...(() => {
        if (
          req.body.techniqueGuideUrl === undefined &&
          req.body.techniqueGuideTitle === undefined
        ) {
          return {
            techniqueGuideUrl: existing?.techniqueGuideUrl ?? null,
            techniqueGuideTitle: existing?.techniqueGuideTitle ?? null,
          };
        }
        try {
          return normalizeTechniqueGuideFields({
            url: req.body.techniqueGuideUrl,
            title: req.body.techniqueGuideTitle,
          });
        } catch (e) {
          throw new AppError((e as Error).message, 400);
        }
      })(),
      status,
      searchText,
      publishedAt:
        status === 'draft'
          ? existing?.publishedAt ?? null
          : existing?.publishedAt ?? new Date(),
      ...(req.body.aiRating !== undefined
        ? {
            aiRating:
              req.body.aiRating === null || req.body.aiRating === ''
                ? null
                : Math.round(Number(req.body.aiRating) * 10) / 10,
            aiRatedAt: new Date(),
          }
        : {}),
      ...(req.body.aiSummary !== undefined
        ? { aiSummary: req.body.aiSummary?.trim() || null }
        : {}),
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
    invalidateVerifiedImplantCountCache();
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
        techniqueGuideUrl: implant.techniqueGuideUrl,
        techniqueGuideTitle: implant.techniqueGuideTitle,
        fdaNumber: implant.fdaNumber,
        fdaDecisionDate: implant.fdaDecisionDate,
        fdaApplicant: implant.fdaApplicant,
        fdaMaterials: implant.fdaMaterials,
        fdaSourceUrl: implant.fdaSourceUrl,
        aiRating: implant.aiRating,
        aiSummary: implant.aiSummary,
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

/** Public profile + public review read; write requires auth */
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
        _count: {
          select: {
            reviews: true,
            comments: { where: { isDeleted: false } },
          },
        },
      },
    });

    if (!implant) {
      throw new AppError('Implant not found', 404);
    }

    const card = toImplantDetailBase(implant);
    const [comments, relatedRows] = await Promise.all([
      loadImplantCommentThread(implant.id, req.user?.id),
      prisma.implant.findMany({
        where: {
          status: { in: [...PUBLIC_IMPLANT_STATUSES] },
          id: { not: implant.id },
          OR: [
            { specialty: implant.specialty },
            { deviceClass: implant.deviceClass },
            ...(implant.company ? [{ company: implant.company }] : []),
          ],
        },
        include: {
          images: productImageInclude,
          _count: { select: listCountSelect },
        },
        orderBy: [{ aiRating: { sort: 'desc', nulls: 'last' } }, { brandName: 'asc' }],
        take: 8,
      }),
    ]);

    // Prefer same specialty, then fill with class/company matches
    const relatedSorted = [...relatedRows].sort((a, b) => {
      const as = a.specialty === implant.specialty ? 0 : 1;
      const bs = b.specialty === implant.specialty ? 0 : 1;
      if (as !== bs) return as - bs;
      return (b.aiRating ?? 0) - (a.aiRating ?? 0);
    });

    if (req.user) {
      res.set('Cache-Control', 'private, no-store');
    } else {
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
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
        comments,
        commentsLocked: !req.user,
        canComment: Boolean(req.user),
        related: relatedSorted.slice(0, 6).map((r) => toImplantListCard(r)),
        /** Legacy empty array — UI uses comments */
        reviews: [] as unknown[],
        reviewsLocked: true,
        canWriteReview: false,
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

    await refreshMemberRatingAvg(implant.id);
    await recomputeImplantDirectoryScore(implant.id).catch(() => {});

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

/** Create implant comment (or reply). Auth required. */
router.post(
  '/:slug/comments',
  commentLimiter,
  authenticate,
  [
    param('slug').isString().isLength({ min: 1, max: 120 }),
    body('body').isString().isLength({ min: 1, max: 5000 }),
    body('parentId').optional({ nullable: true }).isString().isLength({ max: 40 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Invalid comment payload', 400);
    }
    if (!req.user) throw new AppError('Authentication required', 401);

    const slug = String(req.params.slug || '');
    const implant = await prisma.implant.findFirst({
      where: { slug, status: { in: [...PUBLIC_IMPLANT_STATUSES] } },
      select: { id: true },
    });
    if (!implant) throw new AppError('Implant not found', 404);

    const bodyText = String(req.body.body || '').trim();
    if (!bodyText) throw new AppError('Comment cannot be empty', 400);

    let parentId: string | null = null;
    if (req.body.parentId) {
      const parent = await prisma.implantComment.findFirst({
        where: { id: String(req.body.parentId), implantId: implant.id, isDeleted: false },
        select: { id: true, parentId: true },
      });
      if (!parent) throw new AppError('Parent comment not found', 404);
      // Flatten to one reply level under the top-level ancestor
      parentId = parent.parentId ?? parent.id;
    }

    const created = await prisma.implantComment.create({
      data: {
        implantId: implant.id,
        userId: req.user.id,
        parentId,
        body: bodyText,
      },
      include: {
        user: {
          select: { id: true, username: true, firstName: true, lastName: true, specialty: true },
        },
        votes: { select: { userId: true, value: true } },
      },
    });

    await recomputeImplantDirectoryScore(implant.id).catch((err) =>
      logger.warn('Implant score recompute failed after comment', { err })
    );

    res.status(201).json({
      success: true,
      data: mapNewImplantComment(created, req.user.id),
    });
  })
);

/** Upvote / downvote an implant comment (toggle like post comments). */
router.post(
  '/:slug/comments/:commentId/vote',
  commentVoteLimiter,
  authenticate,
  [
    param('slug').isString().isLength({ min: 1, max: 120 }),
    param('commentId').isString().isLength({ min: 1, max: 40 }),
    body('type').isIn(['upvote', 'downvote']),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new AppError('Invalid vote', 400);
    if (!req.user) throw new AppError('Authentication required', 401);

    const slug = String(req.params.slug || '');
    const commentId = String(req.params.commentId || '');
    const value = req.body.type === 'upvote' ? 1 : -1;

    const implant = await prisma.implant.findFirst({
      where: { slug, status: { in: [...PUBLIC_IMPLANT_STATUSES] } },
      select: { id: true },
    });
    if (!implant) throw new AppError('Implant not found', 404);

    const comment = await prisma.implantComment.findFirst({
      where: { id: commentId, implantId: implant.id, isDeleted: false },
      select: { id: true },
    });
    if (!comment) throw new AppError('Comment not found', 404);

    const existing = await prisma.implantCommentVote.findUnique({
      where: { commentId_userId: { commentId, userId: req.user.id } },
    });

    if (existing && existing.value === value) {
      await prisma.implantCommentVote.delete({ where: { id: existing.id } });
    } else if (existing) {
      await prisma.implantCommentVote.update({
        where: { id: existing.id },
        data: { value },
      });
    } else {
      await prisma.implantCommentVote.create({
        data: { commentId, userId: req.user.id, value },
      });
    }

    const tallies = await talliesForOneComment(commentId, req.user.id);
    await recomputeImplantDirectoryScore(implant.id).catch(() => {});

    res.json({
      success: true,
      data: {
        commentId,
        voteScore: tallies.voteScore,
        upvotes: tallies.upvotes,
        downvotes: tallies.downvotes,
        userVote: tallies.userVote,
      },
    });
  })
);

/** Soft-delete own implant comment (or admin). */
router.delete(
  '/:slug/comments/:commentId',
  commentLimiter,
  authenticate,
  [
    param('slug').isString().isLength({ min: 1, max: 120 }),
    param('commentId').isString().isLength({ min: 1, max: 40 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const slug = String(req.params.slug || '');
    const commentId = String(req.params.commentId || '');

    const implant = await prisma.implant.findFirst({
      where: { slug, status: { in: [...PUBLIC_IMPLANT_STATUSES] } },
      select: { id: true },
    });
    if (!implant) throw new AppError('Implant not found', 404);

    const comment = await prisma.implantComment.findFirst({
      where: { id: commentId, implantId: implant.id },
    });
    if (!comment) throw new AppError('Comment not found', 404);
    if (comment.userId !== req.user.id && !req.user.isAdmin) {
      throw new AppError('Not allowed to delete this comment', 403);
    }

    await prisma.implantComment.update({
      where: { id: commentId },
      data: { isDeleted: true, body: '' },
    });
    await recomputeImplantDirectoryScore(implant.id).catch(() => {});

    res.json({ success: true, data: { id: commentId, deleted: true } });
  })
);

/** Promote draft → published|verified (ingest secret or admin JWT) */
router.post(
  '/:slug/publish',
  ingestLimiter,
  optionalAuth,
  [
    param('slug').isString().isLength({ min: 1, max: 120 }),
    body('status').optional().isIn(['published', 'verified']),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const actor = await requireIngestOrAdmin(req);
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
    invalidateVerifiedImplantCountCache();

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

/** Platform admin: partial update of a listing (JWT) */
router.patch(
  '/:slug',
  ingestLimiter,
  authenticate,
  requireAdmin,
  [
    param('slug').isString().isLength({ min: 1, max: 120 }),
    body('brandName').optional().isString().isLength({ min: 1, max: 200 }),
    body('systemName').optional({ nullable: true }).isString().isLength({ max: 300 }),
    body('company').optional({ nullable: true }).isString().isLength({ max: 200 }),
    body('specialty').optional().isString().isLength({ max: 64 }),
    body('anatomy').optional({ nullable: true }).isString().isLength({ max: 64 }),
    body('deviceClass').optional().isString().isLength({ min: 1, max: 64 }),
    body('description').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('longDescription').optional({ nullable: true }).isString().isLength({ max: 20000 }),
    body('indications').optional({ nullable: true }).isString().isLength({ max: 10000 }),
    body('contraindications').optional({ nullable: true }).isString().isLength({ max: 10000 }),
    body('seoTitle').optional({ nullable: true }).isString().isLength({ max: 120 }),
    body('seoDescription').optional({ nullable: true }).isString().isLength({ max: 200 }),
    body('maudeBrandKey').optional({ nullable: true }).isString().isLength({ max: 200 }),
    body('techniqueGuideUrl').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('techniqueGuideTitle').optional({ nullable: true }).isString().isLength({ max: 120 }),
    body('aiRating').optional({ nullable: true }).isFloat({ min: 0, max: 10 }),
    body('aiSummary').optional({ nullable: true }).isString().isLength({ max: 500 }),
    body('status').optional().isIn(['draft', 'published', 'verified']),
    body('aliases').optional().isArray({ max: 40 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Invalid implant update', 400);
    }

    const slug = String(req.params.slug || '');
    const existing = await prisma.implant.findUnique({
      where: { slug },
      include: { aliases: true },
    });
    if (!existing) {
      throw new AppError('Implant not found', 404);
    }

    if (req.body.specialty && !isKnownImplantSpecialty(String(req.body.specialty))) {
      throw new AppError(
        `Unknown specialty. Use one of: ${IMPLANT_SPECIALTIES.map((s) => s.id).join(', ')}`,
        400
      );
    }

    const brandName =
      typeof req.body.brandName === 'string' ? req.body.brandName.trim() : existing.brandName;
    const specialty =
      typeof req.body.specialty === 'string' ? req.body.specialty.trim() : existing.specialty;
    const deviceClass =
      typeof req.body.deviceClass === 'string' ? req.body.deviceClass.trim() : existing.deviceClass;
    const status =
      typeof req.body.status === 'string' ? req.body.status : existing.status;
    const aliases: string[] | undefined = Array.isArray(req.body.aliases)
      ? req.body.aliases.map((a: unknown) => String(a).trim()).filter(Boolean).slice(0, 40)
      : undefined;

    const next = {
      brandName,
      systemName:
        req.body.systemName !== undefined
          ? req.body.systemName?.trim() || null
          : existing.systemName,
      company:
        req.body.company !== undefined ? req.body.company?.trim() || null : existing.company,
      specialty,
      anatomy:
        req.body.anatomy !== undefined ? req.body.anatomy?.trim() || null : existing.anatomy,
      deviceClass,
      description:
        req.body.description !== undefined
          ? req.body.description?.trim() || null
          : existing.description,
      longDescription:
        req.body.longDescription !== undefined
          ? req.body.longDescription?.trim() || null
          : existing.longDescription,
      indications:
        req.body.indications !== undefined
          ? req.body.indications?.trim() || null
          : existing.indications,
      contraindications:
        req.body.contraindications !== undefined
          ? req.body.contraindications?.trim() || null
          : existing.contraindications,
      seoTitle:
        req.body.seoTitle !== undefined ? req.body.seoTitle?.trim() || null : existing.seoTitle,
      seoDescription:
        req.body.seoDescription !== undefined
          ? req.body.seoDescription?.trim() || null
          : existing.seoDescription,
      maudeBrandKey:
        req.body.maudeBrandKey !== undefined
          ? req.body.maudeBrandKey?.trim() || null
          : existing.maudeBrandKey,
      ...(() => {
        if (req.body.techniqueGuideUrl === undefined && req.body.techniqueGuideTitle === undefined) {
          return {
            techniqueGuideUrl: existing.techniqueGuideUrl,
            techniqueGuideTitle: existing.techniqueGuideTitle,
          };
        }
        try {
          return normalizeTechniqueGuideFields({
            url:
              req.body.techniqueGuideUrl !== undefined
                ? req.body.techniqueGuideUrl
                : existing.techniqueGuideUrl,
            title:
              req.body.techniqueGuideTitle !== undefined
                ? req.body.techniqueGuideTitle
                : existing.techniqueGuideTitle,
          });
        } catch (e) {
          throw new AppError((e as Error).message, 400);
        }
      })(),
      status,
      publishedAt:
        status === 'draft'
          ? existing.publishedAt
          : existing.publishedAt ?? new Date(),
      aiRating:
        req.body.aiRating !== undefined
          ? req.body.aiRating === null || req.body.aiRating === ''
            ? null
            : Math.round(Number(req.body.aiRating) * 10) / 10
          : existing.aiRating,
      aiSummary:
        req.body.aiSummary !== undefined
          ? req.body.aiSummary?.trim() || null
          : existing.aiSummary,
      aiRatedAt:
        req.body.aiRating !== undefined || req.body.aiSummary !== undefined
          ? new Date()
          : existing.aiRatedAt,
      // Manual AI rating from admin locks auto-recompute until unlocked
      aiRatingLocked:
        req.body.aiRatingLocked !== undefined
          ? Boolean(req.body.aiRatingLocked)
          : req.body.aiRating !== undefined
            ? true
            : existing.aiRatingLocked,
    };

    const aliasList =
      aliases ?? existing.aliases.map((a) => a.alias);
    const searchText = buildImplantSearchText({
      ...next,
      aliases: aliasList,
    });

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.implant.update({
        where: { slug },
        data: { ...next, searchText },
      });
      if (aliases) {
        await tx.implantAlias.deleteMany({ where: { implantId: row.id } });
        if (aliases.length) {
          await tx.implantAlias.createMany({
            data: aliases.map((alias) => ({ implantId: row.id, alias })),
            skipDuplicates: true,
          });
        }
      }
      await tx.implantEditLog.create({
        data: {
          implantId: row.id,
          actor: `admin:${req.user!.id}`,
          action: 'admin_patch',
          detail: JSON.stringify({ fields: Object.keys(req.body || {}) }),
        },
      });
      return row;
    });

    logger.info('Implant admin patch', { slug: updated.slug, admin: req.user!.id });
    if (req.body.status !== undefined && req.body.status !== existing.status) {
      invalidateVerifiedImplantCountCache();
    }

    // Refresh catalog/community components; respects aiRatingLocked for final score
    const breakdown = await recomputeImplantDirectoryScore(updated.id).catch(
      (): null => null
    );

    res.json({
      success: true,
      data: {
        id: updated.id,
        slug: updated.slug,
        status: updated.status,
        htmlPath: `/implants/${updated.slug}`,
        markdownPath: `/implants/${updated.slug}.md`,
        rating: breakdown,
      },
    });
  })
);

export default router;
