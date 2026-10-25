/**
 * FDA Device Importer for Implant Catalog Staging
 *
 * Imports device data from openFDA 510(k) and PMA endpoints into the staging table.
 * Dry-run by default — pass --write to actually persist to the database.
 *
 * Usage:
 *   npx tsx src/scripts/importFdaDevices.ts [options]
 *
 * Options:
 *   --write           Actually write to the database (default: dry-run)
 *   --codes CODE,...  Comma-separated product codes to import (default: spine codes)
 *   --limit N         Max records per product code (default: 100)
 *   --skip-pma        Skip PMA endpoint (only import 510(k))
 *   --skip-510k       Skip 510(k) endpoint (only import PMA)
 *   --verbose         Print detailed output for each record
 *
 * Environment:
 *   OPENFDA_API_KEY   Optional API key for higher rate limits
 *   DATABASE_URL      PostgreSQL connection string (required for --write)
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Rate limit: 240/min with key, 40/min without (conservative)
const API_KEY = process.env.OPENFDA_API_KEY?.trim();
const RATE_LIMIT_MS = API_KEY ? 260 : 1600;
const PAGE_SIZE = 100;

// Verified spine product codes from openFDA (from the plan document)
const SPINE_PRODUCT_CODES = [
  'MAX', // Intervertebral fusion device with bone graft, lumbar (896 records)
  'NKB', // Thoracolumbosacral pedicle screw system (914 records)
  'KWP', // Appliance, fixation, spinal interlaminal (430 records)
  'MNI', // Orthosis, spinal pedicle fixation (303 records)
  'MNH', // Orthosis, spondylolisthesis spinal fixation (309 records)
  'ODP', // Intervertebral fusion device with bone graft, cervical (354 records)
  'OVD', // Intervertebral fusion device with integrated fixation, lumbar (205 records)
];

// Other orthopedic codes for future phases
const OTHER_ORTHO_CODES = [
  'JWH', // Knee, patellofemorotibial, semi-constrained, cemented (921 records)
  'LPH', // Hip, semi-constrained, metal/polymer, porous uncemented (565 records)
  'MBH', // Knee, semi-constrained, uncemented, porous coated (146 records)
  'KWS', // Shoulder, semi-constrained, metal/polymer, cemented (191 records)
];

interface OpenFda510kRecord {
  k_number?: string;
  applicant?: string;
  decision_date?: string;
  device_name?: string;
  product_code?: string;
  advisory_committee?: string;
  advisory_committee_description?: string;
  clearance_type?: string;
  openfda?: {
    device_name?: string;
    device_class?: string;
    medical_specialty_description?: string;
    registration_number?: string[];
    fei_number?: string[];
  };
  [key: string]: unknown;
}

interface OpenFdaPmaRecord {
  pma_number?: string;
  supplement_number?: string;
  applicant?: string;
  decision_date?: string;
  generic_name?: string;
  trade_name?: string;
  product_code?: string;
  advisory_committee?: string;
  advisory_committee_description?: string;
  openfda?: {
    device_name?: string;
    device_class?: string;
    medical_specialty_description?: string;
    registration_number?: string[];
    fei_number?: string[];
  };
  [key: string]: unknown;
}

interface OpenFdaApiResponse<T> {
  meta?: {
    disclaimer?: string;
    terms?: string;
    license?: string;
    last_updated?: string;
    results?: {
      skip: number;
      limit: number;
      total: number;
    };
  };
  results?: T[];
  error?: {
    code?: string;
    message?: string;
  };
}

interface ImportStats {
  fetched: number;
  new: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface StagingRecord {
  source: string;
  sourceRecordId: string;
  productCode: string | null;
  fdaNumber: string | null;
  fdaDecisionDate: Date | null;
  fdaApplicant: string | null;
  deviceName: string | null;
  deviceClass: string | null;
  advisoryCommittee: string | null;
  rawJson: Prisma.JsonValue;
  fieldCitations: Prisma.JsonValue;
  retrievedAt: Date;
}

type FieldCitation = {
  sourceUrl: string;
  sourceType: string;
  retrievedAt: string;
  rawValue?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  // openFDA dates are YYYYMMDD or YYYY-MM-DD
  const normalized = dateStr.replace(/-/g, '');
  if (!/^\d{8}$/.test(normalized)) return null;
  const year = parseInt(normalized.slice(0, 4), 10);
  const month = parseInt(normalized.slice(4, 6), 10) - 1;
  const day = parseInt(normalized.slice(6, 8), 10);
  const date = new Date(Date.UTC(year, month, day));
  if (isNaN(date.getTime())) return null;
  return date;
}

function buildSourceUrl(endpoint: '510k' | 'pma', recordId: string): string {
  if (endpoint === '510k') {
    return `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${recordId}`;
  }
  return `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=${recordId}`;
}

function buildFieldCitations(
  endpoint: '510k' | 'pma',
  record: OpenFda510kRecord | OpenFdaPmaRecord,
  retrievedAt: Date
): Record<string, FieldCitation> {
  const sourceType = endpoint === '510k' ? 'openfda-510k' : 'openfda-pma';
  const recordId =
    endpoint === '510k'
      ? (record as OpenFda510kRecord).k_number
      : (record as OpenFdaPmaRecord).pma_number;
  const sourceUrl = buildSourceUrl(endpoint, recordId || '');
  const retrievedAtIso = retrievedAt.toISOString();

  const citations: Record<string, FieldCitation> = {};

  const addCitation = (fieldName: string, rawValue: string | undefined) => {
    if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
      citations[fieldName] = {
        sourceUrl,
        sourceType,
        retrievedAt: retrievedAtIso,
        rawValue: String(rawValue),
      };
    }
  };

  if (endpoint === '510k') {
    const r = record as OpenFda510kRecord;
    addCitation('fdaNumber', r.k_number);
    addCitation('fdaApplicant', r.applicant);
    addCitation('fdaDecisionDate', r.decision_date);
    addCitation('deviceName', r.device_name || r.openfda?.device_name);
    addCitation('productCode', r.product_code);
    addCitation('advisoryCommittee', r.advisory_committee);
    addCitation('deviceClass', r.openfda?.device_class);
  } else {
    const r = record as OpenFdaPmaRecord;
    const pmaNum = r.supplement_number
      ? `${r.pma_number}/${r.supplement_number}`
      : r.pma_number;
    addCitation('fdaNumber', pmaNum);
    addCitation('fdaApplicant', r.applicant);
    addCitation('fdaDecisionDate', r.decision_date);
    addCitation('deviceName', r.trade_name || r.generic_name || r.openfda?.device_name);
    addCitation('productCode', r.product_code);
    addCitation('advisoryCommittee', r.advisory_committee);
    addCitation('deviceClass', r.openfda?.device_class);
  }

  return citations;
}

function map510kToStaging(record: OpenFda510kRecord, retrievedAt: Date): StagingRecord {
  const citations = buildFieldCitations('510k', record, retrievedAt);

  return {
    source: 'openfda-510k',
    sourceRecordId: record.k_number || '',
    productCode: record.product_code || null,
    fdaNumber: record.k_number || null,
    fdaDecisionDate: parseDate(record.decision_date),
    fdaApplicant: record.applicant || null,
    deviceName: record.device_name || record.openfda?.device_name || null,
    deviceClass: record.openfda?.device_class || null,
    advisoryCommittee: record.advisory_committee || null,
    rawJson: record as unknown as Prisma.JsonValue,
    fieldCitations: citations as unknown as Prisma.JsonValue,
    retrievedAt,
  };
}

function mapPmaToStaging(record: OpenFdaPmaRecord, retrievedAt: Date): StagingRecord {
  const citations = buildFieldCitations('pma', record, retrievedAt);

  const pmaNumber = record.supplement_number
    ? `${record.pma_number}/${record.supplement_number}`
    : record.pma_number;

  return {
    source: 'openfda-pma',
    sourceRecordId: pmaNumber || '',
    productCode: record.product_code || null,
    fdaNumber: pmaNumber || null,
    fdaDecisionDate: parseDate(record.decision_date),
    fdaApplicant: record.applicant || null,
    deviceName:
      record.trade_name || record.generic_name || record.openfda?.device_name || null,
    deviceClass: record.openfda?.device_class || null,
    advisoryCommittee: record.advisory_committee || null,
    rawJson: record as unknown as Prisma.JsonValue,
    fieldCitations: citations as unknown as Prisma.JsonValue,
    retrievedAt,
  };
}

async function fetchOpenFda<T>(
  endpoint: '510k' | 'pma',
  search: string,
  skip: number,
  limit: number
): Promise<OpenFdaApiResponse<T>> {
  const baseUrl =
    endpoint === '510k'
      ? 'https://api.fda.gov/device/510k.json'
      : 'https://api.fda.gov/device/pma.json';

  const url = new URL(baseUrl);
  url.searchParams.set('search', search);
  url.searchParams.set('skip', String(skip));
  url.searchParams.set('limit', String(limit));
  if (API_KEY) {
    url.searchParams.set('api_key', API_KEY);
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });

      const json = (await response.json()) as OpenFdaApiResponse<T>;

      if (response.status === 429 || response.status === 503) {
        const backoff = Math.min(2000 * attempt, 8000);
        console.warn(
          `  Rate limited (${response.status}), waiting ${backoff}ms (attempt ${attempt}/${maxRetries})`
        );
        await sleep(backoff);
        continue;
      }

      if (response.status === 404 && json.error?.code === 'NOT_FOUND') {
        return { results: [], meta: { results: { skip, limit, total: 0 } } };
      }

      if (response.status >= 400) {
        throw new Error(
          `openFDA ${endpoint} error ${response.status}: ${json.error?.message || 'Unknown error'}`
        );
      }

      return json;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const backoff = 1000 * attempt;
        console.warn(`  Request failed, retrying in ${backoff}ms (attempt ${attempt}/${maxRetries})`);
        await sleep(backoff);
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

async function verifyProductCode(code: string): Promise<{ valid: boolean; deviceName?: string; count?: number }> {
  try {
    const response = await fetchOpenFda<OpenFda510kRecord>(
      '510k',
      `product_code:"${code}"`,
      0,
      1
    );
    
    if (!response.results || response.results.length === 0) {
      return { valid: false };
    }

    const record = response.results[0];
    const deviceName = record.openfda?.device_name || record.device_name;
    const total = response.meta?.results?.total || 0;

    return { valid: true, deviceName, count: total };
  } catch {
    return { valid: false };
  }
}

async function importProductCode(
  endpoint: '510k' | 'pma',
  productCode: string,
  limit: number,
  dryRun: boolean,
  verbose: boolean
): Promise<ImportStats> {
  const stats: ImportStats = { fetched: 0, new: 0, updated: 0, skipped: 0, errors: 0 };
  const search = `product_code:"${productCode}"`;
  let skip = 0;
  const retrievedAt = new Date();

  console.log(`\n  Importing ${endpoint.toUpperCase()} for product code ${productCode}...`);

  while (stats.fetched < limit) {
    const pageLimit = Math.min(PAGE_SIZE, limit - stats.fetched);

    try {
      const response =
        endpoint === '510k'
          ? await fetchOpenFda<OpenFda510kRecord>('510k', search, skip, pageLimit)
          : await fetchOpenFda<OpenFdaPmaRecord>('pma', search, skip, pageLimit);

      const results = response.results || [];
      const total = response.meta?.results?.total || 0;

      if (results.length === 0) {
        if (skip === 0) {
          console.log(`    No ${endpoint} records found for ${productCode}`);
        }
        break;
      }

      if (skip === 0) {
        console.log(`    Total available: ${total}, fetching up to ${limit}`);
      }

      for (const record of results) {
        stats.fetched++;

        const staging =
          endpoint === '510k'
            ? map510kToStaging(record as OpenFda510kRecord, retrievedAt)
            : mapPmaToStaging(record as OpenFdaPmaRecord, retrievedAt);

        if (!staging.sourceRecordId) {
          stats.skipped++;
          continue;
        }

        if (verbose) {
          console.log(
            `    ${staging.fdaNumber}: ${staging.deviceName?.slice(0, 50) || 'N/A'} (${staging.fdaApplicant?.slice(0, 30) || 'N/A'})`
          );
        }

        if (!dryRun) {
          try {
            const existing = await prisma.implantCatalogStaging.findUnique({
              where: {
                source_sourceRecordId: {
                  source: staging.source,
                  sourceRecordId: staging.sourceRecordId,
                },
              },
            });

            if (existing) {
              await prisma.implantCatalogStaging.update({
                where: { id: existing.id },
                data: {
                  ...staging,
                  reviewStatus: existing.reviewStatus,
                  reviewNotes: existing.reviewNotes,
                  reviewedAt: existing.reviewedAt,
                  reviewedBy: existing.reviewedBy,
                },
              });
              stats.updated++;
            } else {
              await prisma.implantCatalogStaging.create({ data: staging });
              stats.new++;
            }
          } catch (err) {
            stats.errors++;
            if (verbose) {
              console.error(`    Error saving ${staging.sourceRecordId}:`, err);
            }
          }
        } else {
          stats.new++;
        }
      }

      skip += results.length;

      if (results.length < pageLimit || skip >= total || stats.fetched >= limit) {
        break;
      }

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error(`    Error fetching page at skip=${skip}:`, err);
      stats.errors++;
      break;
    }
  }

  return stats;
}

interface ImportOptions {
  write: boolean;
  codes: string[];
  limit: number;
  skip510k: boolean;
  skipPma: boolean;
  verbose: boolean;
}

function parseArgs(): ImportOptions {
  const args = process.argv.slice(2);
  const options: ImportOptions = {
    write: false,
    codes: [...SPINE_PRODUCT_CODES],
    limit: 100,
    skip510k: false,
    skipPma: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--write':
        options.write = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--skip-510k':
        options.skip510k = true;
        break;
      case '--skip-pma':
        options.skipPma = true;
        break;
      case '--codes':
        if (args[i + 1]) {
          options.codes = args[++i].split(',').map((c) => c.trim().toUpperCase());
        }
        break;
      case '--limit':
        if (args[i + 1]) {
          options.limit = parseInt(args[++i], 10) || 100;
        }
        break;
      case '--help':
        console.log(`
FDA Device Importer for Implant Catalog Staging

Usage: npx tsx src/scripts/importFdaDevices.ts [options]

Options:
  --write           Actually write to the database (default: dry-run)
  --codes CODE,...  Comma-separated product codes (default: spine codes)
  --limit N         Max records per product code (default: 100)
  --skip-pma        Skip PMA endpoint (only import 510(k))
  --skip-510k       Skip 510(k) endpoint (only import PMA)
  --verbose         Print detailed output for each record
  --help            Show this help message

Environment:
  OPENFDA_API_KEY   Optional API key for higher rate limits (240/min vs 40/min)
  DATABASE_URL      PostgreSQL connection string (required for --write)

Default spine product codes:
  ${SPINE_PRODUCT_CODES.join(', ')}
`);
        process.exit(0);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('FDA Device Importer for Implant Catalog Staging');
  console.log('='.repeat(60));
  console.log(`Mode: ${options.write ? 'WRITE (persisting to database)' : 'DRY-RUN (no database writes)'}`);
  console.log(`API Key: ${API_KEY ? 'Configured' : 'Not configured (lower rate limit)'}`);
  console.log(`Rate limit: ~${Math.round(60000 / RATE_LIMIT_MS)} requests/minute`);
  console.log(`Product codes: ${options.codes.join(', ')}`);
  console.log(`Limit per code: ${options.limit}`);
  console.log(`Endpoints: ${[!options.skip510k && '510(k)', !options.skipPma && 'PMA'].filter(Boolean).join(', ')}`);
  console.log('');

  // Verify product codes
  console.log('Verifying product codes against openFDA...');
  const validCodes: Array<{ code: string; deviceName: string; count: number }> = [];
  for (const code of options.codes) {
    const result = await verifyProductCode(code);
    if (result.valid) {
      console.log(`  ✓ ${code}: ${result.deviceName} (${result.count} records)`);
      validCodes.push({ code, deviceName: result.deviceName || 'Unknown', count: result.count || 0 });
    } else {
      console.log(`  ✗ ${code}: Not found in openFDA`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  if (validCodes.length === 0) {
    console.error('\nNo valid product codes found. Exiting.');
    process.exit(1);
  }

  console.log(`\nProceeding with ${validCodes.length} valid codes...`);

  const totalStats: ImportStats = { fetched: 0, new: 0, updated: 0, skipped: 0, errors: 0 };

  for (const { code, deviceName } of validCodes) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Product Code: ${code}`);
    console.log(`Device: ${deviceName}`);

    // 510(k) import
    if (!options.skip510k) {
      const stats510k = await importProductCode(
        '510k',
        code,
        options.limit,
        !options.write,
        options.verbose
      );
      totalStats.fetched += stats510k.fetched;
      totalStats.new += stats510k.new;
      totalStats.updated += stats510k.updated;
      totalStats.skipped += stats510k.skipped;
      totalStats.errors += stats510k.errors;

      console.log(
        `    510(k) results: ${stats510k.fetched} fetched, ${stats510k.new} new, ${stats510k.updated} updated, ${stats510k.errors} errors`
      );
    }

    // PMA import
    if (!options.skipPma) {
      const statsPma = await importProductCode(
        'pma',
        code,
        options.limit,
        !options.write,
        options.verbose
      );
      totalStats.fetched += statsPma.fetched;
      totalStats.new += statsPma.new;
      totalStats.updated += statsPma.updated;
      totalStats.skipped += statsPma.skipped;
      totalStats.errors += statsPma.errors;

      console.log(
        `    PMA results: ${statsPma.fetched} fetched, ${statsPma.new} new, ${statsPma.updated} updated, ${statsPma.errors} errors`
      );
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total fetched:  ${totalStats.fetched}`);
  console.log(`New records:    ${totalStats.new}`);
  console.log(`Updated:        ${totalStats.updated}`);
  console.log(`Skipped:        ${totalStats.skipped}`);
  console.log(`Errors:         ${totalStats.errors}`);
  console.log(`Mode:           ${options.write ? 'WRITE (persisted)' : 'DRY-RUN (not persisted)'}`);
  console.log('='.repeat(60));

  if (!options.write) {
    console.log('\n⚠️  This was a DRY RUN. No data was written to the database.');
    console.log('    Run with --write to persist the data.');
  }

  await prisma.$disconnect();
}

// Only run main() when executed directly, not when imported for tests
const isDirectRun = process.argv[1]?.endsWith('importFdaDevices.ts') ||
  process.argv[1]?.includes('importFdaDevices');
const isTestRun = process.argv[1]?.includes('.check.ts') ||
  process.argv[1]?.includes('.test.ts') ||
  process.argv[1]?.includes('.spec.ts');

if (isDirectRun && !isTestRun) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export {
  SPINE_PRODUCT_CODES,
  OTHER_ORTHO_CODES,
  map510kToStaging,
  mapPmaToStaging,
  parseDate,
  buildFieldCitations,
  verifyProductCode,
  type StagingRecord,
  type FieldCitation,
  type OpenFda510kRecord,
  type OpenFdaPmaRecord,
};
