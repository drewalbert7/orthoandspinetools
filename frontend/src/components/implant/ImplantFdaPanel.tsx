import { fdaDateLabel, fdaPathway, isFdaSourceUrl } from '../../lib/implantFda';

type Props = {
  fdaNumber?: string | null;
  fdaDecisionDate?: string | null;
  fdaApplicant?: string | null;
  fdaMaterials?: string | null;
  fdaSourceUrl?: string | null;
};

const NOT_ON_FILE = 'Not on file';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd
        className={`text-sm [overflow-wrap:anywhere] ${value ? 'text-gray-900' : 'text-gray-400'}`}
        data-testid={`fda-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
      >
        {value || NOT_ON_FILE}
      </dd>
    </div>
  );
}

/**
 * FDA regulatory record for an implant. Shows only openFDA-verified values from the API;
 * anything blank reads "Not on file" (never inferred).
 */
export function ImplantFdaPanel({
  fdaNumber,
  fdaDecisionDate,
  fdaApplicant,
  fdaMaterials,
  fdaSourceUrl,
}: Props) {
  const number = fdaNumber?.trim() || null;
  const pathway = fdaPathway(number);
  const source = isFdaSourceUrl(fdaSourceUrl) ? fdaSourceUrl!.trim() : null;

  return (
    <section
      id="fda-record"
      aria-label="FDA regulatory record"
      className="mt-4 rounded-md border border-gray-200 bg-white p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">FDA record</h2>
        {source ? (
          <a
            href={source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            FDA source (accessdata.fda.gov)
          </a>
        ) : null}
      </div>
      {number ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Row label="Pathway" value={pathway} />
          <Row label="Number" value={number} />
          <Row label="Decision date" value={fdaDateLabel(fdaDecisionDate)} />
          <Row label="Applicant" value={fdaApplicant?.trim() || null} />
          <div className="col-span-2 min-w-0">
            <Row label="Materials" value={fdaMaterials?.trim() || null} />
          </div>
        </dl>
      ) : (
        <p className="mt-1 text-sm text-gray-500" data-testid="fda-not-on-file">
          {NOT_ON_FILE}. No single FDA 510(k), PMA or De Novo record has been verified for this
          listing yet.
        </p>
      )}
    </section>
  );
}
