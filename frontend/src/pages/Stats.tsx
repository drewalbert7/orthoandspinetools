import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DocumentMeta } from '../components/DocumentMeta';
import LiveGlobe from '../components/LiveGlobe';
import { apiService, type PublicSiteStats } from '../services/apiService';
import '../styles/statsPage.css';

type RangeKey = '1d' | '7d' | '30d' | 'all';
type ChartMode = 'cumulative' | 'daily';
type ProductRange = '7d' | '14d' | '30d';

const RANGE_LABEL: Record<RangeKey, string> = {
  '1d': 'Today',
  '7d': '7 days',
  '30d': '30 days',
  all: 'All time',
};

const PRODUCT_COLORS: Record<string, string> = {
  chatgpt: '#0a7ea4',
  claude: '#c45c26',
  perplexity: '#2a7ab8',
  grok: '#3a3834',
  gemini: '#b8956c',
  copilot: '#3b82c4',
  meta: '#5b7cfa',
  other_ai: '#8a8070',
};

function fmt(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(Number(n)).toLocaleString('en-US');
}

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

function sliceSeries<T extends { date: string }>(series: T[], range: RangeKey): T[] {
  if (!series?.length) return [];
  if (range === 'all') return series;
  const n = range === '1d' ? 1 : range === '7d' ? 7 : 30;
  return series.slice(-n);
}

function sumVisitors(series: Array<{ visitors?: number }>): number {
  return series.reduce((s, r) => s + (r.visitors || 0), 0);
}

function peakOf(series: Array<{ date: string; views: number }>) {
  return series.reduce<(typeof series)[0] | null>((best, row) => {
    if (!best || row.views > best.views) return row;
    return best;
  }, null);
}

