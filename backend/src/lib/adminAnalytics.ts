import { prisma } from './prisma';

type DailyRow = { day: Date; views: number };

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysAgoUtc(days: number): Date {
  const d = startOfUtcDay(new Date());
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

async function countViewsSince(since: Date): Promise<number> {
  return prisma.analyticsPageView.count({ where: { createdAt: { gte: since } } });
}

async function countUniqueVisitorsSince(since: Date): Promise<number> {
  const rows = await prisma.analyticsPageView.findMany({
    where: { createdAt: { gte: since } },
    distinct: ['visitorHash'],
    select: { visitorHash: true },
  });
  return rows.length;
}

async function countPathViewsSince(path: string, since: Date): Promise<number> {
  return prisma.analyticsPageView.count({
    where: {
      path,
      createdAt: { gte: since },
    },
  });
}

async function topPagesSince(since: Date, limit = 10) {
  const grouped = await prisma.analyticsPageView.groupBy({
    by: ['path'],
    where: { createdAt: { gte: since } },
    _count: { path: true },
    orderBy: { _count: { path: 'desc' } },
    take: limit,
  });
  return grouped.map((row) => ({ path: row.path, views: row._count.path }));
}

async function dailyPageViews(days: number) {
  const since = daysAgoUtc(days - 1);
  const rows = await prisma.$queryRaw<DailyRow[]>`
    SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS views
    FROM analytics_page_views
    WHERE created_at >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const byDay = new Map<string, number>();
  for (const row of rows) {
    const key = startOfUtcDay(new Date(row.day)).toISOString().slice(0, 10);
    byDay.set(key, Number(row.views) || 0);
  }

  const series: Array<{ date: string; views: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgoUtc(i);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, views: byDay.get(key) ?? 0 });
  }
  return series;
}

export async function buildTrafficAnalytics() {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const weekStart = daysAgoUtc(6);
  const monthStart = daysAgoUtc(29);

  const [
    pageViewsToday,
    pageViewsWeek,
    pageViewsMonth,
    uniqueVisitorsToday,
    uniqueVisitorsWeek,
    uniqueVisitorsMonth,
    startupsPageViewsWeek,
    topPagesWeek,
    dailyViews,
    loggedInViewsWeek,
  ] = await Promise.all([
    countViewsSince(todayStart),
    countViewsSince(weekStart),
    countViewsSince(monthStart),
    countUniqueVisitorsSince(todayStart),
    countUniqueVisitorsSince(weekStart),
    countUniqueVisitorsSince(monthStart),
    countPathViewsSince('/startups', weekStart),
    topPagesSince(weekStart, 10),
    dailyPageViews(14),
    prisma.analyticsPageView.count({
      where: {
        createdAt: { gte: weekStart },
        userId: { not: null },
      },
    }),
  ]);

  return {
    pageViewsToday,
    pageViewsWeek,
    pageViewsMonth,
    uniqueVisitorsToday,
    uniqueVisitorsWeek,
    uniqueVisitorsMonth,
    startupsPageViewsWeek,
    loggedInViewsWeek,
    topPagesWeek,
    dailyPageViews: dailyViews,
    trackingSince: (
      await prisma.analyticsPageView.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      })
    )?.createdAt?.toISOString(),
  };
}
