import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bone } from 'lucide-react';
import { DocumentMeta } from '../components/DocumentMeta';
import { useAuth } from '../contexts/AuthContext';
import { IMPLANT_SPECIALTIES } from '../lib/implantSpecialties';
import { apiService } from '../services/apiService';

const ImplantDetail: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({
    brandName: '',
    systemName: '',
    company: '',
    specialty: 'spine',
    anatomy: '',
    deviceClass: '',
    description: '',
    longDescription: '',
    maudeBrandKey: '',
    status: 'published',
    aliases: '',
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['implant', slug, user?.id || 'anon'],
    queryFn: () => apiService.getImplant(slug),
    enabled: Boolean(slug),
  });

  useEffect(() => {
    if (!data) return;
    setAdminForm({
      brandName: data.brandName || '',
      systemName: data.systemName || '',
      company: data.company || '',
      specialty: data.specialty || 'spine',
      anatomy: data.anatomy || '',
      deviceClass: data.deviceClass || '',
      description: data.description || '',
      longDescription: data.longDescription || '',
      maudeBrandKey: data.maudeBrandKey || '',
      status: data.status || 'published',
      aliases: (data.aliases || []).join(', '),
    });
  }, [data]);

  const reviewMutation = useMutation({
    mutationFn: () =>
      apiService.upsertImplantReview(slug, {
        rating,
        title: title.trim() || undefined,
        body: body.trim(),
      }),
    onSuccess: () => {
      toast.success('Review saved');
      setBody('');
      setTitle('');
      queryClient.invalidateQueries({ queryKey: ['implant', slug] });
      queryClient.invalidateQueries({ queryKey: ['implants'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const adminMutation = useMutation({
    mutationFn: () =>
      apiService.updateImplantAdmin(slug, {
        brandName: adminForm.brandName.trim(),
        systemName: adminForm.systemName.trim() || null,
        company: adminForm.company.trim() || null,
        specialty: adminForm.specialty,
        anatomy: adminForm.anatomy.trim() || null,
        deviceClass: adminForm.deviceClass.trim(),
        description: adminForm.description.trim() || null,
        longDescription: adminForm.longDescription.trim() || null,
        maudeBrandKey: adminForm.maudeBrandKey.trim() || null,
        status: adminForm.status,
        aliases: adminForm.aliases
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.success('Implant updated');
      queryClient.invalidateQueries({ queryKey: ['implant', slug] });
      queryClient.invalidateQueries({ queryKey: ['implants'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const jsonLd = useMemo(() => {
    if (!data) return undefined;
    const origin = 'https://orthoandspinetools.com';
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'MedicalDevice',
          '@id': `${origin}/implants/${data.slug}#device`,
          name: data.brandName,
          alternateName: data.aliases?.length ? data.aliases : undefined,
          description: data.seoDescription || data.description || undefined,
          manufacturer: data.company
            ? { '@type': 'Organization', name: data.company }
            : undefined,
          url: `${origin}/implants/${data.slug}`,
          sameAs: [`${origin}/implants/${data.slug}.md`],
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Home',
              item: origin,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'Implant Directory',
              item: `${origin}/implants`,
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: data.brandName,
              item: `${origin}/implants/${data.slug}`,
            },
          ],
        },
      ],
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-3 py-10 text-center text-sm text-gray-500 sm:px-4">
        Loading implant…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-4xl px-3 py-10 text-center sm:px-4">
        <p className="text-sm text-red-600">{(error as Error)?.message || 'Implant not found'}</p>
        <Link to="/implants" className="mt-3 inline-block text-sm font-medium text-blue-600">
          ← Implant Directory
        </Link>
      </div>
    );
  }

  const pageTitle = data.seoTitle || `${data.brandName} · Implant Directory`;
  const pageDescription =
    data.seoDescription ||
    data.description ||
    `${data.brandName}${data.company ? ` by ${data.company}` : ''} — implant profile on OrthoAndSpineTools.`;

  return (
    <div className="mx-auto min-w-0 max-w-4xl px-3 sm:px-4">
      <DocumentMeta
        title={pageTitle}
        description={pageDescription}
        canonicalPath={`/implants/${data.slug}`}
        jsonLd={jsonLd}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link to="/implants" className="font-medium text-blue-600 hover:text-blue-800">
          ← Implant Directory
        </Link>
        <a
          href={`/implants/${data.slug}.md`}
          className="font-mono text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          /implants/{data.slug}.md
        </a>
      </div>

      <div className="mb-4 border border-gray-200 bg-white p-3 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex gap-2">
            {[data.productImage, data.xrayImage].map((img, idx) =>
              img?.url ? (
                <figure key={idx} className="m-0">
                  <img
                    src={img.url}
                    alt={img.alt || data.brandName}
                    className="h-28 w-28 rounded-md border border-gray-200 object-cover bg-white"
                  />
                  <figcaption className="mt-1 text-center text-[10px] text-gray-400">
                    {idx === 0 ? 'Product' : 'X-ray'}
                  </figcaption>
                </figure>
              ) : (
                <div
                  key={idx}
                  className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-200 bg-gray-50 text-gray-400"
                >
                  <Bone className="h-6 w-6" />
                  <span className="text-[10px]">{idx === 0 ? 'Product' : 'X-ray'}</span>
                </div>
              )
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-gray-900">{data.brandName}</h1>
            {data.systemName ? (
              <p className="mt-0.5 text-sm text-gray-600">{data.systemName}</p>
            ) : null}
            <p className="mt-2 text-sm text-gray-500">
              {[data.company, data.anatomy, data.specialty, data.deviceClass.replace(/_/g, ' ')]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {(data.longDescription || data.description) && (
              <p className="mt-3 text-sm leading-relaxed text-gray-700">
                {data.longDescription || data.description}
              </p>
            )}
            {data.aliases?.length ? (
              <p className="mt-2 text-xs text-gray-500">Also known as: {data.aliases.join(', ')}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {data.maudeBrandKey ? (
                <Link
                  to={`/maude?brand=${encodeURIComponent(data.maudeBrandKey)}&specialty=spine`}
                  className="font-medium text-blue-600 hover:text-blue-800"
                >
                  View MAUDE trends →
                </Link>
              ) : null}
              <span className="text-gray-500">
                {data.reviewCount} member review{data.reviewCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        {(data.indications || data.contraindications) && (
          <div className="mt-5 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
            {data.indications ? (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Indications (directory notes)
                </h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{data.indications}</p>
              </div>
            ) : null}
            {data.contraindications ? (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Caveats (directory notes)
                </h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{data.contraindications}</p>
              </div>
            ) : null}
          </div>
        )}

        {data.images?.some((i) => i.attribution || i.licenseNote) ? (
          <p className="mt-4 text-[11px] text-gray-400">
            Image rights:{' '}
            {data.images
              .filter((i) => i.attribution || i.licenseNote)
              .map((i) => [i.kind, i.attribution, i.licenseNote].filter(Boolean).join(' · '))
              .join(' · ')}
          </p>
        ) : null}
      </div>

      {user?.isAdmin ? (
        <div className="mb-4 border border-amber-200 bg-amber-50/40 p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Admin — edit listing</h2>
            <button
              type="button"
              onClick={() => setAdminOpen((v) => !v)}
              className="text-xs font-medium text-amber-800 hover:text-amber-950"
            >
              {adminOpen ? 'Hide' : 'Edit fields'}
            </button>
          </div>
          {adminOpen ? (
            <form
              className="mt-3 grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!adminForm.brandName.trim() || !adminForm.deviceClass.trim()) {
                  toast.error('Brand name and device class are required');
                  return;
                }
                adminMutation.mutate();
              }}
            >
              {(
                [
                  ['brandName', 'Brand name'],
                  ['systemName', 'System name'],
                  ['company', 'Company'],
                  ['anatomy', 'Anatomy'],
                  ['deviceClass', 'Device class'],
                  ['maudeBrandKey', 'MAUDE brand key'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs text-gray-600">
                  {label}
                  <input
                    value={adminForm[key]}
                    onChange={(e) => setAdminForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-900"
                  />
                </label>
              ))}
              <label className="text-xs text-gray-600">
                Specialty
                <select
                  value={adminForm.specialty}
                  onChange={(e) => setAdminForm((f) => ({ ...f, specialty: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                >
                  {IMPLANT_SPECIALTIES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                Status
                <select
                  value={adminForm.status}
                  onChange={(e) => setAdminForm((f) => ({ ...f, status: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="verified">verified</option>
                </select>
              </label>
              <label className="text-xs text-gray-600 sm:col-span-2">
                Aliases (comma-separated)
                <input
                  value={adminForm.aliases}
                  onChange={(e) => setAdminForm((f) => ({ ...f, aliases: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-gray-600 sm:col-span-2">
                Short description
                <textarea
                  value={adminForm.description}
                  onChange={(e) => setAdminForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-gray-600 sm:col-span-2">
                Long description (AI SEO body)
                <textarea
                  value={adminForm.longDescription}
                  onChange={(e) => setAdminForm((f) => ({ ...f, longDescription: e.target.value }))}
                  rows={4}
                  className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={adminMutation.isPending}
                  className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
                >
                  {adminMutation.isPending ? 'Saving…' : 'Save implant'}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 border border-gray-200 bg-white p-3 sm:p-5">
        <h2 className="text-sm font-semibold text-gray-900">Reviews</h2>
        <p className="mt-1 text-xs text-gray-500">Anyone can read. Log in to rate or write.</p>

        {user ? (
          <form
            className="mt-3 space-y-2 border-b border-gray-100 pb-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim().length < 20) {
                toast.error('Review needs at least 20 characters');
                return;
              }
              reviewMutation.mutate();
            }}
          >
            <p className="text-xs text-gray-500">One review per implant (you can update it anytime).</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Rating</label>
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="rounded border border-gray-200 px-2 py-1 text-sm"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              maxLength={160}
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Clinical notes, pearls, caveats… (min 20 characters)"
              rows={4}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              required
              minLength={20}
            />
            <button
              type="submit"
              disabled={reviewMutation.isPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {reviewMutation.isPending ? 'Saving…' : 'Save review'}
            </button>
          </form>
        ) : (
          <div className="mt-3 rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
            <Link
              to={`/login?redirect=${encodeURIComponent(`/implants/${data.slug}`)}`}
              className="font-medium text-blue-600 hover:text-blue-800"
            >
              Log in
            </Link>{' '}
            to write a review or leave a rating.
          </div>
        )}

        {(data.reviews || []).length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No reviews yet — be the first.</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {(data.reviews || []).map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    {r.author.firstName} {r.author.lastName}{' '}
                    <span className="font-normal text-gray-500">@{r.author.username}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.rating}/5 · {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {r.title ? <p className="mt-1 text-sm font-medium text-gray-800">{r.title}</p> : null}
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ImplantDetail;
