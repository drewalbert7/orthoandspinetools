const NPI_REGISTRY_URL = 'https://npiregistry.cms.hhs.gov/api/';

export type NpiRegistryBasic = {
  first_name?: string;
  last_name?: string;
  credential?: string;
  status?: string;
};

export type NpiRegistryResult = {
  number: string;
  enumeration_type?: string;
  basic?: NpiRegistryBasic;
  taxonomies?: Array<{ desc?: string; primary?: boolean }>;
};

export type NpiLookupResult = {
  valid: boolean;
  found: boolean;
  active: boolean;
  nameMatch: boolean;
  provider?: {
    firstName: string;
    lastName: string;
    credential?: string;
    primaryTaxonomy?: string;
  };
  error?: string;
};

/** CMS NPI uses Luhn on prefix 80840 + 10-digit NPI. */
export function isValidNpiFormat(npi: string): boolean {
  const digits = npi.replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits)) return false;

  const luhnInput = `80840${digits}`.split('').map(Number);
  let sum = 0;
  let doubleDigit = false;
  for (let i = luhnInput.length - 1; i >= 0; i--) {
    let d = luhnInput[i];
    if (doubleDigit) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function normalizeNamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .trim();
}

function namesRoughlyMatch(
  registryFirst: string,
  registryLast: string,
  userFirst: string,
  userLast: string
): boolean {
  const rf = normalizeNamePart(registryFirst);
  const rl = normalizeNamePart(registryLast);
  const uf = normalizeNamePart(userFirst);
  const ul = normalizeNamePart(userLast);
  if (!rf || !rl || !uf || !ul) return false;

  const firstOk = rf === uf || rf.startsWith(uf) || uf.startsWith(rf);
  const lastOk = rl === ul || rl.includes(ul) || ul.includes(rl);
  return firstOk && lastOk;
}

export async function fetchNpiRegistryRecord(npi: string): Promise<NpiRegistryResult | null> {
  const number = npi.replace(/\D/g, '');
  const url = `${NPI_REGISTRY_URL}?version=2.1&number=${encodeURIComponent(number)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result_count?: number; results?: NpiRegistryResult[] };
    if (!data.result_count || !data.results?.length) return null;
    return data.results[0];
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyNpiForUser(
  npi: string,
  firstName: string,
  lastName: string
): Promise<NpiLookupResult> {
  const number = npi.replace(/\D/g, '');
  if (!isValidNpiFormat(number)) {
    return { valid: false, found: false, active: false, nameMatch: false, error: 'Invalid NPI format' };
  }

  const record = await fetchNpiRegistryRecord(number);
  if (!record?.basic) {
    return {
      valid: true,
      found: false,
      active: false,
      nameMatch: false,
      error: 'NPI not found in the National Provider Identifier Registry',
    };
  }

  const status = (record.basic.status || 'A').toUpperCase();
  const active = status === 'A' || status === 'ACTIVE';
  const nameMatch = namesRoughlyMatch(
    record.basic.first_name || '',
    record.basic.last_name || '',
    firstName,
    lastName
  );

  const primaryTaxonomy =
    record.taxonomies?.find((t) => t.primary)?.desc || record.taxonomies?.[0]?.desc;

  return {
    valid: true,
    found: true,
    active,
    nameMatch,
    provider: {
      firstName: record.basic.first_name || '',
      lastName: record.basic.last_name || '',
      credential: record.basic.credential,
      primaryTaxonomy,
    },
    error: !active
      ? 'NPI is not active'
      : !nameMatch
        ? 'Name on the account does not match the NPI registry record'
        : undefined,
  };
}
