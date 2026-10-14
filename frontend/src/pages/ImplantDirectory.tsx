import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bone, Search } from 'lucide-react';
import { DocumentMeta } from '../components/DocumentMeta';
import { buildHubCollectionJsonLd } from '../lib/seo';
import { apiService, type ImplantDirectoryItem } from '../services/apiService';

function DeviceClassLabel({ value }: { value: string }) {
  return (
    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function ImplantThumb({
  image,
  label,
}: {
  image?: { url: string; alt?: string | null } | null;
  label: string;
}) {
  if (image?.url) {
    return (
      <img
        src={image.url}
        alt={image.alt || label}
        className="h-14 w-14 shrink-0 rounded-md border border-gray-200 object-cover bg-white"
        loading="lazy"
      />
    );
  }
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-gray-400"
      title={`${label} image coming soon`}
    >
      <Bone className="h-5 w-5" />
    </div>
  );
}

const ImplantDirectory: React.FC = () => {
  const [q, setQ] = useState('');
  const [specialty, setSpecialty] = useState('spine');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['implants', specialty, q],
    queryFn: () =>
      apiService.getImplants({
        specialty: specialty || undefined,
        q: q.trim() || undefined,
        limit: 50,
      }),
    staleTime: 60_000,
  });

  const implants = data?.implants || [];

  const hubJsonLd = useMemo(
    () =>
      buildHubCollectionJsonLd({
        path: '/implants',
        name: 'Implant Directory',
        description:
          'Proprietary orthopedic and spine implant directory — brands, anatomy, MAUDE links, and member reviews.',
      }),
    []
  );

  return (
    <div className="mx-auto min-w-0 max-w-4xl px-3 sm:px-4">
      <DocumentMeta
        title="Implant Directory"
        description="Browse spine and orthopedic implants — product identity, in-vivo X-ray references, MAUDE signals, and member reviews."
        canonicalPath="/implants"
        jsonLd={hubJsonLd}
      />

      <div className="mb-4 border border-gray-200 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Implant Directory</h1>
            <p className="mt-1 text-sm text-gray-600">
              Growing proprietary catalog of implant systems. Public browse;{' '}
              <span className="font-medium text-gray-800">reviews are members-only</span>. Product and X-ray
              imagery, MAUDE linkage, and AI assessments expand over time.
            </p>
          </div>
          <Link
            to="/maude"
            className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            MAUDE trends →
          </Link>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search brand, company, alias…"
              className="w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
          >
            <option value="spine">Spine</option>
            <option value="">All specialties</option>
          </select>
        </div>
      </div>

      <div className="border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 sm:px-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {isLoading ? 'Loading…' : `${implants.length} implant${implants.length === 1 ? '' : 's'}`}
          </p>
          <p className="text-xs text-gray-400">Shell catalog — more systems coming</p>
        </div>

        {isError ? (
          <p className="px-4 py-8 text-center text-sm text-red-600">
            {(error as Error)?.message || 'Failed to load directory'}
          </p>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : implants.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">No implants match that search.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {implants.map((implant: ImplantDirectoryItem) => (
              <li key={implant.id}>
                <Link
                  to={`/implants/${implant.slug}`}
                  className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-gray-50 sm:gap-4 sm:px-4"
                >
                  <div className="flex gap-1.5">
                    <ImplantThumb image={implant.productImage} label="Product" />
                    <ImplantThumb image={implant.xrayImage} label="X-ray" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">
                        {implant.brandName}
                      </span>
                      <DeviceClassLabel value={implant.deviceClass} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {[implant.company, implant.anatomy, implant.specialty].filter(Boolean).join(' · ')}
                    </p>
                    {implant.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-600">{implant.description}</p>
                    ) : null}
                  </div>
                  <div className="hidden shrink-0 text-right text-xs text-gray-500 sm:block">
                    <div className="font-semibold tabular-nums text-gray-800">{implant.reviewCount}</div>
                    <div>reviews</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ImplantDirectory;
