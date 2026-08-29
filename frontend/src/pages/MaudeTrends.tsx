import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Anchor,
  Bone,
  CircleDot,
  Cylinder,
  Package,
  Scissors,
  Shield,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { DocumentMeta } from '../components/DocumentMeta';
import { buildHubCollectionJsonLd } from '../lib/seo';
import {
  apiService,
  type MaudeDeviceIcon,
  type MaudeTopDevice,
  type MaudeTrendData,
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

const DAY_OPTIONS = [30, 90, 180, 365] as const;

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

function TrendBadge({ trend }: { trend: MaudeTrendData['trend'] }) {
  if (trend.direction === 'insufficient') {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
        Need ≥14 days
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
      {label} {pct} vs prior week
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
}: {
  devices: MaudeTopDevice[];
  selectedName: string | null;
  onSelect: (device: MaudeTopDevice | null) => void;
}) {
  if (devices.length === 0) {
    return (
      <p className="text-sm text-gray-500">No implant device names ranked for this specialty yet.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {devices.map((d) => {
        const selected = selectedName === d.name;
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
              <span className="block text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">
                {d.shortLabel}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                {d.count.toLocaleString()} reports · {ICON_META[d.icon]?.label || 'Device'}
                {selected ? ' · chart filtered' : ''}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DailyReportsChart({ series }: { series: MaudeTrendData['series'] }) {
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
        aria-label="Daily FDA device adverse event report counts"
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
        {areaPath && <path d={areaPath} fill="#dbeafe" opacity={0.7} />}
        {linePath && (
          <path d={linePath} fill="none" stroke="#2563eb" strokeWidth={2.25} strokeLinejoin="round" />
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
              {p.date.slice(5)}
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
            <circle cx={hovered.x} cy={hovered.y} r={4} fill="#2563eb" />
            <rect
              x={Math.min(hovered.x + 8, width - 130)}
              y={Math.max(pad.top, hovered.y - 36)}
              width={118}
              height={32}
              rx={6}
              fill="#111827"
            />
            <text
              x={Math.min(hovered.x + 8, width - 130) + 8}
              y={Math.max(pad.top, hovered.y - 36) + 14}
              className="fill-white"
              fontSize={11}
            >
              {hovered.date}
            </text>
            <text
              x={Math.min(hovered.x + 8, width - 130) + 8}
              y={Math.max(pad.top, hovered.y - 36) + 26}
              className="fill-blue-200"
              fontSize={11}
            >
              {hovered.count.toLocaleString()} reports
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

const MaudeTrends: React.FC = () => {
  const [specialty, setSpecialty] = useState('all');
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(90);
  const [selectedDevice, setSelectedDevice] = useState<MaudeTopDevice | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['maude-trends', days, specialty, selectedDevice?.name || ''],
    queryFn: () =>
      apiService.getMaudeTrends({
        days,
        specialty,
        deviceName: selectedDevice?.name,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const hubJsonLd = useMemo(
    () =>
      buildHubCollectionJsonLd({
        path: '/maude',
        name: 'MAUDE implant trends',
        description:
          'Daily FDA device adverse event report counts from openFDA / MAUDE by orthopedic specialty.',
      }),
    []
  );

  const activeSpecialty = SPECIALTIES.find((s) => s.id === specialty);

  return (
    <div className="mx-auto min-w-0 max-w-4xl px-3 sm:px-4">
      <DocumentMeta
        title="MAUDE implant trends"
        description="Daily FDA device adverse event report trends from openFDA / MAUDE by orthopedic specialty — top implants and rising signals."
        canonicalPath="/maude"
        jsonLd={hubJsonLd}
      />

      <div className="mb-4 border border-gray-200 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">MAUDE report trends</h1>
            <p className="mt-1 text-sm text-gray-600">
              Daily adverse-event volume from FDA openFDA (MAUDE), filtered by orthopedic specialty. Tap an implant
              icon to focus the chart. Spikes are signals to investigate — not proof a device is unsafe.
            </p>
          </div>
          {data && <TrendBadge trend={data.trend} />}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Specialty</p>
          <div className="flex flex-wrap gap-2">
            {SPECIALTIES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSpecialty(s.id);
                  setSelectedDevice(null);
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

        <div className="mt-3 flex flex-wrap gap-2">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                days === d ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 border border-gray-200 bg-white p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Top implants by report volume</h2>
          {selectedDevice && (
            <button
              type="button"
              onClick={() => setSelectedDevice(null)}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Clear implant filter
            </button>
          )}
        </div>
        {isLoading && !data ? (
          <p className="text-sm text-gray-500">Loading top implants…</p>
        ) : (
          <TopImplantsGrid
            devices={data?.topDevices || []}
            selectedName={selectedDevice?.name || null}
            onSelect={setSelectedDevice}
          />
        )}
        <p className="mt-2 text-xs text-gray-400">
          Icons are category glyphs (FDA does not publish product photos). Instrument-only rows are filtered when
          possible.
        </p>
      </div>

      <div className="mb-4 border border-gray-200 bg-white p-3 sm:p-4">
        {isLoading && !data ? (
          <div className="py-16 text-center text-sm text-gray-500">Loading daily report counts…</div>
        ) : isError ? (
          <div className="py-10 text-center">
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
                <p className="text-sm font-medium text-gray-900">{data.label}</p>
                <p className="text-xs text-gray-500">
                  {data.startDate} → {data.endDate}
                  {isFetching ? ' · refreshing…' : ''}
                </p>
              </div>
              <div className="text-right text-xs text-gray-600">
                <div>
                  <span className="font-semibold text-gray-900">{data.total.toLocaleString()}</span> reports
                </div>
                <div>
                  7d avg {formatCompact(data.trend.recentAvg)} · prior{' '}
                  {formatCompact(data.trend.priorAvg)}
                </div>
              </div>
            </div>
            <DailyReportsChart series={data.series} />
            <p className="mt-3 text-xs leading-relaxed text-gray-500">{data.disclaimer}</p>
            {data.lastUpdated && (
              <p className="mt-1 text-xs text-gray-400">openFDA last updated {data.lastUpdated}</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default MaudeTrends;
