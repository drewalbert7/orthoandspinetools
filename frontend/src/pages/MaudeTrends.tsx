import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  Anchor,
  Bone,
  CircleDot,
  Cylinder,
  Package,
  Scissors,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Wrench,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DocumentMeta } from '../components/DocumentMeta';
import { buildHubCollectionJsonLd } from '../lib/seo';
import {
  apiService,
  type MaudeBrandSearchHit,
  type MaudeBrandSeries,
  type MaudeCountTerm,
  type MaudeDeviceIcon,
  type MaudeTopDevice,
  type MaudeTrendData,
  type MaudeTrendingBrand,
} from '../services/apiService';

/** Matches OrthoAndSpineTools community specialties (plus All Orthopedic). */
const SPECIALTIES: { id: string; label: string; communitySlug: string | null }[] = [
  { id: 'all', label: 'All Orthopedic', communitySlug: null },
  { id: 'spine', label: 'Spine', communitySlug: 'spine' },
  { id: 'hip-knee-arthroplasty', label: 'Hip & Knee Arthroplasty', communitySlug: 'hip-knee-arthroplasty' },
  { id: 'shoulder-elbow', label: 'Shoulder Elbow', communitySlug: 'shoulder-elbow' },
  { id: 'sports', label: 'Sports', communitySlug: 'sports' },
  { id: 'ortho-trauma', label: 'Ortho Trauma', communitySlug: 'ortho-trauma' },
  { id: 'foot-ankle', label: 'Foot & Ankle', communitySlug: 'foot-ankle' },
  { id: 'hand', label: 'Hand', communitySlug: 'hand' },
  { id: 'ortho-peds', label: 'Ortho Peds', communitySlug: 'ortho-peds' },
  { id: 'ortho-onc', label: 'Ortho Onc', communitySlug: 'ortho-onc' },
  { id: 'biologics', label: 'Biologics', communitySlug: 'biologics' },
];

const TIMELINES: { days: number; label: string }[] = [
  { days: 90, label: '90d' },
  { days: 365, label: '1y' },
  { days: 1095, label: '3y' },
  { days: 1825, label: '5y' },
  { days: 3650, label: '10y' },
];

const BRAND_COLORS = [
  '#2563eb',
  '#dc2626',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#65a30d',
  '#ea580c',
  '#4f46e5',
  '#0d9488',
  '#be123c',
  '#ca8a04',
  '#4338ca',
  '#15803d',
  '#c026d3',
  '#0369a1',
  '#b45309',
  '#6d28d9',
  '#14746f',
];

