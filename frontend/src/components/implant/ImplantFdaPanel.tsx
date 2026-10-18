import { fdaDateLabel, fdaPathway, isFdaSourceUrl, type FdaRecord } from '../../lib/implantFda';

type Props = {
  fdaNumber?: string | null;
  fdaDecisionDate?: string | null;
  fdaApplicant?: string | null;
  fdaMaterials?: string | null;
  fdaSourceUrl?: string | null;
  /** All verified records; when absent, the single fda_* fields are used. */
  fdaRecords?: FdaRecord[] | null;
};

const NOT_ON_FILE = 'Not on file';

function Row({ label, value, testId }: { label: string; value: string | null | undefined; testId: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd
        className={`text-sm [overflow-wrap:anywhere] ${value ? 'text-gray-900' : 'text-gray-400'}`}
        data-testid={testId}
      >
        {value || NOT_ON_FILE}
      </dd>
    </div>
  );
}

function SourceLink({ url }: { url: string | null }) {
  if (!url || !isFdaSourceUrl(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-medium text-blue-600 hover:text-blue-800"
      data-testid="fda-source-link"
    >
      FDA source (accessdata.fda.gov)
    </a>
  );
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z]+/g, '-');
}

/**
 * FDA regulatory record(s) for an implant. Shows only openFDA-verified values from the API;
 * anything blank reads "Not on file" (never inferred). A listing with more than one approval
 * (for example one-level and two-level PMAs) shows each record with its own source link.
 */
export function ImplantFdaPanel({
  fdaNumber,
  fdaDecisionDate,
  fdaApplicant,
  fdaMaterials,
  fdaSourceUrl,
  fdaRecords,
}: Props) {
  const single = fdaNumber?.trim() || null;
  const records: FdaRecord[] =
    fdaRecords && fdaRecords.length > 0
      ? fdaRecords
      : single && fdaPathway(single)
        ? [
            {
              number: single,
              pathway: fdaPathway(single)!,
              label: null,
              decisionDate: fdaDecisionDate ?? null,
              applicant: fdaApplicant ?? null,
              sourceUrl: fdaSourceUrl ?? null,
            },
          ]
        : [];
  const multi = records.length > 1;
  const materials = fdaMaterials?.trim() || null;

  return (
    <section
      id="fda-record"
      aria-label="FDA regulatory record"
      className="mt-4 rounded-md border border-gray-200 bg-white p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">
          {multi ? `FDA records (${records.length})` : 'FDA record'}
        </h2>
        {!multi && records[0] ? <SourceLink url={records[0].sourceUrl} /> : null}
      </div>
      {records.length > 0 ? (
        <>
          {records.map((r, i) => (
            <div
              key={r.number}
              className={multi ? 'mt-2 rounded border border-gray-100 bg-gray-50/60 p-2' : ''}
              data-testid="fda-record-item"
            >
              {multi ? (
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-800" data-testid="fda-record-label">
                    {r.label || `Record ${i + 1}`}
                  </p>
                  <SourceLink url={r.sourceUrl} />
                </div>
              ) : null}
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                <Row label="Pathway" value={r.pathway} testId={`fda-${slug('Pathway')}`} />
                <Row label="Number" value={r.number} testId={`fda-${slug('Number')}`} />
                <Row label="Decision date" value={fdaDateLabel(r.decisionDate)} testId={`fda-${slug('Decision date')}`} />
                <Row label="Applicant" value={r.applicant?.trim() || null} testId={`fda-${slug('Applicant')}`} />
                {!multi ? (
                  <div className="col-span-2 min-w-0">
                    <Row label="Materials" value={materials} testId="fda-materials" />
                  </div>
                ) : null}
              </dl>
            </div>
          ))}
          {multi ? (
            <dl className="mt-2">
              <Row label="Materials" value={materials} testId="fda-materials" />
            </dl>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-sm text-gray-500" data-testid="fda-not-on-file">
          {NOT_ON_FILE}. No single FDA 510(k), PMA or De Novo record has been verified for this
          listing yet.
        </p>
      )}
    </section>
  );
}