const Stats: React.FC = () => {
  const [range, setRange] = useState<RangeKey>('all');
  const [chartMode, setChartMode] = useState<ChartMode>('cumulative');
  const [productRange, setProductRange] = useState<ProductRange>('7d');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['public-site-stats'],
    queryFn: () => apiService.getPublicStats(),
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const id = 'ost-stats-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap';
    document.head.appendChild(link);
  }, []);

  const series = useMemo(() => sliceSeries(data?.series || [], range), [data?.series, range]);
  const peak = useMemo(() => peakOf(series), [series]);
  const viewsInRange = useMemo(() => {
    if (!data) return 0;
    if (range === '1d') return data.viewsToday;
    if (range === '7d') return data.views7d;
    if (range === '30d') return data.views30d;
    return data.pageViews;
  }, [data, range]);
  const visitorsInRange = useMemo(() => {
    if (!data) return 0;
    if (range === '1d') return sumVisitors(series);
    if (range === '7d') return data.visitors7d;
    if (range === '30d') return data.visitors30d;
    return data.visitors;
  }, [data, range, series]);

  const productSlice = useMemo(() => {
    const all = data?.llm?.productSeries || [];
    const n = productRange === '7d' ? 7 : productRange === '14d' ? 14 : 30;
    return all.slice(-n);
  }, [data?.llm?.productSeries, productRange]);

  const productLeads = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const day of productSlice) {
      for (const key of Object.keys(PRODUCT_COLORS)) {
        totals[key] = (totals[key] || 0) + Number((day as Record<string, number>)[key] || 0);
      }
    }
    const rows = Object.entries(totals)
      .map(([id, n]) => ({
        id,
        label: data?.llm?.products?.find((p) => p.id === id)?.label || id,
        n,
      }))
      .filter((r) => r.n > 0)
      .sort((a, b) => b.n - a.n);
    const sum = rows.reduce((s, r) => s + r.n, 0);
    return { rows, sum, majority: rows[0] || null };
  }, [productSlice, data?.llm?.products]);

  const llmWindow = data?.llm?.windows?.[range === 'all' ? 'all' : range === '1d' ? '1d' : range === '7d' ? '7d' : '30d'];
  const botHeadline = data?.bots;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = chartWrapRef.current;
    if (!canvas || !wrap || !series.length) return;

    const dark = document.documentElement.classList.contains('dark');
    const grid = dark ? 'rgba(10, 126, 164, 0.28)' : 'rgba(10, 126, 164, 0.2)';
    const axis = dark ? 'rgba(232, 228, 220, 0.42)' : 'rgba(17, 17, 17, 0.45)';
    const line = '#0a7ea4';
    const fill = 'rgba(10, 126, 164, 0.14)';
    const height = 220;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(40, wrap.clientWidth - 24);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    let running = 0;
    const values =
      chartMode === 'cumulative'
        ? series.map((d) => {
            running += d.views;
            return running;
          })
        : series.map((d) => d.views);
    const max = Math.max(1, ...values);
    const plotH = height - 40;
    const plotW = width - 54;
    const step = values.length > 1 ? plotW / (values.length - 1) : plotW;
    const baseY = height - 26;

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = axis;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i < 4; i++) {
      const y = 14 + (plotH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(44, y);
      ctx.lineTo(width - 10, y);
      ctx.stroke();
      ctx.fillText(Math.round(max * (1 - i / 3)).toLocaleString('en-US'), 36, y + 4);
    }

    const pts = values.map((v, i) => ({ x: 44 + i * step, y: baseY - (v / max) * plotH }));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, baseY);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(pts[pts.length - 1].x, baseY);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.fillStyle = line;
    ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    if (peak && peak.views > 0) {
      const idx = series.findIndex((d) => d.date === peak.date);
      if (idx >= 0 && pts[idx]) {
        const p = pts[idx];
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = line;
        ctx.moveTo(p.x, 14);
        ctx.lineTo(p.x, baseY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = axis;
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('peak', p.x, Math.max(24, p.y - 10));
      }
    }

    ctx.fillStyle = axis;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    const ticks =
      series.length <= 2 ? [0, series.length - 1] : [0, Math.floor((series.length - 1) / 2), series.length - 1];
    for (const i of ticks) {
      if (pts[i] && series[i]) ctx.fillText(series[i].date.slice(5), pts[i].x, height - 8);
    }
  }, [series, chartMode, peak, dataUpdatedAt]);

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="ost-stats max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <DocumentMeta
        title="Stats"
        description="Public first-party traffic and bot analytics for OrthoAndSpineTools."
        canonicalPath="/stats"
      />

      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="font-stats-mono text-[0.58rem] uppercase tracking-[0.16em] text-[var(--ost-accent)] mb-2">
            refreshes every 20s
            {isFetching ? ' · updating…' : ''}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-stats-serif text-4xl sm:text-5xl tracking-tight text-[var(--ost-ink)]">Stats</h1>
            <span className="inline-flex items-center gap-1.5 font-stats-mono text-[0.62rem] uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              live
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--ost-muted)]">
            Humans from the site beacon · bots and agents from access logs
          </p>
          <p className="mt-1 font-stats-mono text-[0.58rem] uppercase tracking-[0.12em] text-[var(--ost-muted)]">
            Showing {RANGE_LABEL[range]} · updated {updatedLabel}
          </p>
        </div>
        <div className="ost-stats-range" role="group" aria-label="Time range">
          {(['1d', '7d', '30d', 'all'] as RangeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={range === key ? 'on' : ''}
              aria-pressed={range === key}
              onClick={() => setRange(key)}
            >
              {RANGE_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-[var(--ost-muted)] py-16 text-center">Loading traffic…</p>
      ) : isError || !data ? (
        <p className="text-[var(--ost-muted)] py-16 text-center">Stats offline — try again shortly.</p>
      ) : (
        <>
          <section aria-labelledby="ost-humans-heading" className="mb-10">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="ost-humans-heading" className="font-stats-serif text-2xl text-[var(--ost-ink)]">
                Humans
              </h2>
              <p className="text-xs text-[var(--ost-muted)]">Browser pageviews · {RANGE_LABEL[range]}</p>
            </div>
            <div className="ost-stats-kpi mb-5">
              <div>
                <p className="label">page views</p>
                <p className="value">{fmt(viewsInRange)}</p>
                <p className="hint">sum · {RANGE_LABEL[range].toLowerCase()}</p>
              </div>
              <div>
                <p className="label">visitors</p>
                <p className="value" style={{ color: 'var(--ost-ink)' }}>
                  {fmt(visitorsInRange)}
                </p>
                <p className="hint">unique · range</p>
              </div>
              <div>
                <p className="label">live now</p>
                <p className="value" style={{ color: 'var(--ost-ink)' }}>
                  {fmt(data.liveNow)}
                </p>
                <p className="hint">last 5 minutes</p>
              </div>
              <div>
                <p className="label">peak day</p>
                <p className="value" style={{ color: 'var(--ost-ink)' }}>
                  {fmt(peak?.views)}
                </p>
                <p className="hint">
                  {peak?.date ? `${peak.date} · best day in range` : 'in selected range'}
                </p>
              </div>
            </div>

            <div
              ref={chartWrapRef}
              className="ost-stats-panel"
              data-chart="humans"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="font-stats-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--ost-muted)]">
                  {chartMode === 'cumulative' ? 'page views · running total' : 'page views · daily'}
                </p>
                <div className="ost-stats-range">
                  <button
                    type="button"
                    className={chartMode === 'cumulative' ? 'on' : ''}
                    aria-pressed={chartMode === 'cumulative'}
                    onClick={() => setChartMode('cumulative')}
                  >
                    Cumulative
                  </button>
                  <button
                    type="button"
                    className={chartMode === 'daily' ? 'on' : ''}
                    aria-pressed={chartMode === 'daily'}
                    onClick={() => setChartMode('daily')}
                  >
                    Daily
                  </button>
                </div>
              </div>
              {series.some((d) => d.views > 0) ? (
                <canvas ref={canvasRef} role="img" aria-label="Human page views chart" />
              ) : (
                <p className="py-10 text-sm text-[var(--ost-muted)]">
                  No traffic yet — chart fills in as people visit.
                </p>
              )}
            </div>

            <div className="mt-6">
              <LiveGlobe />
            </div>
          </section>

          <section aria-labelledby="ost-bots-heading" className="mb-10">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="ost-bots-heading" className="font-stats-serif text-2xl text-[var(--ost-ink)]">
                Bots &amp; agents
              </h2>
              <p className="text-xs text-[var(--ost-muted)] max-w-md text-right">
                From nginx access logs · machines fetching pages · separate from human pageviews
              </p>
            </div>
            <div className="ost-stats-kpi mb-6">
              <div>
                <p className="label">bot hits · all time</p>
                <p className="value">{fmt(botHeadline?.hitsAll ?? botHeadline?.hits)}</p>
                <p className="hint">excludes scanner noise</p>
              </div>
              <div>
                <p className="label">AI agents · all time</p>
                <p className="value" style={{ color: 'var(--ost-ink)' }}>
                  {fmt(botHeadline?.aiAgentAll)}
                </p>
                <p className="hint">ChatGPT-User, Claude-User, …</p>
              </div>
              <div>
                <p className="label">AI crawlers · all time</p>
                <p className="value" style={{ color: 'var(--ost-ink)' }}>
                  {fmt(botHeadline?.aiCrawlAll)}
                </p>
                <p className="hint">GPTBot, ClaudeBot, Google-Extended, …</p>
              </div>
              <div>
                <p className="label">bots today</p>
                <p className="value" style={{ color: 'var(--ost-ink)' }}>
                  {fmt(botHeadline?.hitsToday)}
                </p>
                <p className="hint">since midnight UTC</p>
              </div>
            </div>

            <div className="ost-stats-panel mb-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-stats-mono text-[0.62rem] uppercase tracking-[0.16em] text-[var(--ost-accent)]">
                    ai bots by product
                  </h3>
                  <p className="mt-1 max-w-2xl text-[0.75rem] leading-snug text-[var(--ost-muted)]">
                    GPTBot / ChatGPT-User roll into ChatGPT; ClaudeBot into Claude; GrokBot into Grok;
                    Google-Extended into Gemini. Agents and crawlers together.
                  </p>
                </div>
                <div className="ost-stats-range">
                  {(['7d', '14d', '30d'] as ProductRange[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={productRange === key ? 'on' : ''}
                      aria-pressed={productRange === key}
                      onClick={() => setProductRange(key)}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="font-stats-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--ost-muted)]">
                    Who leads
                  </p>
                  <p className="mt-2 text-sm text-[var(--ost-muted)]">
                    {productLeads.majority
                      ? `Majority: ${productLeads.majority.label} · ${fmt(productLeads.majority.n)} (${
                          productLeads.sum
                            ? Math.round((100 * productLeads.majority.n) / productLeads.sum)
                            : 0
                        }%)`
                      : '—'}
                  </p>
                  <div className="mt-3 space-y-2.5">
                    {productLeads.rows.slice(0, 8).map((row) => (
                      <div key={row.id}>
                        <div className="flex justify-between gap-2 text-sm">
                          <span>{row.label}</span>
                          <span className="tabular-nums font-medium">
                            {fmt(row.n)}
                            <span className="text-[var(--ost-muted)] text-xs ml-1">
                              ({productLeads.sum ? Math.round((100 * row.n) / productLeads.sum) : 0}
                              %)
                            </span>
                          </span>
                        </div>
                        <div className="ost-bar">
                          <i
                            style={{
                              width: `${productLeads.sum ? Math.max(2, (100 * row.n) / productLeads.sum) : 0}%`,
                              background: PRODUCT_COLORS[row.id] || '#0a7ea4',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    {!productLeads.rows.length ? (
                      <p className="text-sm text-[var(--ost-muted)]">No AI bot product data in range yet.</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="font-stats-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--ost-muted)]">
                    By day
                  </p>
                  <ProductDayChart series={productSlice} />
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-stats-mono text-[0.5rem] uppercase tracking-[0.1em] text-[var(--ost-muted)]">
                    {Object.entries(PRODUCT_COLORS).map(([id, color]) => (
                      <span key={id} className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                        {data.llm?.products?.find((p) => p.id === id)?.label || id}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="ost-stats-panel mb-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-stats-mono text-[0.62rem] uppercase tracking-[0.16em] text-[var(--ost-accent)]">
                    humans from LLM
                  </h3>
                  <p className="mt-1 max-w-2xl text-[0.75rem] leading-snug text-[var(--ost-muted)]">
                    Real browsers that arrived from a chat UI referrer (claude.ai, chatgpt.com, gemini, grok, …).
                    Not bots — counted from the site beacon only.
                  </p>
                </div>
                <p className="font-stats-mono text-[0.52rem] uppercase tracking-[0.12em] text-[var(--ost-muted)]">
                  <span className="text-[var(--ost-ink)]">{fmt(llmWindow?.humans)}</span> in selected range ·{' '}
                  <span>{fmt(data.llm?.windows?.['7d']?.humans)}</span> · 7d
                </p>
              </div>
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="font-stats-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--ost-muted)]">
                    Who sent them · range
                  </p>
                  <div className="mt-3 space-y-2.5">
                    {(llmWindow?.byProduct || []).length ? (
                      llmWindow!.byProduct.map((row) => (
                        <div key={row.id}>
                          <div className="flex justify-between text-sm gap-2">
                            <span>{row.label}</span>
                            <span className="tabular-nums">
                              {fmt(row.n)} (
                              {llmWindow!.humans ? Math.round((100 * row.n) / llmWindow!.humans) : 0}%)
                            </span>
                          </div>
                          <div className="ost-bar">
                            <i
                              style={{
                                width: `${
                                  llmWindow!.humans ? Math.max(2, (100 * row.n) / llmWindow!.humans) : 0
                                }%`,
                                background: PRODUCT_COLORS[row.id] || '#b8956c',
                              }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--ost-muted)]">No chat-UI referrals in this range yet.</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="font-stats-mono text-[0.52rem] uppercase tracking-[0.14em] text-[var(--ost-muted)]">
                    Vs AI bots · all time
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-px bg-[var(--ost-line)]">
                    <article className="bg-white dark:bg-slate-950 px-3 py-3">
                      <p className="font-stats-mono text-[0.48rem] uppercase tracking-[0.12em] text-[var(--ost-muted)]">
                        AI bots
                      </p>
                      <p className="mt-1 font-stats-serif text-2xl tabular-nums">{fmt(data.llm?.aiBotsAllTime)}</p>
                    </article>
                    <article className="bg-white dark:bg-slate-950 px-3 py-3">
                      <p className="font-stats-mono text-[0.48rem] uppercase tracking-[0.12em] text-[var(--ost-muted)]">
                        humans from chat
                      </p>
                      <p className="mt-1 font-stats-serif text-2xl tabular-nums text-[var(--ost-accent)]">
                        {fmt(data.llm?.humansFromChatAllTime)}
                      </p>
                    </article>
                  </div>
                  <p className="mt-2 text-[0.7rem] text-[var(--ost-muted)]">
                    Kept as two tallies on purpose — crawl/agent traffic ≠ people clicking through from chat.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
              <div>
                <h3 className="font-stats-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--ost-accent)]">
                  Where bots come from
                </h3>
                <ol className="ost-stats-list mt-2">
                  {(botHeadline?.topFamilies || []).slice(0, 12).map((row) => (
                    <li key={row.family}>
                      <span className="min-w-0 truncate">
                        {row.family} <span className="text-[var(--ost-muted)]">· {row.category}</span>
                      </span>
                      <strong className="tabular-nums">{fmt(row.views)}</strong>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className="font-stats-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--ost-accent)]">
                  Paths bots hit
                </h3>
                <p className="mt-1 text-[0.7rem] text-[var(--ost-muted)]">robots, sitemaps, pages — scanners excluded from headlines</p>
                <ol className="ost-stats-list mt-2">
                  {(botHeadline?.topPaths || []).slice(0, 12).map((row) => (
                    <li key={row.path}>
                      <span className="min-w-0 truncate font-mono text-[0.8rem]">{row.path}</span>
                      <strong className="tabular-nums">{fmt(row.views)}</strong>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="lg:col-span-2">
                <h3 className="font-stats-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--ost-accent)]">
                  Recent bot hits
                </h3>
                <ul className="ost-stats-list mt-2">
                  {(botHeadline?.recent || []).slice(0, 12).map((row, i) => (
                    <li key={`${row.at}-${i}`}>
                      <span className="min-w-0 truncate font-mono text-[0.8rem]">{row.path}</span>
                      <span className="text-[var(--ost-muted)] text-xs shrink-0">
                        {row.ago || ''} · {row.family} · {row.category}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section aria-labelledby="ost-breakdown-heading" className="border-t border-[var(--ost-line)] pt-8">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="ost-breakdown-heading" className="font-stats-serif text-2xl text-[var(--ost-ink)]">
                Breakdown
              </h2>
              <p className="text-xs text-[var(--ost-muted)]">All-time paths &amp; countries · live activity</p>
            </div>
            <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
              <div>
                <h3 className="font-stats-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--ost-accent)]">
                  Top paths
                </h3>
                <ol className="ost-stats-list mt-2">
                  {(data.topPaths || []).slice(0, 12).map((row) => (
                    <li key={row.path}>
                      <Link to={row.path} className="min-w-0 truncate hover:underline">
                        {row.path}
                      </Link>
                      <strong className="tabular-nums">{fmt(row.views)}</strong>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className="font-stats-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--ost-accent)]">
                  Countries
                </h3>
                <p className="mt-1 text-[0.7rem] text-[var(--ost-muted)]">Unique visitors · GeoIP</p>
                <ol className="ost-stats-list mt-2">
                  {(data.topCountries || []).length ? (
                    data.topCountries.slice(0, 12).map((row) => (
                      <li key={row.c}>
                        <span>{regionName(row.c)}</span>
                        <span>
                          <strong className="tabular-nums">{fmt(row.n)}</strong>
                          <span className="text-[var(--ost-muted)] text-xs"> · unique</span>
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="text-[var(--ost-muted)]">Country data fills in as new visits arrive.</li>
                  )}
                </ol>
              </div>
              <div className="lg:col-span-2">
                <h3 className="font-stats-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--ost-accent)]">
                  Recent human activity
                </h3>
                <ul className="ost-stats-list mt-2">
                  {(data.live || []).slice(0, 14).map((row, i) => (
                    <li key={`${row.path}-${row.ago}-${i}`}>
                      <span className="min-w-0 truncate font-mono text-[0.8rem]">{row.path}</span>
                      <span className="text-[var(--ost-muted)] text-xs shrink-0">
                        {row.ago} · {row.c || '?'}
                      </span>
                    </li>
                  ))}
                  {!data.live?.length ? (
                    <li className="text-[var(--ost-muted)]">No live human activity in the last 5 minutes.</li>
                  ) : null}
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

function ProductDayChart({
  series,
}: {
  series: Array<Record<string, number | string>>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const keys = Object.keys(PRODUCT_COLORS);
    const width = canvas.parentElement?.clientWidth || 320;
    const height = 240;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!series.length || !series.some((d) => Number(d.total) > 0)) {
      ctx.fillStyle = 'rgba(17,17,17,0.35)';
      ctx.font = '13px sans-serif';
      ctx.fillText('No AI bot days in range yet.', 8, 28);
      return;
    }

    const max = Math.max(1, ...series.map((d) => Number(d.total) || 0));
    const barW = Math.max(4, (width - 20) / series.length - 2);
    series.forEach((day, i) => {
      let y = height - 20;
      const x = 10 + i * ((width - 20) / series.length);
      for (const key of keys) {
        const v = Number(day[key]) || 0;
        if (!v) continue;
        const h = (v / max) * (height - 36);
        y -= h;
        ctx.fillStyle = PRODUCT_COLORS[key];
        ctx.fillRect(x, y, barW, h);
      }
    });
  }, [series]);

  return <canvas ref={ref} className="mt-2 w-full" role="img" aria-label="AI bots by product per day" />;
}

export type { PublicSiteStats };
export default Stats;
