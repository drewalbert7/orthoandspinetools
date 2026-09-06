import { prisma } from './prisma';
import {
  classifyBot,
  isHeadlineBotCategory,
  type BotCategory,
  type BotClassification,
} from './botClassify';

const RECENT_LIMIT = 40;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysAgoUtc(days: number): Date {
  const d = startOfUtcDay(new Date());
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export type BotHitInput = {
  classification: BotClassification;
  path: string;
  at?: Date;
};

/** Persist one bot hit (family/path/daily/recent). Safe to call from API or log tailer. */
export async function recordBotHit(input: BotHitInput): Promise<void> {
  const { classification, path } = input;
  const at = input.at ?? new Date();
  const day = startOfUtcDay(at);
  const { family, category } = classification;
  const isHeadline = isHeadlineBotCategory(category);
  const isAiAgent = category === 'ai_agent';
  const isAiCrawl = category === 'ai_crawl';

  await prisma.$transaction(async (tx) => {
    await tx.analyticsBot.upsert({
      where: { family },
      create: { family, category, views: 1 },
      update: { category, views: { increment: 1 } },
    });
    await tx.analyticsBotPath.upsert({
      where: { path },
      create: { path, views: 1 },
      update: { views: { increment: 1 } },
    });
    await tx.analyticsBotDailyFamily.upsert({
      where: { day_family: { day, family } },
      create: { day, family, views: 1 },
      update: { views: { increment: 1 } },
    });
    await tx.analyticsBotRecent.create({
      data: { family, category, path, createdAt: at },
    });

    if (isHeadline || isAiAgent || isAiCrawl) {
      await tx.analyticsBotDaily.upsert({
        where: { day },
        create: {
          day,
          views: isHeadline ? 1 : 0,
          aiAgent: isAiAgent ? 1 : 0,
          aiCrawl: isAiCrawl ? 1 : 0,
        },
        update: {
          ...(isHeadline ? { views: { increment: 1 } } : {}),
          ...(isAiAgent ? { aiAgent: { increment: 1 } } : {}),
          ...(isAiCrawl ? { aiCrawl: { increment: 1 } } : {}),
        },
      });
    }
  });

  // Keep recent table bounded
  const overflow = await prisma.analyticsBotRecent.findMany({
    orderBy: { createdAt: 'desc' },
    skip: RECENT_LIMIT,
    select: { id: true },
  });
  if (overflow.length > 0) {
    await prisma.analyticsBotRecent.deleteMany({
      where: { id: { in: overflow.map((r) => r.id) } },
    });
  }
}

/** Batch-record hits during log backfill (fewer round trips). */
export async function recordBotHitsBatch(
  hits: Array<{ family: string; category: BotCategory; path: string; at: Date }>
): Promise<void> {
  if (hits.length === 0) return;

  type AggFamily = { family: string; category: BotCategory; views: number };
  type AggPath = { path: string; views: number };
  type AggDaily = { dayKey: string; day: Date; views: number; aiAgent: number; aiCrawl: number };
  type AggDailyFamily = { dayKey: string; day: Date; family: string; views: number };

  const byFamily = new Map<string, AggFamily>();
  const byPath = new Map<string, AggPath>();
  const byDaily = new Map<string, AggDaily>();
  const byDailyFamily = new Map<string, AggDailyFamily>();
  const recent: typeof hits = [];

  for (const hit of hits) {
    const day = startOfUtcDay(hit.at);
    const dayKey = day.toISOString().slice(0, 10);
    const isHeadline = isHeadlineBotCategory(hit.category);

    const f = byFamily.get(hit.family) || { family: hit.family, category: hit.category, views: 0 };
    f.category = hit.category;
    f.views += 1;
    byFamily.set(hit.family, f);

    const p = byPath.get(hit.path) || { path: hit.path, views: 0 };
    p.views += 1;
    byPath.set(hit.path, p);

    const d = byDaily.get(dayKey) || { dayKey, day, views: 0, aiAgent: 0, aiCrawl: 0 };
    if (isHeadline) d.views += 1;
    if (hit.category === 'ai_agent') d.aiAgent += 1;
    if (hit.category === 'ai_crawl') d.aiCrawl += 1;
    byDaily.set(dayKey, d);

    const dfKey = `${dayKey}|${hit.family}`;
    const df = byDailyFamily.get(dfKey) || { dayKey, day, family: hit.family, views: 0 };
    df.views += 1;
    byDailyFamily.set(dfKey, df);

    recent.push(hit);
  }

  // Upsert aggregates sequentially in chunks to avoid huge transactions
  for (const row of byFamily.values()) {
    await prisma.analyticsBot.upsert({
      where: { family: row.family },
      create: { family: row.family, category: row.category, views: row.views },
      update: { category: row.category, views: { increment: row.views } },
    });
  }
  for (const row of byPath.values()) {
    await prisma.analyticsBotPath.upsert({
      where: { path: row.path },
      create: { path: row.path, views: row.views },
      update: { views: { increment: row.views } },
    });
  }
  for (const row of byDaily.values()) {
    await prisma.analyticsBotDaily.upsert({
      where: { day: row.day },
      create: {
        day: row.day,
        views: row.views,
        aiAgent: row.aiAgent,
        aiCrawl: row.aiCrawl,
      },
      update: {
        views: { increment: row.views },
        aiAgent: { increment: row.aiAgent },
        aiCrawl: { increment: row.aiCrawl },
      },
    });
  }
  for (const row of byDailyFamily.values()) {
    await prisma.analyticsBotDailyFamily.upsert({
      where: { day_family: { day: row.day, family: row.family } },
      create: { day: row.day, family: row.family, views: row.views },
      update: { views: { increment: row.views } },
    });
  }

  const recentSlice = recent.slice(-RECENT_LIMIT);
  if (recentSlice.length > 0) {
    await prisma.analyticsBotRecent.createMany({
      data: recentSlice.map((h) => ({
        family: h.family,
        category: h.category,
        path: h.path,
        createdAt: h.at,
      })),
    });
    const overflow = await prisma.analyticsBotRecent.findMany({
      orderBy: { createdAt: 'desc' },
      skip: RECENT_LIMIT,
      select: { id: true },
    });
    if (overflow.length > 0) {
      await prisma.analyticsBotRecent.deleteMany({
        where: { id: { in: overflow.map((r) => r.id) } },
      });
    }
  }
}

export async function buildBotAnalytics() {
  const todayStart = startOfUtcDay(new Date());
  const weekStart = daysAgoUtc(6);

  const [
    bots,
    paths,
    dailyWeek,
    dailyFamilyWeek,
    recent,
    state,
  ] = await Promise.all([
    prisma.analyticsBot.findMany({ orderBy: { views: 'desc' } }),
    prisma.analyticsBotPath.findMany({ orderBy: { views: 'desc' }, take: 25 }),
    prisma.analyticsBotDaily.findMany({
      where: { day: { gte: weekStart } },
      orderBy: { day: 'asc' },
    }),
    prisma.analyticsBotDailyFamily.findMany({
      where: { day: { gte: weekStart } },
    }),
    prisma.analyticsBotRecent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.analyticsBotState.findUnique({ where: { key: 'log_cursor' } }),
  ]);

  const headlineBots = bots.filter((b) => isHeadlineBotCategory(b.category as BotCategory));
  const hits = headlineBots.reduce((s, b) => s + b.views, 0);

  const todayRow = dailyWeek.find((d) => d.day.getTime() === todayStart.getTime());
  const hitsToday = todayRow?.views ?? 0;
  const hits7d = dailyWeek.reduce((s, d) => s + d.views, 0);
  const aiAgent7d = dailyWeek.reduce((s, d) => s + d.aiAgent, 0);
  const aiCrawl7d = dailyWeek.reduce((s, d) => s + d.aiCrawl, 0);

  const byCategoryMap = new Map<string, number>();
  for (const b of bots) {
    byCategoryMap.set(b.category, (byCategoryMap.get(b.category) || 0) + b.views);
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, views]) => ({ category, views }))
    .sort((a, b) => b.views - a.views);

  const topFamilies = headlineBots.slice(0, 15).map((b) => ({
    family: b.family,
    category: b.category,
    views: b.views,
  }));

  const topPaths = paths.map((p) => ({ path: p.path, views: p.views }));

  const aiFamilyViews = new Map<string, number>();
  for (const row of dailyFamilyWeek) {
    const bot = bots.find((b) => b.family === row.family);
    if (!bot) continue;
    if (bot.category !== 'ai_agent' && bot.category !== 'ai_crawl') continue;
    aiFamilyViews.set(row.family, (aiFamilyViews.get(row.family) || 0) + row.views);
  }
  const aiFamilies7d = [...aiFamilyViews.entries()]
    .map(([family, views]) => {
      const bot = bots.find((b) => b.family === family);
      return { family, category: bot?.category || 'ai_crawl', views };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 12);

  return {
    hits,
    hitsToday,
    hits7d,
    aiAgent7d,
    aiCrawl7d,
    byCategory,
    topFamilies,
    topPaths,
    aiFamilies7d,
    recent: recent.map((r) => ({
      family: r.family,
      category: r.category,
      path: r.path,
      at: r.createdAt.toISOString(),
    })),
    source: state?.backfilledAt
      ? `nginx access log (backfilled ${state.backfilledAt.toISOString()})`
      : 'nginx access log + beacon',
  };
}

export function classifyAndMaybeRecordFromUa(
  userAgent: string | undefined | null
): BotClassification | null {
  return classifyBot(userAgent);
}
