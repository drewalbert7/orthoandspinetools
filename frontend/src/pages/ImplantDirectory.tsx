import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Bone, ChevronsUpDown, Image as ImageIcon, Search } from 'lucide-react';
import { DocumentMeta } from '../components/DocumentMeta';
import { AiRatingBadge } from '../components/implant/AiRatingBadge';
import { TechniqueGuideLink } from '../components/implant/TechniqueGuideLink';
import { isTechniqueGuidePdfUrl } from '../lib/techniqueGuide';
import { buildHubCollectionJsonLd } from '../lib/seo';
import {
  IMPLANT_SPECIALTY_FILTERS,
  specialtyLabel,
} from '../lib/implantSpecialties';
import { apiService, type ImplantDirectoryItem } from '../services/apiService';

/** Compact Direct-Care-style control — scoped to Implant Directory only */
const filterControlClass =
  'h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-800 shadow-none focus:border-gray-400 focus:outline-none focus:ring-0 sm:h-9';

function FilterSelect({
  value,
  onChange,
  children,
  'aria-label': ariaLabel,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  'aria-label': string;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={filterControlClass}
      >
        {children}
      </select>
      <ChevronsUpDown
        className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
        aria-hidden
      />
    </div>
  );
}

function DeviceClassLabel({ value }: { value: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-600 bg-gray-100">
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function ProductThumb({ implant }: { implant: ImplantDirectoryItem }) {
  const extra = implant.galleryExtraCount || 0;
  if (implant.productImage?.url) {
    return (
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50 sm:h-[3.25rem] sm:w-[3.25rem]">
        <img
          src={implant.productImage.url}
          alt={implant.productImage.alt || implant.brandName}
          className="h-full w-full object-contain p-0.5"
          loading="lazy"
        />
        {extra > 0 ? (
          <span
            className="absolute bottom-0.5 right-0.5 inline-flex items-center gap-0.5 rounded bg-gray-900/85 px-1 py-px text-[9px] font-semibold tabular-nums text-white"
            title={`${extra + 1} images`}
          >
            <ImageIcon className="h-2.5 w-2.5" aria-hidden />
            {extra + 1}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-gray-400 sm:h-[3.25rem] sm:w-[3.25rem]"
      title="Product image coming soon"
    >
      <Bone className="h-5 w-5" />
    </div>
  );
}

const PAGE_SIZE = 24;

const DEVICE_CLASS_OPTIONS = [
  { id: '', label: 'All classes' },
  { id: 'cervical_disc', label: 'Cervical disc' },
  { id: 'pedicle_screw', label: 'Pedicle screw' },
  { id: 'biologic', label: 'Biologic' },
  { id: 'cellular_allograft', label: 'Cellular allograft' },
  { id: 'tka', label: 'TKA' },
  { id: 'tha', label: 'THA' },
  { id: 'shoulder_arthroplasty', label: 'Shoulder arthroplasty' },
  { id: 'suture_anchor', label: 'Suture anchor' },
  { id: 'intramedullary_nail', label: 'IM nail' },
  { id: 'total_ankle', label: 'Total ankle' },
  { id: 'druj_prosthesis', label: 'DRUJ prosthesis' },
  { id: 'pediatric_plate', label: 'Pediatric plate' },
  { id: 'megaprosthesis', label: 'Megaprosthesis' },
];

const SORT_OPTIONS = [
  { id: 'ai', label: 'sort: Directory Score' },
  { id: 'name', label: 'sort: name' },
  { id: 'reviews', label: 'sort: discussion' },
] as const;

const ImplantDirectory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const specialtyFromUrl = searchParams.get('specialty') || 'all';
  const specialty = IMPLANT_SPECIALTY_FILTERS.some((s) => s.id === specialtyFromUrl)
    ? specialtyFromUrl
    : 'all';
  const deviceClass = searchParams.get('class') || '';
  const verified = searchParams.get('verified') === '1';
  const sortFromUrl = searchParams.get('sort') || 'ai';
  const sort =
    sortFromUrl === 'name' || sortFromUrl === 'reviews' ? sortFromUrl : 'ai';
  const qFromUrl = searchParams.get('q') || '';
  const pageFromUrl = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const [qInput, setQInput] = useState(qFromUrl);
  const [q, setQ] = useState(qFromUrl);
  const [page, setPage] = useState(pageFromUrl);

  useEffect(() => {
    setQInput(qFromUrl);
    setQ(qFromUrl);
  }, [qFromUrl]);

  useEffect(() => {
    setPage(pageFromUrl);
  }, [pageFromUrl]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = qInput.trim();
      setQ(next);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set('q', next);
          else p.delete('q');
          p.delete('page');
          return p;
        },
        { replace: true }
      );
    }, 300);
    return () => window.clearTimeout(t);
  }, [qInput, setSearchParams]);

  const patchParams = (mutate: (p: URLSearchParams) => void) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      mutate(p);
      p.delete('page');
      return p;
    });
    setPage(1);
  };

  const goPage = (next: number) => {
    setPage(next);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next <= 1) p.delete('page');
      else p.set('page', String(next));
      return p;
    });
  };

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['implants', specialty, deviceClass, verified, sort, q, page],
    queryFn: () =>
      apiService.getImplants({
        specialty: specialty === 'all' ? undefined : specialty,
        deviceClass: deviceClass || undefined,
        verified: verified || undefined,
        sort,
        q: q || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const implants = data?.implants || [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const inferredSpecialty = data?.inferredSpecialty || null;
  const hasFilters = Boolean(q || specialty !== 'all' || deviceClass || verified || sort !== 'ai');

  const hubJsonLd = useMemo(
    () =>
      buildHubCollectionJsonLd({
        path: '/implants',
        name: 'Implant Directory',
        description:
          'Proprietary orthopedic implant directory across all subspecialties — Directory Scores, brands, MAUDE links, and discussion.',
      }),
    []
  );

  return (
    <div className="mx-auto min-w-0 max-w-4xl px-3 pb-8 sm:px-4">
      <DocumentMeta
        title="Implant Directory"
        description="Browse orthopedic implants across all subspecialties with proprietary Directory Scores, surgical technique PDFs when available, product photos, MAUDE signals, and discussion."
        canonicalPath="/implants"
        jsonLd={hubJsonLd}
      />

      <div className="mb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl sm:text-[1.65rem]">
            Implant Directory
          </h1>
          <Link
            to="/maude"
            className="touch-target inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            MAUDE trends →
          </Link>
        </div>
        <p className="mt-1 text-sm leading-snug text-gray-500">
          <span className="sm:hidden">
            Directory Score · technique PDF · photos ·{' '}
            <Link to="/maude" className="text-gray-600 underline-offset-2 hover:underline">
              openFDA
            </Link>
          </span>
          <span className="hidden sm:inline">
            Directory Score on every listing · surgical technique PDF when linked · product photo · X-ray /
            diagram when we have them ·{' '}
            <Link to="/maude" className="text-gray-600 underline-offset-2 hover:underline">
              openFDA trends
            </Link>
          </span>
        </p>

        <div className="mt-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search brand, company, alias…"
              enterKeyHint="search"
              className="h-10 w-full rounded-md border border-gray-300 bg-white py-0 pl-8 pr-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0 sm:h-9 sm:max-w-xl sm:text-sm"
            />
          </label>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <FilterSelect
            aria-label="Specialty"
            className="sm:w-auto sm:min-w-[9.5rem]"
            value={specialty}
            onChange={(id) =>
              patchParams((p) => {
                if (!id || id === 'all') p.delete('specialty');
                else p.set('specialty', id);
              })
            }
          >
            {IMPLANT_SPECIALTY_FILTERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            aria-label="Device class"
            className="sm:w-auto sm:min-w-[9.5rem]"
            value={deviceClass}
            onChange={(id) =>
              patchParams((p) => {
                if (!id) p.delete('class');
                else p.set('class', id);
              })
            }
          >
            {DEVICE_CLASS_OPTIONS.map((o) => (
              <option key={o.id || 'all'} value={o.id}>
                {o.label}
              </option>
            ))}
          </FilterSelect>

          <button
            type="button"
            disabled={(data?.verifiedCount ?? 0) === 0 && !verified}
            title={
              (data?.verifiedCount ?? 0) === 0 && !verified
                ? 'No verified listings yet'
                : `${data?.verifiedCount ?? 0} verified`
            }
            onClick={() =>
              patchParams((p) => {
                if (verified) p.delete('verified');
                else p.set('verified', '1');
              })
            }
            className={`h-10 shrink-0 rounded-md border px-3 text-xs font-semibold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-45 sm:h-9 ${
              verified
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            aria-pressed={verified}
          >
            Verified
            {(data?.verifiedCount ?? 0) > 0 ? (
              <span className="ml-1 tabular-nums opacity-80">{data!.verifiedCount}</span>
            ) : null}
          </button>

          <FilterSelect
            aria-label="Sort"
            className="sm:w-auto sm:min-w-[9.5rem]"
            value={sort}
            onChange={(id) =>
              patchParams((p) => {
                if (!id || id === 'ai') p.delete('sort');
                else p.set('sort', id);
              })
            }
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </FilterSelect>

          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setQInput('');
                setQ('');
                setSearchParams({});
                setPage(1);
              }}
              className="col-span-2 h-10 px-1 text-left text-xs font-medium text-gray-500 hover:text-gray-800 sm:col-span-1 sm:h-9 sm:text-center"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className={`overflow-hidden rounded-md border border-gray-200 bg-white ${isFetching ? 'opacity-90' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
          <p className="min-w-0 text-xs text-gray-500 [overflow-wrap:anywhere]">
            {isLoading && !data
              ? 'Loading…'
              : `${total.toLocaleString()} implant${total === 1 ? '' : 's'}`}
            {q ? ` matching “${q}”` : ''}
            {verified ? ' · verified only' : ''}
          </p>
          {totalPages > 1 ? (
            <p className="shrink-0 text-xs tabular-nums text-gray-400">
              {page} / {totalPages}
            </p>
          ) : null}
        </div>
        {inferredSpecialty && specialty === 'all' && q ? (
          <p className="border-b border-gray-100 px-3 py-1.5 text-[11px] text-gray-500">
            Boosted for{' '}
            <button
              type="button"
              className="font-medium text-blue-600 hover:text-blue-800"
              onClick={() =>
                patchParams((p) => {
                  p.set('specialty', inferredSpecialty);
                })
              }
            >
              {specialtyLabel(inferredSpecialty)}
            </button>
          </p>
        ) : null}

        {isError ? (
          <p className="px-3 py-6 text-center text-sm text-red-600">
            {(error as Error)?.message || 'Failed to load directory'}
          </p>
        ) : isLoading && !data ? (
          <div className="space-y-1 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : implants.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-gray-500">
            No implants match. Try All specialties or clear Verified.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {implants.map((implant: ImplantDirectoryItem) => {
              const commentCount = implant.commentCount ?? implant.reviewCount ?? 0;
              const hasStg = isTechniqueGuidePdfUrl(implant.techniqueGuideUrl);
              const subtitle = [
                implant.company,
                specialtyLabel(implant.specialty),
                // Device class only in subtitle on small screens (badge shows it on sm+)
                implant.deviceClass.replace(/_/g, ' '),
              ].filter(Boolean);

              return (
                <li key={implant.id}>
                  <div className="group flex items-center gap-2 px-2.5 transition-colors hover:bg-gray-50 sm:gap-3 sm:px-3">
                    <Link
                      to={`/implants/${implant.slug}`}
                      className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 sm:gap-3"
                    >
                      <ProductThumb implant={implant} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-gray-900 group-hover:text-blue-800">
                            {implant.brandName}
                          </span>
                          {implant.status === 'verified' ? (
                            <BadgeCheck
                              className="h-3.5 w-3.5 shrink-0 text-blue-600"
                              aria-label="Verified listing"
                            />
                          ) : null}
                          <span className="hidden min-w-0 sm:inline">
                            <DeviceClassLabel value={implant.deviceClass} />
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          <span className="sm:hidden">{subtitle.join(' · ')}</span>
                          <span className="hidden sm:inline">
                            {[implant.company, specialtyLabel(implant.specialty)]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </p>
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5 self-center py-2 sm:gap-2">
                      {hasStg ? (
                        <TechniqueGuideLink
                          url={implant.techniqueGuideUrl!}
                          title={implant.techniqueGuideTitle}
                          compact
                        />
                      ) : null}
                      <div className="flex min-w-[2.75rem] flex-col items-end gap-0.5">
                        <AiRatingBadge rating={implant.aiRating} showLabel={false} />
                        {implant.memberRatingAvg != null ? (
                          <span className="hidden text-[10px] tabular-nums text-gray-400 sm:inline">
                            ★ {implant.memberRatingAvg.toFixed(1)}
                          </span>
                        ) : commentCount > 0 ? (
                          <span className="hidden text-[10px] tabular-nums text-gray-400 sm:inline">
                            {commentCount} comment{commentCount === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-2.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goPage(Math.max(1, page - 1))}
              className="touch-target min-h-10 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(Math.min(totalPages, page + 1))}
              className="touch-target min-h-10 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      <p className="mt-2 px-0.5 text-[11px] leading-snug text-gray-400">
        Directory Scores are editorial (0–10), not medical advice or FDA endorsement.{' '}
        <Link to="/implants/methodology" className="underline hover:text-gray-600">
          How it works →
        </Link>
      </p>
    </div>
  );
};

export default ImplantDirectory;
