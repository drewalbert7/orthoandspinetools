import { prisma } from './prisma';
import { buildBotAnalytics } from './botAnalytics';
import {
  botFamilyToProduct,
  classifyLlmReferrer,
  LLM_PRODUCT_LABELS,
  productLabel,
  type LlmProductId,
} from './llmReferrer';

type DailyRow = { day: Date; views: number; visitors: number };
type CountryRow = { country: string; n: number };

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysAgoUtc(days: number): Date {
  const d = startOfUtcDay(new Date());
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function isoDay(d: Date): string {
  return startOfUtcDay(d).toISOString().slice(0, 10);
}

function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

async function dailySeries(since: Date): Promise<Array<{ date: string; views: number; visitors: number }>> {
  const rows = await prisma.$queryRaw<DailyRow[]>`
    SELECT date_trunc('day', created_at) AS day,
           COUNT(*)::int AS views,
           COUNT(DISTINCT visitor_hash)::int AS visitors
    FROM analytics_page_views
    WHERE created_at >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  const byDay = new Map(rows.map((r) => [isoDay(new Date(r.day)), r]));
  const out: Array<{ date: string; views: number; visitors: number }> = [];
  const start = startOfUtcDay(since);
  const end = startOfUtcDay(new Date());
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const key = new Date(t).toISOString().slice(0, 10);
    const row = byDay.get(key);
    out.push({
      date: key,
      views: Number(row?.views) || 0,
      visitors: Number(row?.visitors) || 0,
    });
  }
  return out;
}

async function peakInSeries(series: Array<{ date: string; views: number }>) {
  let best: { date: string; views: number } | null = null;
  for (const row of series) {
    if (!best || row.views > best.views) best = row;
  }
  return best && best.views > 0 ? best : null;
}

async function topPathsSince(since: Date | null, limit = 20) {
  const grouped = since
    ? await prisma.analyticsPageView.groupBy({
        by: ['path'],
        where: { createdAt: { gte: since } },
        _count: { path: true },
        orderBy: { _count: { path: 'desc' } },
        take: limit,
      })
    : await prisma.analyticsPageView.groupBy({
        by: ['path'],
        _count: { path: true },
        orderBy: { _count: { path: 'desc' } },
        take: limit,
      });
  return grouped.map((r) => ({ path: r.path, views: r._count.path }));
}

async function topCountries(limit = 20): Promise<Array<{ c: string; n: number }>> {
  const rows = await prisma.$queryRaw<CountryRow[]>`
    SELECT country, COUNT(DISTINCT visitor_hash)::int AS n
    FROM analytics_page_views
    WHERE country IS NOT NULL AND country <> ''
    GROUP BY country
    ORDER BY n DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ c: r.country, n: Number(r.n) || 0 }));
}

async function countCountries(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ c: number }>>`
    SELECT COUNT(DISTINCT country)::int AS c
    FROM analytics_page_views
    WHERE country IS NOT NULL AND country <> ''
  `;
  return Number(rows[0]?.c) || 0;
}

function emptyProductDay(date: string) {
  return {
    date,
    total: 0,
    chatgpt: 0,
    claude: 0,
    perplexity: 0,
    grok: 0,
    gemini: 0,
    copilot: 0,
    meta: 0,
    other_ai: 0,
  };
}

