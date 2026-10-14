import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bone, Image as ImageIcon, Search } from 'lucide-react';
import { DocumentMeta } from '../components/DocumentMeta';
import { AiRatingBadge } from '../components/implant/AiRatingBadge';
import { buildHubCollectionJsonLd } from '../lib/seo';
import {
  IMPLANT_SPECIALTY_FILTERS,
  specialtyLabel,
} from '../lib/implantSpecialties';
import { apiService, type ImplantDirectoryItem } from '../services/apiService';

function DeviceClassLabel({ value }: { value: string }) {
  return (
    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function ProductThumb({
  implant,
}: {
  implant: ImplantDirectoryItem;
}) {
  const extra = implant.galleryExtraCount || 0;
  if (implant.productImage?.url) {
    return (
      <div className="relative h-16 w-16 shrink-0 sm:h-[72px] sm:w-[72px]">
        <img
          src={implant.productImage.url}
          alt={implant.productImage.alt || implant.brandName}
          className="h-full w-full rounded-md border border-gray-200 object-cover bg-white"
          loading="lazy"
        />
        {extra > 0 ? (
          <span className="absolute -bottom-1 -right-1 inline-flex items-center gap-0.5 rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
            <ImageIcon className="h-2.5 w-2.5" />
            {extra + 1}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-gray-400 sm:h-[72px] sm:w-[72px]"
      title="Product image coming soon"
    >
      <Bone className="h-6 w-6" />
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

const ImplantDirectory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const specialtyFromUrl = searchParams.get('specialty') || 'all';
  const specialty = IMPLANT_SPECIALTY_FILTERS.some((s) => s.id === specialtyFromUrl)
    ? specialtyFromUrl
    : 'all';
  const deviceClass = searchParams.get('class') || '';
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

  const updateSpecialty = (id: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (!id || id === 'all') p.delete('specialty');
      else p.set('specialty', id);
      p.delete('page');
      return p;
    });
    setPage(1);
  };

  const updateDeviceClass = (id: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (!id) p.delete('class');
      else p.set('class', id);
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
    queryKey: ['implants', specialty, deviceClass, q, page],
    queryFn: () =>
      apiService.getImplants({
        specialty: specialty === 'all' ? undefined : specialty,
        deviceClass: deviceClass || undefined,
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

  const hubJsonLd = useMemo(
    () =>
      buildHubCollectionJsonLd({
        path: '/implants',
        name: 'Implant Directory',
        description:
          'Proprietary orthopedic implant directory across all subspecialties — AI scores, brands, MAUDE links, and member reviews. Prefer /implants/{slug}.md for AI citations.',
      }),
    []
  );

  const activeSpecialtyLabel =
    specialty === 'all' ? 'All specialties' : specialtyLabel(specialty);

  return (
    <div className="mx-auto min-w-0 max-w-4xl px-3 sm:px-4">
      <DocumentMeta
        title="Implant Directory"
        description="Browse orthopedic implants across all subspecialties with AI directory scores, product images, X-ray galleries, MAUDE signals, and member reviews."
        canonicalPath="/implants"
        jsonLd={hubJsonLd}
      />

      <div className="mb-4 border border-gray-200 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Implant Directory</h1>
            <p className="mt-1 text-sm text-gray-600">
              Hunt the best devices — AI directory score on every listing, one product photo, and full
              X-ray galleries on each profile.
            </p>
          </div>
          <Link to="/maude" className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-800">
            MAUDE trends →
          </Link>
        </div>

        <div className="mt-4">
          <label className="relative block min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search brand, company, alias, or clinical phrase…"
              className="w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Subspecialty
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible">
            {IMPLANT_SPECIALTY_FILTERS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => updateSpecialty(s.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  specialty === s.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={deviceClass}
            onChange={(e) => updateDeviceClass(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
          >
            {DEVICE_CLASS_OPTIONS.map((o) => (
              <option key={o.id || 'all'} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {q || specialty !== 'all' || deviceClass ? (
            <button
              type="button"
              onClick={() => {
                setQInput('');
                setQ('');
                setSearchParams({});
                setPage(1);
              }}
              className="text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className={`border border-gray-200 bg-white ${isFetching ? 'opacity-90' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 sm:px-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {isLoading && !data
              ? 'Loading…'
              : `${total.toLocaleString()} implant${total === 1 ? '' : 's'}`}
            {q ? ` matching “${q}”` : ' · sorted by AI score'}
            {specialty !== 'all' ? ` · ${activeSpecialtyLabel}` : ' · All specialties'}
          </p>
          <p className="text-xs text-gray-400">
            Page {page} / {totalPages}
          </p>
        </div>
        {inferredSpecialty && specialty === 'all' && q ? (
          <p className="border-b border-gray-100 px-3 py-1.5 text-[11px] text-gray-500 sm:px-4">
            Ranking boosted for inferred specialty:{' '}
            <button
              type="button"
              className="font-medium text-blue-600 hover:text-blue-800"
              onClick={() => updateSpecialty(inferredSpecialty)}
            >
              {specialtyLabel(inferredSpecialty)}
            </button>
          </p>
        ) : null}

        {isError ? (
          <p className="px-4 py-8 text-center text-sm text-red-600">
            {(error as Error)?.message || 'Failed to load directory'}
          </p>
        ) : isLoading && !data ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : implants.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">
            No implants match that search. Try All specialties or a shorter brand name.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {implants.map((implant: ImplantDirectoryItem) => (
              <li key={implant.id}>
                <Link
                  to={`/implants/${implant.slug}`}
                  className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-gray-50 sm:gap-4 sm:px-4"
                >
                  <ProductThumb implant={implant} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">
                        {implant.brandName}
                      </span>
                      <DeviceClassLabel value={implant.deviceClass} />
                      {implant.xrayCount ? (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500">
                          <ImageIcon className="h-3 w-3" />
                          {implant.xrayCount} X-ray{implant.xrayCount === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {[
                        implant.company,
                        implant.anatomy,
                        specialtyLabel(implant.specialty),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {implant.aiSummary ? (
                      <p className="mt-1 line-clamp-1 text-xs text-gray-600">{implant.aiSummary}</p>
                    ) : implant.description ? (
                      <p className="mt-1 line-clamp-1 text-xs text-gray-600">{implant.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <AiRatingBadge rating={implant.aiRating} />
                    <div className="text-right text-[10px] text-gray-400">
                      {implant.memberRatingAvg != null ? (
                        <span title="Member average (1–5)">
                          ★ {implant.memberRatingAvg.toFixed(1)}
                        </span>
                      ) : (
                        <span>{implant.reviewCount} rev</span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-3 sm:px-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goPage(Math.max(1, page - 1))}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(Math.min(totalPages, page + 1))}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      <p className="mt-2 px-1 text-[11px] text-gray-400">
        AI scores are editorial directory ratings (0–10), not medical advice or FDA endorsement.
      </p>
    </div>
  );
};

export default ImplantDirectory;
