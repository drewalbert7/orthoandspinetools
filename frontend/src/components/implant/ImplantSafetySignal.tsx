import {
  SAFETY_SIGNAL_NOTE,
  confidenceLabel,
  isOpenFdaSourceUrl,
  pulledDateLabel,
  type SafetySignalPayload,
} from '../../lib/implantSafety';

function confidenceTone(c: SafetySignalPayload['confidence']): string {
  if (c === 'high') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (c === 'medium') return 'bg-blue-50 text-blue-800 ring-blue-200';
  if (c === 'low') return 'bg-amber-50 text-amber-800 ring-amber-200';
  return 'bg-gray-100 text-gray-600 ring-gray-200';
}

function Count({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded border border-gray-200 bg-white px-2 py-1.5">
      <p className="truncate text-[10px] text-gray-500" title={label}>{label}</p>
      <p className="text-sm font-semibold tabular-nums text-gray-900" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

/** Evidence block under the safety facet: confidence, severity counts, recalls, trend, sources. */
export function ImplantSafetySignal({ safety }: { safety: SafetySignalPayload }) {
  const c = safety.counts;
  const maxMonth = Math.max(1, ...safety.trend.months.map((m) => m.count));
  const sources = safety.sources.filter((s) => isOpenFdaSourceUrl(s.url));
  return (
    <div className="mt-2 space-y-2 rounded border border-gray-200 bg-white/60 p-2" data-testid="safety-signal">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${confidenceTone(safety.confidence)}`}
          data-testid="safety-confidence"
        >
          {confidenceLabel(safety.confidence)}
        </span>
        <span className="text-[11px] text-gray-500">
          {safety.windowStart} to {safety.windowEnd} · pulled {pulledDateLabel(safety.pulledAt)}
        </span>
      </div>

      <p className="text-[11px] leading-snug text-gray-600">{SAFETY_SIGNAL_NOTE}</p>

      {safety.notes.length > 0 ? (
        <p className="text-[11px] leading-snug text-gray-500">{safety.notes.join(' ')}</p>
      ) : null}

      <div className="grid grid-cols-3 gap-1.5">
        <Count label="Reports" value={c.total} testId="safety-count-total" />
        <Count label="Deaths" value={c.death} testId="safety-count-death" />
        <Count label="Injury" value={c.injury} testId="safety-count-injury" />
        <Count label="Malfunction" value={c.malfunction} testId="safety-count-malfunction" />
        <Count label="Breaks" value={c.breaks} testId="safety-count-breaks" />
        <Count label="Recalls, 5 yr" value={safety.recalls.length} testId="safety-count-recalls" />
      </div>

      {safety.trend.months.length > 0 ? (
        <div>
          <p className="text-[11px] text-gray-600">
            12-month trend: last 6 mo {safety.trend.recentTotal} vs earlier {safety.trend.priorTotal}
          </p>
          <div className="mt-1 flex h-8 items-end gap-0.5" aria-hidden="true">
            {safety.trend.months.map((m) => (
              <div
                key={m.month}
                title={`${m.month}: ${m.count}`}
                className="flex-1 rounded-sm bg-gray-400"
                style={{ height: `${Math.max(4, (m.count / maxMonth) * 100)}%` }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {safety.categories.length > 0 ? (
        <p className="text-[11px] leading-snug text-gray-600">
          Compared with FDA product code{safety.categories.length === 1 ? '' : 's'}{' '}
          {safety.categories
            .map((k) => `${k.code}${k.name ? ` (${k.name})` : ''}, ${Math.round(k.share * 100)}% of this device's reports`)
            .join('; ')}
          . Baseline {safety.categoryReports} reports across up to {safety.categoryBrands} brands.
          {safety.relative != null
            ? ` Severity vs baseline ${safety.relative.toFixed(2)}x after shrinkage (prior ${safety.priorStrength} reports).`
            : ''}
        </p>
      ) : null}

      {safety.recalls.length > 0 ? (
        <ul className="space-y-1" data-testid="safety-recalls">
          {safety.recalls.map((r) => (
            <li key={r.id} className="text-[11px] leading-snug text-gray-700">
              <span className="font-semibold">{r.classification}</span>
              {r.date ? ` ${r.date}` : ''}: {r.product}
              {r.reason ? `. ${r.reason}` : ''}{' '}
              {isOpenFdaSourceUrl(r.url) ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline-offset-2 hover:underline">
                  openFDA record
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {sources.length > 0 ? (
        <details className="text-[11px] text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-700">openFDA sources ({sources.length})</summary>
          <ul className="mt-1 space-y-0.5 break-all" data-testid="safety-sources">
            {sources.map((s) => (
              <li key={`${s.label}|${s.url}`}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline-offset-2 hover:underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
