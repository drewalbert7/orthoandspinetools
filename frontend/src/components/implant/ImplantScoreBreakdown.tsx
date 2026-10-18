import { ImplantSafetySignal } from './ImplantSafetySignal';
import { SAFETY_SIGNAL_LABEL, type SafetySignalPayload } from '../../lib/implantSafety';

export type ScoreFacet = {
  id: string;
  label: string;
  score: number | null;
  status?: string;
  detail: string;
};

export type ScoreBreakdownPayload = {
  version?: string;
  finalScore?: number;
  utilityScore?: number;
  catalogScore?: number;
  communityScore?: number | null;
  maudeScore?: number | null;
  maudeHazard?: number | null;
  maudeSignal?: string;
  summary?: string;
  facets?: ScoreFacet[];
  maude?: { safety?: SafetySignalPayload | null } | null;
};

function barTone(id: string, score: number | null, signal?: string): string {
  if (score == null) return 'bg-gray-200';
  if (id === 'maude') {
    if (signal === 'elevated') return 'bg-amber-500';
    if (signal === 'watch') return 'bg-amber-300';
    if (signal === 'quiet') return 'bg-emerald-500';
    return 'bg-gray-300';
  }
  if (score >= 7.5) return 'bg-emerald-500';
  if (score >= 6) return 'bg-blue-500';
  if (score >= 4.5) return 'bg-amber-400';
  return 'bg-orange-500';
}

function FacetRow({
  facet,
  maudeSignal,
  safety,
}: {
  facet: ScoreFacet;
  maudeSignal?: string;
  safety?: SafetySignalPayload | null;
}) {
  // MAUDE never shows a number without evidence: insufficient data, or an older stored
  // row without the safety signal evidence block, reads "Insufficient data".
  const insufficientMaude =
    facet.id === 'maude' &&
    (maudeSignal === 'insufficient' ||
      facet.status === 'Insufficient data' ||
      !safety ||
      safety.score == null);
  const score = insufficientMaude ? null : facet.score;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, (score / 10) * 100));
  const scoreText =
    score != null ? score.toFixed(1) : facet.id === 'maude' ? 'Insufficient data' : 'None yet';
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900">{facet.label}</p>
          {facet.status ? (
            <p className="text-[11px] text-gray-500">{facet.status}</p>
          ) : null}
        </div>
        <p
          className={`shrink-0 tabular-nums ${
            score == null && facet.id === 'maude'
              ? 'text-xs font-medium text-gray-500'
              : 'text-sm font-semibold text-gray-900'
          }`}
          data-testid={`facet-score-${facet.id}`}
        >
          {scoreText}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-[width] ${barTone(facet.id, score, maudeSignal)}`}
          style={{ width: score == null ? '0%' : `${pct}%` }}
        />
      </div>
      <p className="text-[11px] leading-snug text-gray-500">{facet.detail}</p>
      {facet.id === 'maude' && safety ? <ImplantSafetySignal safety={safety} /> : null}
    </div>
  );
}

type Props = {
  rating: number | null | undefined;
  breakdown?: ScoreBreakdownPayload | null;
  catalogScore?: number | null;
  communityScore?: number | null;
  utilityScore?: number | null;
  maudeScore?: number | null;
  maudeSignal?: string | null;
  ratingSampleN?: number | null;
  ratingVersion?: string | null;
  summary?: string | null;
};

/**
 * Transparent Directory Score facet panel: listing, discussion, Reported safety signal, summary.
 */
export function ImplantScoreBreakdown({
  rating,
  breakdown,
  catalogScore,
  communityScore,
  utilityScore,
  maudeScore,
  maudeSignal,
  ratingSampleN,
  ratingVersion,
  summary,
}: Props) {
  const facets: ScoreFacet[] =
    breakdown?.facets?.filter((f) => f.id !== 'summary' && f.id !== 'utility') ||
    [
      {
        id: 'listing',
        label: 'Listing quality',
        score: catalogScore ?? null,
        detail: 'Profile completeness (verification, media, technique guide).',
      },
      {
        id: 'discussion',
        label: 'Surgeon discussion',
        score: communityScore ?? null,
        detail:
          ratingSampleN && ratingSampleN > 0
            ? `Vote-weighted comments · n≈${ratingSampleN}`
            : 'No weighted discussion yet.',
      },
      {
        id: 'maude',
        label: SAFETY_SIGNAL_LABEL,
        score: maudeScore ?? null,
        status: maudeSignal || undefined,
        detail: 'Severity-weighted MAUDE reports and recalls vs the FDA product-code category.',
      },
    ];

  const final = rating ?? breakdown?.finalScore ?? null;
  const util = utilityScore ?? breakdown?.utilityScore ?? null;
  const signal = maudeSignal || breakdown?.maudeSignal || undefined;
  const blurb = summary || breakdown?.summary || null;
  const version = ratingVersion || breakdown?.version || 'ost-dir-v3';
  const safety = breakdown?.maude?.safety ?? null;
  const facetsShown = facets.map((f) =>
    f.id === 'maude' ? { ...f, label: SAFETY_SIGNAL_LABEL } : f
  );

  return (
    <section
      id="directory-score"
      className="mt-4 scroll-mt-24 rounded-md border border-gray-200 bg-gray-50/80 p-3 sm:p-4"
      aria-label="Directory Score breakdown"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Directory Score breakdown</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Utility from listing and discussion; the FDA safety signal can pull the summary down.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-gray-900">
            {final != null ? final.toFixed(1) : 'None'}
            <span className="text-sm font-semibold text-gray-500"> / 10</span>
          </p>
          <p className="text-[10px] uppercase tracking-wide text-gray-400">{version}</p>
        </div>
      </div>

      {signal && signal !== 'unlinked' ? (
        <p
          className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            signal === 'elevated'
              ? 'bg-amber-100 text-amber-900'
              : signal === 'watch'
                ? 'bg-amber-50 text-amber-800'
                : signal === 'quiet'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-gray-100 text-gray-600'
          }`}
        >
          Safety signal:{' '}
          {signal === 'insufficient' || !safety || safety.score == null
            ? 'Insufficient data'
            : signal === 'elevated'
              ? 'elevated vs category'
              : signal === 'watch'
                ? 'watch'
                : 'not elevated'}
        </p>
      ) : signal === 'unlinked' ? (
        <p className="mt-2 text-[11px] font-medium text-gray-500">MAUDE brand key not linked</p>
      ) : null}

      <div className="mt-3 space-y-3">
        {facetsShown.map((f) => (
          <FacetRow key={f.id} facet={f} maudeSignal={signal} safety={safety} />
        ))}
      </div>

      {util != null ? (
        <p className="mt-3 text-[11px] tabular-nums text-gray-500">
          Utility (pre-hazard): {util.toFixed(1)}
          {final != null && signal && signal !== 'unlinked' && signal !== 'insufficient'
            ? `, summary ${final.toFixed(1)} after the safety signal`
            : null}
        </p>
      ) : null}

      {blurb ? (
        <p className="mt-2 text-[11px] leading-snug text-gray-500">{blurb}</p>
      ) : (
        <p className="mt-2 text-[11px] leading-snug text-gray-400">
          Editorial composite for directory ranking, not medical advice, incidence rates, or an FDA
          judgment.
        </p>
      )}

      <p className="mt-2 text-[11px]">
        <a
          href="/implants/methodology"
          className="text-blue-600 hover:text-blue-800 underline-offset-2 hover:underline"
        >
          How the Directory Score and safety signal work
        </a>
      </p>
    </section>
  );
}
