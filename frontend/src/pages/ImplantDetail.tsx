import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DocumentMeta } from '../components/DocumentMeta';
import { AiRatingBadge } from '../components/implant/AiRatingBadge';
import ImplantCommentSection from '../components/implant/ImplantCommentSection';
import { ImplantMediaGallery } from '../components/implant/ImplantMediaGallery';
import { TechniqueGuideLink } from '../components/implant/TechniqueGuideLink';
import { ImplantFdaPanel } from '../components/implant/ImplantFdaPanel';
import { cleanImplantSeoTitle } from '../lib/implantFda';
import { ImplantScoreBreakdown } from '../components/implant/ImplantScoreBreakdown';
import { useAuth } from '../contexts/AuthContext';
import { isMeaningfulDirectoryNote } from '../lib/implantNotes';
import { IMPLANT_SPECIALTIES, specialtyLabel } from '../lib/implantSpecialties';
import {
  absoluteUrl,
  isOgSizedShareImage,
  preferredOgDeliveryUrl,
} from '../lib/seo';
import { apiService } from '../services/apiService';

const ImplantDetail: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
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
    techniqueGuideUrl: '',
    techniqueGuideTitle: '',
    aiRating: '',
    aiSummary: '',
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
      techniqueGuideUrl: data.techniqueGuideUrl || '',
      techniqueGuideTitle: data.techniqueGuideTitle || '',
      aiRating: data.aiRating != null ? String(data.aiRating) : '',
      aiSummary: data.aiSummary || '',
      status: data.status || 'published',
      aliases: (data.aliases || []).join(', '),
    });
  }, [data]);

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
        techniqueGuideUrl: adminForm.techniqueGuideUrl.trim() || null,
        techniqueGuideTitle: adminForm.techniqueGuideTitle.trim() || null,
        aiRating: adminForm.aiRating.trim() === '' ? null : Number(adminForm.aiRating),
        aiSummary: adminForm.aiSummary.trim() || null,
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

  const shareImage = useMemo(() => {
    if (!data) return null;
    const product =
      data.images?.find((i) => i.kind === 'product') ||
      data.productImage ||
      data.images?.[0] ||
      null;
    const raw = product?.url?.trim();
    if (!raw) return null;
    const absolute = /^https?:\/\//i.test(raw)
      ? raw
      : absoluteUrl(raw.startsWith('/') ? raw : `/${raw}`);
    return preferredOgDeliveryUrl(absolute);
  }, [data]);

  const { data: maudeSnap } = useQuery({
    queryKey: ['maude-synopsis', data?.maudeBrandKey, data?.specialty],
    queryFn: () =>
      apiService.getMaudeBrandSynopsis({
        brand: data!.maudeBrandKey!,
        specialty: data!.specialty || 'all',
        days: 365,
      }),
    enabled: Boolean(data?.maudeBrandKey),
    staleTime: 10 * 60_000,
    retry: 1,
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
          image: shareImage || undefined,
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
  }, [data, shareImage]);

  if (isLoading) {
    return (
      <div className="mx-auto min-w-0 max-w-4xl animate-pulse px-3 pb-8 sm:px-4">
        <div className="mb-3 h-4 w-40 rounded bg-gray-200" />
        <div className="mb-4 rounded-md border border-gray-200 bg-white p-3 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
            <div className="aspect-square w-full rounded-lg bg-gray-100 sm:max-w-[280px]" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-7 w-2/3 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-100" />
              <div className="h-16 w-full rounded bg-gray-100" />
              <div className="h-4 w-1/3 rounded bg-gray-100" />
            </div>
          </div>
        </div>
        <div className="h-40 rounded-md border border-gray-200 bg-white" />
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

  const pageTitle = cleanImplantSeoTitle(data.seoTitle) || `${data.brandName} · Implant Directory`;
  const pageDescriptionRaw =
    data.seoDescription ||
    data.description ||
    `${data.brandName}${data.company ? ` by ${data.company}` : ''}. Implant profile on OrthoAndSpineTools.`;
  const pageDescription =
    pageDescriptionRaw.length > 155
      ? `${pageDescriptionRaw.slice(0, 152).trimEnd()}…`
      : pageDescriptionRaw;
  const showIndications = isMeaningfulDirectoryNote(data.indications);
  const showCaveats = isMeaningfulDirectoryNote(data.contraindications);
  const imageCount = data.images?.length || 0;
  const commentCount = data.commentCount ?? data.comments?.length ?? 0;
  const shareDims =
    shareImage && isOgSizedShareImage(shareImage)
      ? { width: 1200, height: 630 }
      : null;

  return (
    <div className="mx-auto min-w-0 max-w-4xl px-3 pb-8 sm:px-4">
      <DocumentMeta
        title={pageTitle}
        description={pageDescription}
        canonicalPath={`/implants/${data.slug}`}
        ogImage={shareImage || undefined}
        ogImageAlt={shareImage ? `${data.brandName} product image` : undefined}
        ogImageWidth={shareDims?.width}
        ogImageHeight={shareDims?.height}
        twitterCard={shareImage ? 'summary_large_image' : 'summary'}
        jsonLd={jsonLd}
      />

      <div className="mb-3 flex min-w-0 items-center justify-between gap-2 text-sm">
        <Link
          to="/implants"
          className="touch-target shrink-0 font-medium text-blue-600 hover:text-blue-800"
        >
          ← Directory
        </Link>
        <a
          href={`/implants/${data.slug}.md`}
          className="min-w-0 truncate font-mono text-[11px] font-medium text-gray-600 hover:text-gray-900 sm:text-xs"
          title={`/implants/${data.slug}.md`}
        >
          <span className="sm:hidden">.md</span>
          <span className="hidden sm:inline">/implants/{data.slug}.md</span>
        </a>
      </div>

      <div className="mb-4 rounded-md border border-gray-200 bg-white p-3 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <ImplantMediaGallery
            brandName={data.brandName}
            images={data.images || []}
            className="w-full sm:w-auto sm:shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold leading-snug text-gray-900 [overflow-wrap:anywhere]">
                  {data.brandName}
                </h1>
                {data.systemName ? (
                  <p className="mt-0.5 text-sm text-gray-600 [overflow-wrap:anywhere]">
                    {data.systemName}
                  </p>
                ) : null}
              </div>
              <AiRatingBadge rating={data.aiRating} size="md" className="shrink-0" />
            </div>
            {data.techniqueGuideUrl ? (
              <div className="mt-3">
                <TechniqueGuideLink
                  url={data.techniqueGuideUrl}
                  title={data.techniqueGuideTitle}
                />
              </div>
            ) : null}
            <p className="mt-2 text-sm leading-snug text-gray-500 [overflow-wrap:anywhere]">
              {[
                data.company,
                data.anatomy,
                specialtyLabel(data.specialty),
                data.deviceClass.replace(/_/g, ' '),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {(data.longDescription || data.description) && (
              <p className="mt-3 text-sm leading-relaxed text-gray-700 [overflow-wrap:anywhere]">
                {data.longDescription || data.description}
              </p>
            )}
            {data.aliases?.length ? (
              <p className="mt-2 text-xs text-gray-500 [overflow-wrap:anywhere]">
                Also known as: {data.aliases.join(', ')}
              </p>
            ) : null}
            <ImplantFdaPanel
              fdaNumber={data.fdaNumber}
              fdaDecisionDate={data.fdaDecisionDate}
              fdaApplicant={data.fdaApplicant}
              fdaMaterials={data.fdaMaterials}
              fdaSourceUrl={data.fdaSourceUrl}
              fdaRecords={data.fdaRecords}
            />
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              {data.maudeBrandKey ? (
                <a href="#maude-snapshot" className="font-medium text-blue-600 hover:text-blue-800">
                  MAUDE snapshot →
                </a>
              ) : null}
              <a href="#directory-score" className="font-medium text-gray-600 hover:text-gray-900">
                Score breakdown →
              </a>
              <span className="text-gray-500">
                {commentCount} comment{commentCount === 1 ? '' : 's'}
                {data.status === 'verified' ? ' · verified' : ''}
              </span>
              {imageCount > 1 ? (
                <a href="#gallery-thumbs" className="font-medium text-gray-600 hover:text-gray-900">
                  {imageCount} media →
                </a>
              ) : null}
            </div>

            <ImplantScoreBreakdown
              rating={data.aiRating}
              breakdown={data.scoreBreakdown}
              catalogScore={data.catalogScore}
              communityScore={data.communityScore}
              utilityScore={data.utilityScore}
              maudeScore={data.maudeScore}
              maudeSignal={data.maudeSignal}
              ratingSampleN={data.ratingSampleN}
              ratingVersion={data.ratingVersion}
              summary={data.aiSummary}
            />
          </div>
        </div>

        {(showIndications || showCaveats) && (
          <div className="mt-5 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
            {showIndications ? (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Indications (directory notes)
                </h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 [overflow-wrap:anywhere]">
                  {data.indications}
                </p>
              </div>
            ) : null}
            {showCaveats ? (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Caveats (directory notes)
                </h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 [overflow-wrap:anywhere]">
                  {data.contraindications}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {data.maudeBrandKey ? (
        <div
          id="maude-snapshot"
          className="mb-4 scroll-mt-24 rounded-md border border-gray-200 bg-white p-3 sm:p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">MAUDE snapshot</h2>
            <Link
              to={`/maude?brand=${encodeURIComponent(data.maudeBrandKey)}&specialty=${encodeURIComponent(data.specialty || 'all')}`}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Open trends →
            </Link>
          </div>
          {maudeSnap ? (
            <p className="mt-2 text-sm text-gray-700">
              <span className="font-semibold tabular-nums text-gray-900">
                {maudeSnap.totalReports.toLocaleString()}
              </span>{' '}
              openFDA adverse-event reports in the last 12 months for{' '}
              <span className="font-medium">{maudeSnap.displayTitle || maudeSnap.brand}</span>
              {maudeSnap.summary ? (
                <span className="mt-1 block text-xs leading-relaxed text-gray-500">{maudeSnap.summary}</span>
              ) : null}
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-500">Loading 12-month report count…</p>
          )}
          <p className="mt-2 text-[10px] text-gray-400">
            Counts are openFDA device reports matched to this brand key, not implant-specific incidence
            rates and not medical advice.
          </p>
        </div>
      ) : null}

      {user?.isAdmin ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Admin: edit listing</h2>
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
                  ['techniqueGuideTitle', 'STG label (Surgical technique guide)'],
                  ['techniqueGuideUrl', 'Surgical technique PDF URL (direct .pdf only)'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className={`text-xs text-gray-600 ${
                    key === 'techniqueGuideUrl' ? 'sm:col-span-2' : ''
                  }`}
                >
                  {label}
                  <input
                    value={adminForm[key]}
                    onChange={(e) => setAdminForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                    placeholder={
                      key === 'techniqueGuideUrl'
                        ? 'https://…/…-surgical-technique.pdf (not brochure/catalog)'
                        : key === 'techniqueGuideTitle'
                          ? 'Surgical technique guide'
                          : undefined
                    }
                  />
                </label>
              ))}
              <label className="text-xs text-gray-600">
                Specialty
                <select
                  value={adminForm.specialty}
                  onChange={(e) => setAdminForm((f) => ({ ...f, specialty: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
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
                  className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                >
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="verified">verified</option>
                </select>
              </label>
              <label className="text-xs text-gray-600">
                Manual Directory Score override (0-10, locks auto)
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={adminForm.aiRating}
                  onChange={(e) => setAdminForm((f) => ({ ...f, aiRating: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                  placeholder="Leave blank to keep algorithm"
                />
              </label>
              <label className="text-xs text-gray-600 sm:col-span-2">
                Directory Score summary (optional override text)
                <textarea
                  value={adminForm.aiSummary}
                  onChange={(e) => setAdminForm((f) => ({ ...f, aiSummary: e.target.value }))}
                  rows={2}
                  maxLength={500}
                  className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                />
              </label>
              <label className="text-xs text-gray-600 sm:col-span-2">
                Aliases (comma-separated)
                <input
                  value={adminForm.aliases}
                  onChange={(e) => setAdminForm((f) => ({ ...f, aliases: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                />
              </label>
              <label className="text-xs text-gray-600 sm:col-span-2">
                Short description
                <textarea
                  value={adminForm.description}
                  onChange={(e) => setAdminForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                />
              </label>
              <label className="text-xs text-gray-600 sm:col-span-2">
                Long description (SEO body)
                <textarea
                  value={adminForm.longDescription}
                  onChange={(e) => setAdminForm((f) => ({ ...f, longDescription: e.target.value }))}
                  rows={4}
                  className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
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

      <ImplantCommentSection
        slug={data.slug}
        comments={data.comments || []}
        locked={Boolean(data.commentsLocked)}
      />

      {(data.related || []).length > 0 ? (
        <section className="mb-4 mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Related implants</h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 sm:gap-3">
            {data.related!.map((r) => (
              <Link
                key={r.id}
                to={`/implants/${r.slug}`}
                className="flex gap-3 rounded-lg border border-gray-200 bg-white p-2.5 transition-colors hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-gray-100 bg-gray-50 sm:h-14 sm:w-14">
                  {r.productImage?.url ? (
                    <img
                      src={r.productImage.url}
                      alt=""
                      className="h-full w-full object-contain p-0.5"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-gray-400">
                      n/a
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <p className="truncate text-sm font-medium text-gray-900">{r.brandName}</p>
                    <AiRatingBadge rating={r.aiRating} size="sm" showLabel={false} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {[r.company, specialtyLabel(r.specialty), r.deviceClass.replace(/_/g, ' ')]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default ImplantDetail;