export async function buildPublicSiteStats() {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const weekStart = daysAgoUtc(6);
  const monthStart = daysAgoUtc(29);
  const liveSince = new Date(now.getTime() - 5 * 60_000);

  const first = await prisma.analyticsPageView.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  const launchedAt = first ? isoDay(first.createdAt) : isoDay(now);
  const seriesSince = first ? startOfUtcDay(first.createdAt) : todayStart;

  const [
    pageViews,
    visitors,
    viewsToday,
    views7d,
    views30d,
    visitors7d,
    visitors30d,
    liveNowRows,
    series,
    topPaths,
    countries,
    countryCount,
    bots,
    recentHuman,
    llmReferrers,
    botDailyFamily,
  ] = await Promise.all([
    prisma.analyticsPageView.count(),
    prisma.$queryRaw<Array<{ c: number }>>`SELECT COUNT(DISTINCT visitor_hash)::int AS c FROM analytics_page_views`.then(
      (r) => Number(r[0]?.c) || 0
    ),
    prisma.analyticsPageView.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.analyticsPageView.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.analyticsPageView.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.$queryRaw<Array<{ c: number }>>`
      SELECT COUNT(DISTINCT visitor_hash)::int AS c FROM analytics_page_views WHERE created_at >= ${weekStart}
    `.then((r) => Number(r[0]?.c) || 0),
    prisma.$queryRaw<Array<{ c: number }>>`
      SELECT COUNT(DISTINCT visitor_hash)::int AS c FROM analytics_page_views WHERE created_at >= ${monthStart}
    `.then((r) => Number(r[0]?.c) || 0),
    prisma.$queryRaw<Array<{ c: number }>>`
      SELECT COUNT(DISTINCT visitor_hash)::int AS c FROM analytics_page_views WHERE created_at >= ${liveSince}
    `.then((r) => Number(r[0]?.c) || 0),
    dailySeries(seriesSince),
    topPathsSince(null, 20),
    topCountries(20),
    countCountries(),
    buildBotAnalytics(),
    prisma.analyticsPageView.findMany({
      where: { createdAt: { gte: liveSince } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { path: true, country: true, createdAt: true },
    }),
    prisma.analyticsPageView.findMany({
      where: { referrer: { not: null } },
      select: { referrer: true, createdAt: true },
      take: 50_000,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.analyticsBotDailyFamily.findMany({
      where: { day: { gte: seriesSince } },
    }),
  ]);

  // Enrich bot families with category for product rollup
  const botMeta = await prisma.analyticsBot.findMany({ select: { family: true, category: true } });
  const familyCat = new Map(botMeta.map((b) => [b.family, b.category]));

  const peak = await peakInSeries(series);
  const daysOnAir = series.length || 1;
  const avgViewsPerDay = Math.round((pageViews / daysOnAir) * 10) / 10;

  // LLM human referrers (beacon only)
  type WinKey = '1d' | '7d' | '14d' | '30d' | 'all';
  const llmWindows: Record<
    WinKey,
    { label: string; humans: number; byProduct: Array<{ id: string; label: string; n: number }> }
  > = {
    '1d': { label: 'Today', humans: 0, byProduct: [] },
    '7d': { label: '7 days', humans: 0, byProduct: [] },
    '14d': { label: '14 days', humans: 0, byProduct: [] },
    '30d': { label: '30 days', humans: 0, byProduct: [] },
    all: { label: 'All time', humans: 0, byProduct: [] },
  };
  const winCuts: Array<{ key: WinKey; since: Date | null }> = [
    { key: '1d', since: todayStart },
    { key: '7d', since: weekStart },
    { key: '14d', since: daysAgoUtc(13) },
    { key: '30d', since: monthStart },
    { key: 'all', since: null },
  ];
  const llmCounts: Record<WinKey, Map<string, number>> = {
    '1d': new Map(),
    '7d': new Map(),
    '14d': new Map(),
    '30d': new Map(),
    all: new Map(),
  };

  for (const row of llmReferrers) {
    const product = classifyLlmReferrer(row.referrer);
    if (!product) continue;
    for (const { key, since } of winCuts) {
      if (since && row.createdAt < since) continue;
      llmCounts[key].set(product, (llmCounts[key].get(product) || 0) + 1);
    }
  }
  for (const key of Object.keys(llmCounts) as WinKey[]) {
    const m = llmCounts[key];
    const byProduct = [...m.entries()]
      .map(([id, n]) => ({ id, label: LLM_PRODUCT_LABELS[id as LlmProductId] || id, n }))
      .sort((a, b) => b.n - a.n);
    llmWindows[key] = {
      label: llmWindows[key].label,
      humans: byProduct.reduce((s, r) => s + r.n, 0),
      byProduct,
    };
  }

  // AI bots by product daily series
  const productByDay = new Map<string, ReturnType<typeof emptyProductDay>>();
  for (const row of series) productByDay.set(row.date, emptyProductDay(row.date));
  for (const row of botDailyFamily) {
    const cat = familyCat.get(row.family);
    if (cat !== 'ai_agent' && cat !== 'ai_crawl') continue;
    const date = isoDay(row.day);
    const bucket = productByDay.get(date) || emptyProductDay(date);
    const product = botFamilyToProduct(row.family);
    const key =
      product === 'amazon' || product === 'bytedance' || product === 'commoncrawl'
        ? 'other_ai'
        : product;
    bucket[key] = (bucket[key] || 0) + row.views;
    bucket.total += row.views;
    productByDay.set(date, bucket);
  }
  const productSeries = [...productByDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  // botsByVendor for windows from daily family
  function botsByVendorSince(since: Date | null) {
    const tally = new Map<string, { vendor: string; bots: number; agents: number; crawlers: number }>();
    for (const row of botDailyFamily) {
      if (since && row.day < since) continue;
      const cat = familyCat.get(row.family);
      if (cat !== 'ai_agent' && cat !== 'ai_crawl') continue;
      const vendor = botFamilyToProduct(row.family);
      const cur = tally.get(vendor) || { vendor, bots: 0, agents: 0, crawlers: 0 };
      cur.bots += row.views;
      if (cat === 'ai_agent') cur.agents += row.views;
      else cur.crawlers += row.views;
      tally.set(vendor, cur);
    }
    return [...tally.values()]
      .map((r) => ({ ...r, label: productLabel(r.vendor) }))
      .sort((a, b) => b.bots - a.bots);
  }

  const botWindows = {
    '1d': {
      label: 'Today',
      hits: bots.hitsToday,
      aiAgent: 0,
      aiCrawl: 0,
      botsByVendor: botsByVendorSince(todayStart),
      byCategory: bots.byCategory,
      topFamilies: bots.topFamilies,
    },
    '7d': {
      label: '7 days',
      hits: bots.hits7d,
      aiAgent: bots.aiAgent7d,
      aiCrawl: bots.aiCrawl7d,
      botsByVendor: botsByVendorSince(weekStart),
      byCategory: bots.byCategory,
      topFamilies: bots.topFamilies,
      topAiFamilies: bots.aiFamilies7d,
    },
    '30d': {
      label: '30 days',
      hits: bots.hits7d, // best-effort until we store 30d daily rollup headlines
      aiAgent: bots.aiAgent7d,
      aiCrawl: bots.aiCrawl7d,
      botsByVendor: botsByVendorSince(monthStart),
      byCategory: bots.byCategory,
      topFamilies: bots.topFamilies,
    },
    all: {
      label: 'All time',
      hits: bots.hits,
      aiAgent: bots.byCategory.find((c) => c.category === 'ai_agent')?.views ?? 0,
      aiCrawl: bots.byCategory.find((c) => c.category === 'ai_crawl')?.views ?? 0,
      botsByVendor: botsByVendorSince(null),
      byCategory: bots.byCategory,
      topFamilies: bots.topFamilies,
    },
  };

  // Fix 1d ai from vendor tally
  botWindows['1d'].aiAgent = botWindows['1d'].botsByVendor.reduce((s, r) => s + r.agents, 0);
  botWindows['1d'].aiCrawl = botWindows['1d'].botsByVendor.reduce((s, r) => s + r.crawlers, 0);

  const live = recentHuman.map((r) => ({
    path: r.path,
    ago: formatAgo(now.getTime() - r.createdAt.getTime()),
    c: r.country || '?',
    country: r.country || '?',
  }));

  const llmSeries = series.map((d) => {
    const ps = productByDay.get(d.date);
    return {
      date: d.date,
      aiBots: ps?.total || 0,
      humanFromLlm: 0,
      humans: d.views,
    };
  });
  // Fill humanFromLlm per day from referrer sample (approximate for large histories)
  const llmByDay = new Map<string, number>();
  for (const row of llmReferrers) {
    if (!classifyLlmReferrer(row.referrer)) continue;
    const key = isoDay(row.createdAt);
    llmByDay.set(key, (llmByDay.get(key) || 0) + 1);
  }
  for (const row of llmSeries) {
    row.humanFromLlm = llmByDay.get(row.date) || 0;
  }

  const aiBotsAllTime = (bots.byCategory.find((c) => c.category === 'ai_agent')?.views ?? 0) +
    (bots.byCategory.find((c) => c.category === 'ai_crawl')?.views ?? 0);

  return {
    pageViews,
    visitors,
    viewsToday,
    views7d,
    views30d,
    visitors7d,
    visitors30d,
    peakDay: peak?.views ?? 0,
    peakDayDate: peak?.date ?? null,
    daysOnAir,
    avgViewsPerDay,
    countries: countryCount,
    regions: 0,
    pathCount: topPaths.length,
    launchedAt,
    series,
    topPaths,
    topArticles: [] as Array<{ path: string; views: number }>,
    topCountries: countries,
    live,
    liveNow: liveNowRows,
    geo: countryCount > 0,
    geoDetail: countryCount > 0 ? 'country' : 'none',
    updatedAt: now.toISOString(),
    llm: {
      windows: llmWindows,
      series: llmSeries,
      productSeries,
      products: (Object.keys(LLM_PRODUCT_LABELS) as LlmProductId[]).map((id) => ({
        id,
        label: LLM_PRODUCT_LABELS[id],
      })),
      note: 'AI bots = User-Agent agents/crawlers from access logs. Human-from-LLM = JS beacon pageviews with an LLM chat referrer. Kept separate on purpose.',
      aiBotsAllTime,
      humansFromChatAllTime: llmWindows.all.humans,
    },
    bots: {
      ...bots,
      hitsAll: bots.hits,
      aiAgentAll: bots.byCategory.find((c) => c.category === 'ai_agent')?.views ?? 0,
      aiCrawlAll: bots.byCategory.find((c) => c.category === 'ai_crawl')?.views ?? 0,
      windows: botWindows,
      recent: bots.recent.map((r) => ({
        ...r,
        ago: formatAgo(now.getTime() - new Date(r.at).getTime()),
      })),
    },
  };
}

export async function buildGlobePayload() {
  const now = new Date();
  const liveSince = new Date(now.getTime() - 5 * 60_000);
  const [liveRows, topCountriesList, allTimeViews, first, liveNow] = await Promise.all([
    prisma.analyticsPageView.findMany({
      where: { createdAt: { gte: liveSince } },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: { path: true, country: true, createdAt: true, visitorHash: true },
    }),
    topCountries(20),
    prisma.analyticsPageView.count(),
    prisma.analyticsPageView.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.$queryRaw<Array<{ c: number }>>`
      SELECT COUNT(DISTINCT visitor_hash)::int AS c
      FROM analytics_page_views
      WHERE created_at >= ${liveSince}
    `.then((r) => Number(r[0]?.c) || 0),
  ]);

  const pinMap = new Map<string, { c: string; n: number; ago: number }>();
  for (const row of liveRows) {
    const c = (row.country || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) continue;
    const agoSec = Math.floor((now.getTime() - row.createdAt.getTime()) / 1000);
    const cur = pinMap.get(c);
    if (!cur) pinMap.set(c, { c, n: 1, ago: agoSec });
    else {
      cur.n += 1;
      cur.ago = Math.min(cur.ago, agoSec);
    }
  }

  const feed = liveRows.slice(0, 20).map((r) => ({
    c: r.country || '?',
    country: r.country || '?',
    path: r.path,
    ago: formatAgo(now.getTime() - r.createdAt.getTime()),
    city: '',
    region: '',
  }));

  return {
    at: now.toISOString(),
    live: liveNow,
    liveCountries: pinMap.size,
    liveRegions: 0,
    allTime: {
      views: allTimeViews,
      since: first?.createdAt ? isoDay(first.createdAt) : null,
    },
    topCountries: topCountriesList,
    topRegions: [] as Array<{ c: string; n: number }>,
    moreCountries: Math.max(0, topCountriesList.length > 12 ? topCountriesList.length - 12 : 0),
    feed,
    pins: [...pinMap.values()],
    age: 0,
    geo: topCountriesList.length > 0 || pinMap.size > 0,
    geoDetail: 'country',
  };
}
