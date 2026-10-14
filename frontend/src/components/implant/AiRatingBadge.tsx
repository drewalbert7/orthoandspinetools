type Props = {
  rating: number | null | undefined;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
};

/** Proprietary OST Directory Score 0–10 — catalog + community evidence, not clinical advice */
export function AiRatingBadge({
  rating,
  size = 'sm',
  showLabel = true,
  className = '',
}: Props) {
  if (rating == null || Number.isNaN(rating)) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md border border-dashed border-gray-200 bg-gray-50 text-gray-400 ${
          size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-1.5 py-0.5 text-[11px]'
        } ${className}`}
        title="Directory score pending"
      >
        <span className="font-semibold tabular-nums">—</span>
        {showLabel ? <span className="font-medium">Score</span> : null}
      </span>
    );
  }

  const value = Math.round(rating * 10) / 10;
  const tone =
    value >= 8.5
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : value >= 7.5
        ? 'border-blue-200 bg-blue-50 text-blue-800'
        : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-semibold tabular-nums ${tone} ${
        size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-1.5 py-0.5 text-[11px]'
      } ${className}`}
      title="OST Directory Score (0–10): catalog completeness + vote-weighted discussion. Not medical advice."
    >
      <span>{value.toFixed(1)}</span>
      {showLabel ? <span className="font-medium opacity-80">Score</span> : null}
    </span>
  );
}