function formatDataThrough(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatAxisDate(date: string, grain: 'day' | 'month'): string {
  if (grain === 'month' || date.length === 7) {
    const [y, m] = date.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mi = Number(m) - 1;
    return `${months[mi] || m} ${y?.slice(2) || ''}`;
  }
  return date.slice(0, 7);
}

const ICON_META: Record<
  MaudeDeviceIcon,
  { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  knee: { label: 'Knee', className: 'bg-violet-100 text-violet-700', Icon: Bone },
  hip: { label: 'Hip', className: 'bg-indigo-100 text-indigo-700', Icon: CircleDot },
  shoulder: { label: 'Shoulder', className: 'bg-sky-100 text-sky-700', Icon: Shield },
  spine: { label: 'Spine', className: 'bg-teal-100 text-teal-700', Icon: Activity },
  screw: { label: 'Screw', className: 'bg-amber-100 text-amber-800', Icon: Wrench },
  plate: { label: 'Plate', className: 'bg-orange-100 text-orange-700', Icon: Package },
  rod: { label: 'Rod / Nail', className: 'bg-rose-100 text-rose-700', Icon: Cylinder },
  anchor: { label: 'Soft tissue', className: 'bg-cyan-100 text-cyan-700', Icon: Anchor },
  graft: { label: 'Biologic', className: 'bg-emerald-100 text-emerald-700', Icon: Sparkles },
  instrument: { label: 'Instrument', className: 'bg-gray-100 text-gray-600', Icon: Scissors },
  generic: { label: 'Device', className: 'bg-blue-100 text-blue-700', Icon: Package },
};

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function ProblemBars({
  title,
  terms,
  accentClass,
}: {
  title: string;
  terms: MaudeCountTerm[];
  accentClass: string;
}) {
  if (!terms.length) return null;
  const max = Math.max(...terms.map((t) => t.count), 1);
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <ul className="space-y-1.5">
        {terms.slice(0, 6).map((t) => (
          <li key={t.term} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
            <div className="min-w-0">
              <div className="truncate text-gray-800" title={t.term}>
                {t.term}
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-gray-100">
                <div
                  className={`h-full rounded ${accentClass}`}
                  style={{ width: `${Math.max(4, (t.count / max) * 100)}%` }}
                />
              </div>
            </div>
            <span className="tabular-nums text-xs text-gray-500">{t.count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BrandSynopsisPanel({
  brand,
  specialty,
  days,
}: {
  brand: string;
  specialty: string;
  days: number;
}) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['maude-synopsis', brand, specialty, days],
    queryFn: () => apiService.getMaudeBrandSynopsis({ brand, specialty, days }),
    staleTime: 10 * 60 * 1000,
    enabled: brand.length >= 2,
  });

  return (
    <div className="mb-4 border border-amber-200 bg-amber-50/40 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            What’s going wrong — {data?.displayTitle || brand}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            FDA problem codes and recent report excerpts for this brand in the selected window
          </p>
        </div>
        {isFetching && data ? (
          <span className="text-xs text-gray-400">Refreshing…</span>
        ) : null}
      </div>

      {isLoading && !data ? (
        <p className="text-sm text-gray-500">Loading report synopsis…</p>
      ) : isError ? (
        <div className="text-sm text-red-700">
          <p>{error instanceof Error ? error.message : 'Failed to load synopsis'}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Retry
          </button>
        </div>
      ) : data ? (
        <>
          <p className="mb-4 text-sm leading-relaxed text-gray-800">{data.summary}</p>

          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Event mix
              </h3>
              {data.eventTypes.length ? (
                <ul className="space-y-1">
                  {data.eventTypes.map((t) => {
                    const total = data.eventTypes.reduce((s, x) => s + x.count, 0) || 1;
                    const pct = Math.round((t.count / total) * 100);
                    return (
                      <li
                        key={t.term}
                        className="flex items-center justify-between gap-2 text-sm text-gray-800"
                      >
                        <span>{t.term}</span>
                        <span className="tabular-nums text-xs text-gray-500">
                          {pct}% · {t.count.toLocaleString()}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No event-type breakdown</p>
              )}
            </div>
            <ProblemBars
              title="Device problems"
              terms={data.deviceProblems}
              accentClass="bg-amber-500"
            />
            <ProblemBars
              title="Patient problems"
              terms={data.patientProblems}
              accentClass="bg-rose-500"
            />
          </div>

          {data.samples.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Recent report excerpts
              </h3>
              <ul className="space-y-3">
                {data.samples.map((s, i) => (
                  <li
                    key={`${s.reportNumber || s.date}-${i}`}
                    className="border-l-2 border-amber-300 pl-3 text-sm"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                      <span>{s.date || 'Unknown date'}</span>
                      <span>·</span>
                      <span>{s.eventType}</span>
                      {s.problems.length > 0 ? (
                        <>
                          <span>·</span>
                          <span className="text-gray-600">{s.problems.join(', ')}</span>
                        </>
                      ) : null}
                      {s.reportNumber ? (
                        <>
                          <span>·</span>
                          <span className="font-mono">{s.reportNumber}</span>
                        </>
                      ) : null}
                    </div>
                    <p className="leading-relaxed text-gray-700">{s.excerpt}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-3 text-xs leading-relaxed text-gray-500">{data.disclaimer}</p>
        </>
      ) : null}
    </div>
  );
}

function TrendBadge({ trend }: { trend: MaudeTrendData['trend'] }) {
  const windowLabel = trend.windowLabel || '7d';
  if (trend.direction === 'insufficient') {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
        Need more history
      </span>
    );
  }
  const pct =
    trend.changePct == null ? '—' : `${trend.changePct > 0 ? '+' : ''}${trend.changePct.toFixed(0)}%`;
  const styles =
    trend.direction === 'up'
      ? 'bg-red-50 text-red-700'
      : trend.direction === 'down'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-gray-100 text-gray-700';
  const label =
    trend.direction === 'up' ? 'Rising' : trend.direction === 'down' ? 'Falling' : 'Flat';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${styles}`}>
      {label} {pct} vs prior {windowLabel}
    </span>
  );
}

function DeviceIconBadge({ icon }: { icon: MaudeDeviceIcon }) {
  const meta = ICON_META[icon] || ICON_META.generic;
  const Icon = meta.Icon;
  return (
    <span
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.className}`}
      title={meta.label}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

function TopImplantsGrid({
  devices,
  selectedName,
  onSelect,
  colorByName,
}: {
  devices: MaudeTopDevice[];
  selectedName: string | null;
  onSelect: (device: MaudeTopDevice | null) => void;
  colorByName?: Map<string, string>;
}) {
  if (devices.length === 0) {
    return (
      <p className="text-sm text-gray-500">No brand names ranked for this specialty yet.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {devices.map((d) => {
        const selected = selectedName === d.name;
        const swatch = colorByName?.get(d.name);
        return (
          <button
            key={d.name}
            type="button"
            onClick={() => onSelect(selected ? null : d)}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              selected
                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
            }`}
          >
            <DeviceIconBadge icon={d.icon} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                {swatch && (
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: swatch }}
                    aria-hidden
                  />
                )}
                <span className="block text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">
                  {d.shortLabel}
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                {d.company ? `${d.company} · ` : ''}
                {d.count.toLocaleString()} reports
                {selected ? ' · focused chart' : ''}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SingleSeriesChart({
  series,
  yLabel,
  grain,
  color = '#2563eb',
}: {
  series: Array<{ date: string; count: number }>;
  yLabel: string;
  grain: 'day' | 'month';
  color?: string;
}) {
  const width = 720;
  const height = 280;
  const pad = { top: 16, right: 12, bottom: 36, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxCount = Math.max(1, ...series.map((p) => p.count));
  const yMax = maxCount * 1.08;

  const points = series.map((p, i) => {
    const x = pad.left + (series.length <= 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
    const y = pad.top + innerH - (p.count / yMax) * innerH;
    return { x, y, ...p };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath =
    points.length > 0
      ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} L${points[0].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`
      : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: pad.top + innerH - t * innerH,
    label: formatCompact(yMax * t),
  }));

  const xLabelIndexes =
    series.length <= 6
      ? series.map((_, i) => i)
      : [0, Math.floor((series.length - 1) / 3), Math.floor(((series.length - 1) * 2) / 3), series.length - 1];

  const [hover, setHover] = useState<number | null>(null);
  const hovered = hover != null ? points[hover] : null;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[320px]"
        role="img"
        aria-label={yLabel}
        onMouseLeave={() => setHover(null)}
      >
        <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
        {yTicks.map((tick) => (
          <g key={tick.label + tick.y}>
            <line
              x1={pad.left}
              x2={pad.left + innerW}
              y1={tick.y}
              y2={tick.y}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
            <text x={pad.left - 8} y={tick.y + 4} textAnchor="end" className="fill-gray-400" fontSize={11}>
              {tick.label}
            </text>
          </g>
        ))}
        {areaPath && <path d={areaPath} fill={color} opacity={0.12} />}
        {linePath && (
          <path d={linePath} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" />
        )}
        {xLabelIndexes.map((i) => {
          const p = points[i];
          if (!p) return null;
          return (
            <text
              key={p.date}
              x={p.x}
              y={height - 10}
              textAnchor="middle"
              className="fill-gray-500"
              fontSize={11}
            >
              {formatAxisDate(p.date, grain)}
            </text>
          );
        })}
        {hovered && (
          <g>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={pad.top}
              y2={pad.top + innerH}
              stroke="#93c5fd"
              strokeDasharray="4 3"
            />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill={color} />
            <rect
              x={Math.min(hovered.x + 8, width - 148)}
              y={Math.max(pad.top, hovered.y - 36)}
              width={140}
              height={32}
              rx={6}
              fill="#111827"
            />
            <text
              x={Math.min(hovered.x + 8, width - 148) + 8}
              y={Math.max(pad.top, hovered.y - 36) + 14}
              className="fill-white"
              fontSize={11}
            >
              {hovered.date}
            </text>
            <text
              x={Math.min(hovered.x + 8, width - 148) + 8}
              y={Math.max(pad.top, hovered.y - 36) + 26}
              className="fill-blue-200"
              fontSize={11}
            >
              {hovered.count.toLocaleString()} {yLabel.includes('Cumulative') ? 'total' : 'reports'}
            </text>
          </g>
        )}
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={p.x - innerW / series.length / 2}
            y={pad.top}
            width={Math.max(innerW / series.length, 4)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
    </div>
  );
}

function TrendingBrandsPanel({
  brands,
  onSelect,
}: {
  brands: MaudeTrendingBrand[];
  onSelect: (name: string) => void;
}) {
  if (brands.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
        No clear rising brands in this window yet — try a longer timeline or another specialty.
      </div>
    );
  }

  const windowLabel = brands[0]?.windowLabel || 'recent';

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-red-600" />
          <h2 className="text-sm font-semibold text-gray-900">Trending implants</h2>
        </div>
        <p className="text-xs text-gray-500">vs prior {windowLabel}</p>
      </div>
      <ol className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-red-100 bg-white">
        {brands.map((b, i) => (
          <li key={b.name}>
            <button
              type="button"
              onClick={() => onSelect(b.name)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-red-50/60"
            >
              <span className="w-5 shrink-0 text-xs font-semibold text-gray-400">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">{b.shortLabel}</span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  {b.company ? `${b.company} · ` : ''}
                  {b.recentTotal.toLocaleString()} recent · {b.priorTotal.toLocaleString()} prior
                  {b.isNew ? ' · new activity' : ''}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                {b.isNew && b.priorTotal === 0 ? 'New' : `+${Math.round(b.changePct)}%`}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-gray-400">
        Ranked by recent report growth rate (not total volume). Tap a brand to open its cumulative chart.
      </p>
    </div>
  );
}

function BrandSearchBar({
  specialty,
  localSuggestions,
  onPick,
}: {
  specialty: string;
  localSuggestions: Array<{ name: string; shortLabel: string; company?: string | null; count: number }>;
  onPick: (
    name: string,
    meta?: { shortLabel?: string; company?: string | null; count?: number; icon?: MaudeDeviceIcon }
  ) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<MaudeBrandSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestCompany, setRequestCompany] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestStatus, setRequestStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const localFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localSuggestions.slice(0, 6);
    return localSuggestions
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.shortLabel.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [query, localSuggestions]);

  // Debounced openFDA autocomplete
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemote([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    setSearchError(null);
    const t = window.setTimeout(() => {
      apiService
        .searchMaudeBrands({ q, specialty, limit: 12 })
        .then((results) => {
          if (id !== reqId.current) return;
          setRemote(results);
          setSearching(false);
        })
        .catch((err: unknown) => {
          if (id !== reqId.current) return;
          setRemote([]);
          setSearching(false);
          setSearchError(err instanceof Error ? err.message : 'Search failed');
        });
    }, 280);
    return () => window.clearTimeout(t);
  }, [query, specialty]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const merged = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byName = new Map<
      string,
      {
        name: string;
        shortLabel: string;
        company?: string | null;
        count: number;
        match?: 'exact' | 'prefix' | 'contains' | 'local';
        icon?: MaudeDeviceIcon;
        source: 'fda' | 'local';
      }
    >();

    for (const hit of remote) {
      byName.set(hit.name.toLowerCase(), {
        name: hit.name,
        shortLabel: hit.shortLabel,
        company: hit.company,
        count: hit.count,
        match: hit.match,
        icon: hit.icon,
        source: 'fda',
      });
    }
    for (const s of localFiltered) {
      const key = s.name.toLowerCase();
      if (byName.has(key)) continue;
      byName.set(key, {
        name: s.name,
        shortLabel: s.shortLabel,
        company: s.company,
        count: s.count,
        match: q && s.name.toLowerCase() === q ? 'exact' : 'local',
        source: 'local',
      });
    }

    const rank = { exact: 0, prefix: 1, contains: 2, local: 3 } as const;
    return [...byName.values()].sort((a, b) => {
      const ra = rank[a.match || 'local'];
      const rb = rank[b.match || 'local'];
      if (ra !== rb) return ra - rb;
      return b.count - a.count;
    });
  }, [remote, localFiltered, query]);

  const pick = (
    name: string,
    meta?: { shortLabel?: string; company?: string | null; count?: number; icon?: MaudeDeviceIcon }
  ) => {
    onPick(name, meta);
    setQuery(meta?.shortLabel || name);
    setOpen(false);
  };

  const submitBest = () => {
    const q = query.trim();
    if (!q) return;
    const best = merged[0];
    if (best) {
      pick(best.name, { shortLabel: best.shortLabel, count: best.count, icon: best.icon });
      return;
    }
    // Fall through to phrase brand search even if autocomplete empty
    pick(q, { shortLabel: q });
  };

  const submitBrandRequest = async () => {
    const brand = query.trim();
    if (brand.length < 2) return;
    setRequestStatus('sending');
    setRequestMessage(null);
    try {
      const res = await apiService.requestMaudeBrand({
        brand,
        company: requestCompany.trim() || undefined,
        specialty,
        note: requestNote.trim() || undefined,
        contactEmail: requestEmail.trim() || undefined,
      });
      setRequestStatus('done');
      setRequestMessage(res.message);
    } catch (err: unknown) {
      setRequestStatus('error');
      setRequestMessage(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const showRequestFooter = query.trim().length >= 2 && !searching;

  return (
    <div ref={rootRef} className="relative mt-4">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
        Search implant / brand
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setRequestOpen(false);
            setRequestStatus('idle');
            setRequestMessage(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitBest();
            }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Start typing a brand — ATTUNE, HORIZON, PERSONA…"
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-24 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          {searching ? 'Searching FDA…' : query.trim().length >= 2 ? 'openFDA' : ''}
        </span>
      </div>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {query.trim().length < 2 && (
            <li className="px-3 py-2 text-xs text-gray-500">
              Type at least 2 characters — results come from FDA brand names in this specialty.
            </li>
          )}
          {query.trim().length >= 2 && searching && merged.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500">Querying openFDA…</li>
          )}
          {query.trim().length >= 2 && !searching && merged.length === 0 && !searchError && (
            <li className="px-3 py-2 text-sm text-gray-500">
              No brand matches for “{query.trim()}”. Try another spelling, or request we add it below.
            </li>
          )}
          {searchError && (
            <li className="px-3 py-2 text-sm text-red-600">{searchError}</li>
          )}
          {merged.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  pick(s.name, {
                    shortLabel: s.shortLabel,
                    company: s.company,
                    count: s.count,
                    icon: s.icon,
                  })
                }
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-900">{s.shortLabel}</span>
                  <span className="block text-[11px] text-gray-400">
                    {s.company ? `${s.company} · ` : ''}
                    {s.source === 'fda' ? 'FDA brand' : 'On this chart'}
                    {s.match && s.match !== 'local' ? ` · ${s.match} match` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium tabular-nums text-gray-600">
                  {s.count.toLocaleString()}
                </span>
              </button>
            </li>
          ))}
          {showRequestFooter && (
            <li className="border-t border-gray-100 px-3 py-2">
              {!requestOpen ? (
                <button
                  type="button"
                  className="text-left text-xs font-medium text-blue-600 hover:text-blue-800"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setRequestOpen(true);
                    setRequestStatus('idle');
                    setRequestMessage(null);
                  }}
                >
                  Don’t see “{query.trim()}”? Request we add it →
                </button>
              ) : (
                <div className="space-y-2" onMouseDown={(e) => e.stopPropagation()}>
                  <p className="text-xs text-gray-600">
                    Tell us the brand or company and we’ll review adding it to MAUDE coverage.
                  </p>
                  <input
                    type="text"
                    value={requestCompany}
                    onChange={(e) => setRequestCompany(e.target.value)}
                    placeholder="Company (optional)"
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  />
                  <textarea
                    value={requestNote}
                    onChange={(e) => setRequestNote(e.target.value)}
                    placeholder="Anything helpful — product line, specialty (optional)"
                    rows={2}
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  />
                  <input
                    type="email"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                    placeholder="Your email if you want a follow-up (optional)"
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={requestStatus === 'sending' || requestStatus === 'done'}
                      onClick={submitBrandRequest}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {requestStatus === 'sending'
                        ? 'Sending…'
                        : requestStatus === 'done'
                          ? 'Sent'
                          : 'Submit request'}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-gray-500 hover:text-gray-800"
                      onClick={() => setRequestOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  {requestMessage && (
                    <p
                      className={`text-xs ${
                        requestStatus === 'error' ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {requestMessage}
                    </p>
                  )}
                </div>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function MultiBrandChart({
  brands,
  trending,
  mode,
  grain,
  onSelectBrand,
}: {
  brands: MaudeBrandSeries[];
  trending: MaudeTrendingBrand[];
  mode: 'daily' | 'cumulative';
  grain: 'day' | 'month';
  onSelectBrand: (name: string) => void;
}) {
  const width = 720;
  const height = 320;
  const pad = { top: 16, right: 12, bottom: 36, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const [listMode, setListMode] = useState<'volume' | 'trending'>('volume');

  // Rank list: by volume or by momentum (trending first)
  const ranked = useMemo(() => {
    if (listMode === 'trending' && trending.length > 0) {
      const byName = new Map(brands.map((b) => [b.name, b]));
      const ordered: MaudeBrandSeries[] = [];
      const seen = new Set<string>();
      for (const t of trending) {
        const hit = byName.get(t.name);
        if (hit) {
          ordered.push(hit);
          seen.add(t.name);
        }
      }
      const rest = brands.filter((b) => !seen.has(b.name)).sort((a, b) => b.count - a.count);
      return [...ordered, ...rest];
    }
    return [...brands].sort((a, b) => b.count - a.count);
  }, [brands, trending, listMode]);

  const colorByName = useMemo(() => {
    const map = new Map<string, string>();
    ranked.forEach((b, i) => map.set(b.name, BRAND_COLORS[i % BRAND_COLORS.length]));
    return map;
  }, [ranked]);

  const fullDates =
    ranked[0]?.[mode === 'cumulative' ? 'cumulativeSeries' : 'series'].map((p) => p.date) || [];

  // Zoom window as inclusive index range into fullDates
  const [zoom, setZoom] = useState<{ start: number; end: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focusBrand, setFocusBrand] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ lastX: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setZoom(null);
  }, [ranked, mode, grain]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * width;
      const t = Math.max(0, Math.min(1, (x - pad.left) / innerW));
      const pivot = Math.round(t * Math.max(0, (zoom ? zoom.end - zoom.start : fullDates.length - 1)));
      // Inline zoom to avoid stale closure issues with button handlers
      if (fullDates.length < 4) return;
      const curStart = zoom?.start ?? 0;
      const curEnd = zoom?.end ?? fullDates.length - 1;
      const span = curEnd - curStart + 1;
      const factor = e.deltaY > 0 ? 1 / 1.25 : 1.25;
      const nextSpan = Math.max(6, Math.min(fullDates.length, Math.round(span / factor)));
      if (nextSpan >= fullDates.length) {
        setZoom(null);
        return;
      }
      const absPivot = curStart + pivot;
      let nextStart = Math.round(absPivot - nextSpan / 2);
      let nextEnd = nextStart + nextSpan - 1;
      if (nextStart < 0) {
        nextStart = 0;
        nextEnd = nextSpan - 1;
      }
      if (nextEnd > fullDates.length - 1) {
        nextEnd = fullDates.length - 1;
        nextStart = nextEnd - nextSpan + 1;
      }
      setZoom({ start: nextStart, end: nextEnd });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoom, fullDates.length, width, innerW, pad.left]);

  const startIdx = zoom?.start ?? 0;
  const endIdx = zoom?.end ?? Math.max(0, fullDates.length - 1);
  const visibleCount = Math.max(1, endIdx - startIdx + 1);
  const isZoomed = zoom != null && (startIdx > 0 || endIdx < fullDates.length - 1);

  const visibleSeries = useMemo(() => {
    return ranked.map((brand) => {
      const series = mode === 'cumulative' ? brand.cumulativeSeries : brand.series;
      return {
        brand,
        points: series.slice(startIdx, endIdx + 1),
      };
    });
  }, [ranked, mode, startIdx, endIdx]);

  const maxCount = Math.max(
    1,
    ...visibleSeries.flatMap((s) => s.points.map((p) => p.count))
  );
  const yMax = maxCount * 1.08;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: pad.top + innerH - t * innerH,
    label: formatCompact(yMax * t),
  }));

  const dates = visibleSeries[0]?.points.map((p) => p.date) || [];
  const xLabelIndexes =
    dates.length <= 6
      ? dates.map((_, i) => i)
      : [0, Math.floor((dates.length - 1) / 3), Math.floor(((dates.length - 1) * 2) / 3), dates.length - 1];

  const indexFromClientX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || dates.length === 0) return 0;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * width;
    const t = Math.max(0, Math.min(1, (x - pad.left) / innerW));
    return Math.round(t * (dates.length - 1));
  };

  const nearestBrandAt = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg || dates.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    const ySvg = ((clientY - rect.top) / rect.height) * height;
    const i = indexFromClientX(clientX);
    let best: { name: string; dist: number } | null = null;
    for (const { brand, points } of visibleSeries) {
      const p = points[i];
      if (!p) continue;
      const y = pad.top + innerH - (p.count / yMax) * innerH;
      const dist = Math.abs(y - ySvg);
      if (!best || dist < best.dist) best = { name: brand.name, dist };
    }
    return best && best.dist < 28 ? best.name : null;
  };

  const zoomBy = (factor: number, pivotIdx?: number) => {
    if (fullDates.length < 4) return;
    const curStart = zoom?.start ?? 0;
    const curEnd = zoom?.end ?? fullDates.length - 1;
    const span = curEnd - curStart + 1;
    const nextSpan = Math.max(6, Math.min(fullDates.length, Math.round(span / factor)));
    if (nextSpan >= fullDates.length) {
      setZoom(null);
      return;
    }
    const pivot = pivotIdx != null ? startIdx + pivotIdx : Math.round((curStart + curEnd) / 2);
    let nextStart = Math.round(pivot - nextSpan / 2);
    let nextEnd = nextStart + nextSpan - 1;
    if (nextStart < 0) {
      nextStart = 0;
      nextEnd = nextSpan - 1;
    }
    if (nextEnd > fullDates.length - 1) {
      nextEnd = fullDates.length - 1;
      nextStart = nextEnd - nextSpan + 1;
    }
    setZoom({ start: nextStart, end: nextEnd });
  };

  const panBy = (deltaIdx: number) => {
    if (!zoom) return;
    const span = zoom.end - zoom.start;
    let nextStart = zoom.start + deltaIdx;
    let nextEnd = zoom.end + deltaIdx;
    if (nextStart < 0) {
      nextStart = 0;
      nextEnd = span;
    }
    if (nextEnd > fullDates.length - 1) {
      nextEnd = fullDates.length - 1;
      nextStart = nextEnd - span;
    }
    setZoom({ start: nextStart, end: nextEnd });
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          Scroll to zoom · drag to pan · hover a line or row to highlight
        </p>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(1.4)}
            className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
            Zoom in
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.4)}
            disabled={!isZoomed}
            className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
            Zoom out
          </button>
          <button
            type="button"
            onClick={() => setZoom(null)}
            disabled={!isZoomed}
            className="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className={`h-auto w-full min-w-[320px] ${isZoomed ? 'cursor-grab' : 'cursor-crosshair'} ${dragging ? 'cursor-grabbing' : ''}`}
          role="img"
          aria-label="Top brands cumulative reports"
          onMouseLeave={() => {
            setHover(null);
            setFocusBrand(null);
            setDragging(false);
            dragRef.current = null;
          }}
          onMouseDown={(e) => {
            if (!isZoomed) return;
            setDragging(true);
            dragRef.current = { lastX: e.clientX };
          }}
          onMouseUp={() => {
            setDragging(false);
            dragRef.current = null;
          }}
          onMouseMove={(e) => {
            const i = indexFromClientX(e.clientX);
            setHover(i);
            if (dragging && dragRef.current && isZoomed) {
              const dx = e.clientX - dragRef.current.lastX;
              dragRef.current.lastX = e.clientX;
              const idxDelta = Math.round((-dx / innerW) * visibleCount);
              if (idxDelta !== 0) panBy(idxDelta);
              return;
            }
            const near = nearestBrandAt(e.clientX, e.clientY);
            if (near) setFocusBrand(near);
          }}
        >
          <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
          {yTicks.map((tick) => (
            <g key={tick.label + tick.y}>
              <line
                x1={pad.left}
                x2={pad.left + innerW}
                y1={tick.y}
                y2={tick.y}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text x={pad.left - 8} y={tick.y + 4} textAnchor="end" className="fill-gray-400" fontSize={11}>
                {tick.label}
              </text>
            </g>
          ))}
          {visibleSeries.map(({ brand, points }, bi) => {
            const color = colorByName.get(brand.name) || BRAND_COLORS[bi % BRAND_COLORS.length];
            const focused = focusBrand === brand.name;
            const dimmed = focusBrand != null && !focused;
            const pts = points.map((p, i) => {
              const x =
                pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
              const y = pad.top + innerH - (p.count / yMax) * innerH;
              return { x, y };
            });
            const path = pts
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(' ');
            return (
              <path
                key={brand.name}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={focused ? 3.25 : dimmed ? 1.1 : bi < 5 ? 2.4 : 1.8}
                strokeLinejoin="round"
                opacity={dimmed ? 0.12 : 0.95}
                style={{ pointerEvents: 'stroke' }}
                onMouseEnter={() => setFocusBrand(brand.name)}
              />
            );
          })}
          {xLabelIndexes.map((i) => {
            const date = dates[i];
            if (!date) return null;
            const x =
              pad.left + (dates.length <= 1 ? innerW / 2 : (i / (dates.length - 1)) * innerW);
            return (
              <text
                key={date}
                x={x}
                y={height - 10}
                textAnchor="middle"
                className="fill-gray-500"
                fontSize={11}
              >
                {formatAxisDate(date, grain)}
              </text>
            );
          })}
          {hover != null && dates[hover] && (
            <line
              x1={
                pad.left +
                (dates.length <= 1 ? innerW / 2 : (hover / (dates.length - 1)) * innerW)
              }
              x2={
                pad.left +
                (dates.length <= 1 ? innerW / 2 : (hover / (dates.length - 1)) * innerW)
              }
              y1={pad.top}
              y2={pad.top + innerH}
              stroke="#93c5fd"
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}
        </svg>
      </div>

      {hover != null && dates[hover] && (
        <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <span className="font-medium text-gray-800">{dates[hover]}</span>
          {focusBrand && (
            <span>
              {' '}
              ·{' '}
              {visibleSeries
                .find((s) => s.brand.name === focusBrand)
                ?.points[hover]?.count.toLocaleString() ?? '—'}{' '}
              for{' '}
              <span className="font-medium text-gray-900">
                {ranked.find((b) => b.name === focusBrand)?.shortLabel}
              </span>
            </span>
          )}
        </div>
      )}

      <div className="mt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Implants {listMode === 'trending' ? 'by momentum' : 'by report volume'}
          </p>
          <div className="inline-flex rounded-md border border-gray-200 p-0.5">
            <button
              type="button"
              onClick={() => setListMode('volume')}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                listMode === 'volume' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Volume
            </button>
            <button
              type="button"
              onClick={() => setListMode('trending')}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                listMode === 'trending' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Trending
            </button>
          </div>
        </div>
        <ol className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {ranked.map((brand, bi) => {
            const color = colorByName.get(brand.name) || BRAND_COLORS[bi % BRAND_COLORS.length];
            const focused = focusBrand === brand.name;
            const trendMeta = trending.find((t) => t.name === brand.name);
            return (
              <li key={brand.name}>
                <button
                  type="button"
                  onClick={() => onSelectBrand(brand.name)}
                  onMouseEnter={() => setFocusBrand(brand.name)}
                  onMouseLeave={() => setFocusBrand(null)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    focused ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="w-5 shrink-0 text-xs font-semibold text-gray-400">{bi + 1}</span>
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {brand.shortLabel}
                    </span>
                    {brand.company ? (
                      <span className="block truncate text-[11px] text-gray-500">{brand.company}</span>
                    ) : null}
                  </span>
                  {trendMeta && (
                    <span className="shrink-0 text-xs font-semibold text-red-600">
                      {trendMeta.isNew ? 'New' : `+${Math.round(trendMeta.changePct)}%`}
                    </span>
                  )}
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-800">
                    {brand.count.toLocaleString()}
                  </span>
                  <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">reports</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

const MaudeTrends: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const specialtyFromUrl = searchParams.get('specialty') || 'all';
  const specialty = SPECIALTIES.some((s) => s.id === specialtyFromUrl) ? specialtyFromUrl : 'all';
  const daysFromUrl = Number(searchParams.get('days') || 1095);
  const days = TIMELINES.some((t) => t.days === daysFromUrl) ? daysFromUrl : 1095;
  const brandFromUrl = searchParams.get('brand');
  const modeFromUrl = searchParams.get('mode');
  const [selectedBrand, setSelectedBrand] = useState<MaudeTopDevice | null>(null);
  const [chartMode, setChartMode] = useState<'daily' | 'cumulative'>(
    modeFromUrl === 'daily' ? 'daily' : 'cumulative'
  );

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (modeFromUrl === 'daily' || modeFromUrl === 'cumulative') {
      setChartMode(modeFromUrl);
    }
  }, [modeFromUrl]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['maude-trends', days, specialty, selectedBrand?.name || brandFromUrl || ''],
    queryFn: () =>
      apiService.getMaudeTrends({
        days,
        specialty,
        brand: selectedBrand?.name || brandFromUrl || undefined,
      }),
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Hydrate selected brand from URL once topDevices arrive
  useEffect(() => {
    if (!brandFromUrl) {
      if (selectedBrand) setSelectedBrand(null);
      return;
    }
    if (selectedBrand?.name === brandFromUrl && selectedBrand.company != null) return;
    const match =
      data?.topDevices.find((d) => d.name === brandFromUrl) ||
      data?.brandSeries?.find((b) => b.name === brandFromUrl);
    if (match) {
      setSelectedBrand({
        name: match.name,
        count: match.count,
        icon: match.icon,
        shortLabel: match.shortLabel,
        company: match.company ?? null,
        kind: 'brand',
      });
    }
  }, [brandFromUrl, data?.topDevices, data?.brandSeries, selectedBrand]);

  const hubJsonLd = useMemo(
    () =>
      buildHubCollectionJsonLd({
        path: '/maude',
        name: 'MAUDE implant trends',
        description:
          'FDA openFDA / MAUDE adverse-event trends by orthopedic specialty and implant brand.',
      }),
    []
  );

  const activeSpecialty = SPECIALTIES.find((s) => s.id === specialty);
  const dataThrough = formatDataThrough(data?.lastUpdated);
  const grain = data?.grain || (days > 180 ? 'month' : 'day');

  const chartSeries = useMemo(() => {
    if (!data) return [];
    if (chartMode === 'cumulative') {
      if (data.cumulativeSeries?.length) return data.cumulativeSeries;
      let running = 0;
      return data.series.map((p) => {
        running += p.count;
        return { date: p.date, count: running };
      });
    }
    return data.series;
  }, [data, chartMode]);

  const brandSeries = useMemo(
    () => [...(data?.brandSeries || [])].sort((a, b) => b.count - a.count),
    [data?.brandSeries]
  );
  const showMultiBrand = !selectedBrand && !brandFromUrl && brandSeries.length > 0;

  const colorByName = useMemo(() => {
    const map = new Map<string, string>();
    brandSeries.forEach((b, i) => map.set(b.name, BRAND_COLORS[i % BRAND_COLORS.length]));
    return map;
  }, [brandSeries]);

  const searchSuggestions = useMemo(() => {
    const fromSeries = brandSeries.map((b) => ({
      name: b.name,
      shortLabel: b.shortLabel,
      company: b.company ?? null,
      count: b.count,
    }));
    const seen = new Set(fromSeries.map((b) => b.name.toLowerCase()));
    for (const d of data?.topDevices || []) {
      if (seen.has(d.name.toLowerCase())) continue;
      seen.add(d.name.toLowerCase());
      fromSeries.push({
        name: d.name,
        shortLabel: d.shortLabel,
        company: d.company ?? null,
        count: d.count,
      });
    }
    return fromSeries.sort((a, b) => b.count - a.count);
  }, [brandSeries, data?.topDevices]);

  const selectBrandByName = (
    name: string,
    meta?: { shortLabel?: string; company?: string | null; count?: number; icon?: MaudeDeviceIcon }
  ) => {
    const fromTop = data?.topDevices.find((d) => d.name === name);
    const fromSeries = brandSeries.find((b) => b.name === name);
    const match = fromTop || fromSeries;
    if (match) {
      setSelectedBrand({
        name: match.name,
        count: match.count,
        icon: match.icon,
        shortLabel: match.shortLabel,
        company: match.company ?? null,
        kind: 'brand',
      });
      updateParams({ brand: match.name, mode: 'cumulative' });
      setChartMode('cumulative');
      return;
    }
    setSelectedBrand({
      name,
      count: meta?.count ?? 0,
      icon: meta?.icon || 'generic',
      shortLabel: meta?.shortLabel || name,
      company: meta?.company ?? null,
      kind: 'brand',
    });
    updateParams({ brand: name, mode: 'cumulative' });
    setChartMode('cumulative');
  };

  const clearBrand = () => {
    setSelectedBrand(null);
    updateParams({ brand: null });
  };

  return (
    <div className="mx-auto min-w-0 max-w-4xl px-3 sm:px-4">
      <DocumentMeta
        title="MAUDE implant trends"
        description="FDA openFDA / MAUDE adverse-event trends by orthopedic specialty — top implant brands and multi-year cumulative report growth."
        canonicalPath="/maude"
        jsonLd={hubJsonLd}
      />

      <div className="mb-4 border border-gray-200 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">MAUDE report trends</h1>
            <p className="mt-1 text-sm text-gray-600">
              Multi-year adverse-event volume from FDA openFDA (MAUDE). Pick a specialty to compare the{' '}
              <strong>top 20 brands</strong> cumulatively over time. Spikes are signals — not proof a device is
              unsafe.
            </p>
          </div>
          {data && <TrendBadge trend={data.trend} />}
        </div>

        {dataThrough && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:text-sm">
            <span className="font-semibold">Data through {dataThrough}</span>
            <span className="text-amber-900/80">
              {' '}
              (FDA openFDA refresh). Later calendar days may show 0 until the next weekly publish.
            </span>
          </div>
        )}

        <BrandSearchBar
          specialty={specialty}
          localSuggestions={searchSuggestions}
          onPick={selectBrandByName}
        />

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Specialty</p>
          <div className="flex flex-wrap gap-2">
            {SPECIALTIES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedBrand(null);
                  updateParams({ specialty: s.id === 'all' ? null : s.id, brand: null });
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  specialty === s.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {activeSpecialty?.communitySlug && (
            <p className="mt-2 text-xs text-gray-500">
              Matches community{' '}
              <Link
                to={`/community/${activeSpecialty.communitySlug}`}
                className="font-medium text-blue-600 hover:text-blue-800"
              >
                o/{activeSpecialty.label}
              </Link>
            </p>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Timeline</p>
          <div className="flex flex-wrap gap-2">
            {TIMELINES.map((t) => (
              <button
                key={t.days}
                type="button"
                onClick={() => updateParams({ days: String(t.days) })}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  days === t.days ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {!selectedBrand && !brandFromUrl && data && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <TrendingBrandsPanel
              brands={data.trendingBrands || []}
              onSelect={selectBrandByName}
            />
          </div>
        )}

        <div className={`mt-5 border-t border-gray-100 pt-4 ${isFetching ? 'opacity-90' : ''}`}>
          {isLoading && !data ? (
            <div className="space-y-3 py-6">
              <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
              <div className="h-56 animate-pulse rounded bg-gray-100" />
              <p className="text-center text-sm text-gray-500">Loading report counts…</p>
            </div>
          ) : isError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600">
                {(error as Error)?.message || 'Failed to load MAUDE trends'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Retry
              </button>
            </div>
          ) : data ? (
            <>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {showMultiBrand
                      ? `${data.label} · top ${brandSeries.length} brands`
                      : data.label}
                  </p>
                  <p className="text-xs text-gray-500">
                    {data.startDate} → {data.endDate}
                    {grain === 'month' ? ' · monthly' : ' · daily'}
                    {isFetching ? ' · refreshing…' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(selectedBrand || brandFromUrl) && (
                    <button
                      type="button"
                      onClick={clearBrand}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      Show top brands
                    </button>
                  )}
                  <div className="inline-flex rounded-md border border-gray-200 p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setChartMode('daily');
                        updateParams({ mode: 'daily' });
                      }}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        chartMode === 'daily' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {grain === 'month' ? 'Monthly' : 'Daily'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChartMode('cumulative');
                        updateParams({ mode: 'cumulative' });
                      }}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        chartMode === 'cumulative'
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Cumulative
                    </button>
                  </div>
                  <div className="text-right text-xs text-gray-600">
                    <div>
                      <span className="font-semibold text-gray-900">{data.total.toLocaleString()}</span>{' '}
                      reports in window
                    </div>
                    <div>
                      {data.trend.windowLabel || '7d'} avg {formatCompact(data.trend.recentAvg)} · prior{' '}
                      {formatCompact(data.trend.priorAvg)}
                    </div>
                  </div>
                </div>
              </div>

              {showMultiBrand ? (
                <MultiBrandChart
                  brands={brandSeries}
                  trending={data.trendingBrands || []}
                  mode={chartMode}
                  grain={grain}
                  onSelectBrand={selectBrandByName}
                />
              ) : (
                <SingleSeriesChart
                  series={chartSeries}
                  yLabel={chartMode === 'cumulative' ? 'Cumulative reports' : 'Period reports'}
                  grain={grain}
                />
              )}

              <p className="mt-3 text-xs leading-relaxed text-gray-500">{data.disclaimer}</p>
            </>
          ) : null}
        </div>
      </div>

      {(selectedBrand || brandFromUrl) && (
        <BrandSynopsisPanel
          brand={selectedBrand?.name || brandFromUrl || ''}
          specialty={specialty}
          days={days}
        />
      )}

      <div className="mb-4 border border-gray-200 bg-white p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Top implant brands by report volume</h2>
          {(selectedBrand || brandFromUrl) && (
            <button
              type="button"
              onClick={clearBrand}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Clear brand filter
            </button>
          )}
        </div>
        {isLoading && !data ? (
          <p className="text-sm text-gray-500">Loading top brands…</p>
        ) : (
          <TopImplantsGrid
            devices={[...(data?.topDevices || [])].sort((a, b) => b.count - a.count)}
            selectedName={selectedBrand?.name || brandFromUrl || null}
            onSelect={(device) => {
              if (!device) {
                clearBrand();
                return;
              }
              setSelectedBrand(device);
              updateParams({ brand: device.name, mode: 'cumulative' });
              setChartMode('cumulative');
            }}
            colorByName={colorByName}
          />
        )}
        <p className="mt-2 text-xs text-gray-400">
          Ranked by FDA <code className="rounded bg-gray-100 px-1">brand_name</code> (commercial product names).
          Blank / UNK reporter values are excluded. Tap a brand to focus the chart above. Filters sync to the URL for
          sharing.
        </p>
      </div>
    </div>
  );
};

export default MaudeTrends;
