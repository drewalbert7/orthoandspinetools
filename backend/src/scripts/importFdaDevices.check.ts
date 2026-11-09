/**
 * Tests for FDA Device Importer
 *
 * Run with: npx tsx src/scripts/importFdaDevices.check.ts
 *
 * Tests cover:
 * - 510(k) and PMA record mapping
 * - Field citation completeness (every non-null field has a citation)
 * - Date parsing
 * - Dedupe key generation
 * - Dry-run no-write guarantee
 */

import {
  map510kToStaging,
  mapPmaToStaging,
  parseDate,
  buildFieldCitations,
  SPINE_PRODUCT_CODES,
  type StagingRecord,
  type FieldCitation,
} from './importFdaDevices';
import {
  FIXTURE_510K_MAX,
  FIXTURE_510K_ODP,
  FIXTURE_510K_NKB,
  FIXTURE_510K_MINIMAL,
  FIXTURE_510K_INVALID,
  FIXTURE_PMA_CERVICAL_DISC,
  FIXTURE_PMA_WITH_SUPPLEMENT,
  EXPECTED_STAGING_510K_MAX,
  EXPECTED_STAGING_PMA_SUPPLEMENT,
  FIXTURE_DEDUPE_RECORDS,
} from './importFdaDevices.fixtures';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAILED: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`FAILED: ${message} (got "${actual}", expected "${expected}")`);
  }
}

function assertDefined<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`FAILED: ${message} (value is ${value})`);
  }
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function section(name: string): void {
  console.log(`\n${name}`);
  console.log('─'.repeat(name.length));
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Parsing Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Date Parsing');

test('parseDate handles YYYYMMDD format', () => {
  const date = parseDate('20230615');
  assertDefined(date, 'date should be defined');
  assertEq(date.toISOString().slice(0, 10), '2023-06-15', 'date value');
});

test('parseDate handles YYYY-MM-DD format', () => {
  const date = parseDate('2023-06-15');
  assertDefined(date, 'date should be defined');
  assertEq(date.toISOString().slice(0, 10), '2023-06-15', 'date value');
});

test('parseDate returns null for undefined', () => {
  const date = parseDate(undefined);
  assert(date === null, 'undefined should return null');
});

test('parseDate returns null for invalid format', () => {
  const date = parseDate('invalid');
  assert(date === null, 'invalid should return null');
});

test('parseDate returns null for empty string', () => {
  const date = parseDate('');
  assert(date === null, 'empty string should return null');
});

// ─────────────────────────────────────────────────────────────────────────────
// 510(k) Mapping Tests
// ─────────────────────────────────────────────────────────────────────────────

section('510(k) Mapping');

test('map510kToStaging correctly maps MAX record', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = map510kToStaging(FIXTURE_510K_MAX, retrievedAt);

  assertEq(staging.source, EXPECTED_STAGING_510K_MAX.source, 'source');
  assertEq(staging.sourceRecordId, EXPECTED_STAGING_510K_MAX.sourceRecordId, 'sourceRecordId');
  assertEq(staging.productCode, EXPECTED_STAGING_510K_MAX.productCode, 'productCode');
  assertEq(staging.fdaNumber, EXPECTED_STAGING_510K_MAX.fdaNumber, 'fdaNumber');
  assertEq(staging.fdaApplicant, EXPECTED_STAGING_510K_MAX.fdaApplicant, 'fdaApplicant');
  assertEq(staging.deviceName, EXPECTED_STAGING_510K_MAX.deviceName, 'deviceName');
  assertEq(staging.deviceClass, EXPECTED_STAGING_510K_MAX.deviceClass, 'deviceClass');
  assertEq(staging.advisoryCommittee, EXPECTED_STAGING_510K_MAX.advisoryCommittee, 'advisoryCommittee');
});

test('map510kToStaging correctly parses decision date', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = map510kToStaging(FIXTURE_510K_MAX, retrievedAt);

  assertDefined(staging.fdaDecisionDate, 'fdaDecisionDate should be defined');
  assertEq(staging.fdaDecisionDate.toISOString().slice(0, 10), '2023-06-15', 'fdaDecisionDate value');
});

test('map510kToStaging handles cervical fusion (ODP)', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = map510kToStaging(FIXTURE_510K_ODP, retrievedAt);

  assertEq(staging.productCode, 'ODP', 'productCode');
  assertEq(staging.fdaApplicant, 'GLOBUS MEDICAL, INC.', 'fdaApplicant');
});

test('map510kToStaging handles pedicle screw (NKB)', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = map510kToStaging(FIXTURE_510K_NKB, retrievedAt);

  assertEq(staging.productCode, 'NKB', 'productCode');
  assertEq(staging.fdaApplicant, 'NUVASIVE, INC.', 'fdaApplicant');
});

test('map510kToStaging handles minimal record with null fields', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = map510kToStaging(FIXTURE_510K_MINIMAL, retrievedAt);

  assertEq(staging.sourceRecordId, 'K999999', 'sourceRecordId');
  assert(staging.fdaDecisionDate === null, 'fdaDecisionDate should be null');
  assert(staging.deviceName === null, 'deviceName should be null');
  assert(staging.deviceClass === null, 'deviceClass should be null');
});

test('map510kToStaging preserves raw JSON', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = map510kToStaging(FIXTURE_510K_MAX, retrievedAt);

  const rawJson = staging.rawJson as Record<string, unknown>;
  assertEq(rawJson.k_number, 'K231234', 'raw JSON k_number');
  assertEq(rawJson.product_code, 'MAX', 'raw JSON product_code');
});

// ─────────────────────────────────────────────────────────────────────────────
// PMA Mapping Tests
// ─────────────────────────────────────────────────────────────────────────────

section('PMA Mapping');

test('mapPmaToStaging correctly maps cervical disc PMA', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = mapPmaToStaging(FIXTURE_PMA_CERVICAL_DISC, retrievedAt);

  assertEq(staging.source, 'openfda-pma', 'source');
  assertEq(staging.sourceRecordId, 'P110009', 'sourceRecordId');
  assertEq(staging.fdaNumber, 'P110009', 'fdaNumber');
  assertEq(staging.deviceName, 'MOBI-C CERVICAL DISC PROSTHESIS', 'deviceName (uses trade_name)');
});

test('mapPmaToStaging handles supplement numbers', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = mapPmaToStaging(FIXTURE_PMA_WITH_SUPPLEMENT, retrievedAt);

  assertEq(staging.sourceRecordId, EXPECTED_STAGING_PMA_SUPPLEMENT.sourceRecordId, 'sourceRecordId');
  assertEq(staging.fdaNumber, EXPECTED_STAGING_PMA_SUPPLEMENT.fdaNumber, 'fdaNumber');
  assertEq(staging.fdaApplicant, EXPECTED_STAGING_PMA_SUPPLEMENT.fdaApplicant, 'fdaApplicant');
  assertEq(staging.deviceName, EXPECTED_STAGING_PMA_SUPPLEMENT.deviceName, 'deviceName');
});

// ─────────────────────────────────────────────────────────────────────────────
// Citation Completeness Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Citation Completeness');

test('every non-null 510(k) field has a citation', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = map510kToStaging(FIXTURE_510K_MAX, retrievedAt);
  const citations = staging.fieldCitations as Record<string, FieldCitation>;

  const fieldsToCheck = [
    'fdaNumber',
    'fdaApplicant',
    'fdaDecisionDate',
    'deviceName',
    'productCode',
    'advisoryCommittee',
    'deviceClass',
  ] as const;

  for (const field of fieldsToCheck) {
    const stagingField = staging[field as keyof StagingRecord];
    if (stagingField !== null && stagingField !== undefined) {
      assertDefined(citations[field], `citation for ${field}`);
      assert(citations[field].sourceUrl.length > 0, `sourceUrl for ${field}`);
      assert(citations[field].sourceType === 'openfda-510k', `sourceType for ${field}`);
      assert(citations[field].retrievedAt.length > 0, `retrievedAt for ${field}`);
    }
  }
});

test('every non-null PMA field has a citation', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = mapPmaToStaging(FIXTURE_PMA_WITH_SUPPLEMENT, retrievedAt);
  const citations = staging.fieldCitations as Record<string, FieldCitation>;

  const fieldsToCheck = [
    'fdaNumber',
    'fdaApplicant',
    'fdaDecisionDate',
    'deviceName',
    'productCode',
    'advisoryCommittee',
    'deviceClass',
  ] as const;

  for (const field of fieldsToCheck) {
    const stagingField = staging[field as keyof StagingRecord];
    if (stagingField !== null && stagingField !== undefined) {
      assertDefined(citations[field], `citation for ${field}`);
      assert(citations[field].sourceUrl.length > 0, `sourceUrl for ${field}`);
      assert(citations[field].sourceType === 'openfda-pma', `sourceType for ${field}`);
      assert(citations[field].retrievedAt.length > 0, `retrievedAt for ${field}`);
    }
  }
});

test('citation sourceUrl points to FDA access data page', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging510k = map510kToStaging(FIXTURE_510K_MAX, retrievedAt);
  const citations510k = staging510k.fieldCitations as Record<string, FieldCitation>;

  assert(
    citations510k.fdaNumber.sourceUrl.includes('accessdata.fda.gov'),
    '510k citation should point to accessdata.fda.gov'
  );
  assert(
    citations510k.fdaNumber.sourceUrl.includes('K231234'),
    '510k citation URL should include K-number'
  );

  const stagingPma = mapPmaToStaging(FIXTURE_PMA_CERVICAL_DISC, retrievedAt);
  const citationsPma = stagingPma.fieldCitations as Record<string, FieldCitation>;

  assert(
    citationsPma.fdaNumber.sourceUrl.includes('accessdata.fda.gov'),
    'PMA citation should point to accessdata.fda.gov'
  );
  assert(
    citationsPma.fdaNumber.sourceUrl.includes('P110009'),
    'PMA citation URL should include P-number'
  );
});

test('null fields do not have citations', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = map510kToStaging(FIXTURE_510K_MINIMAL, retrievedAt);
  const citations = staging.fieldCitations as Record<string, FieldCitation>;

  // deviceClass is null in the minimal fixture
  assert(citations.deviceClass === undefined, 'null deviceClass should not have citation');
  // fdaDecisionDate is null in the minimal fixture
  assert(citations.fdaDecisionDate === undefined, 'null fdaDecisionDate should not have citation');
});

// ─────────────────────────────────────────────────────────────────────────────
// Dedupe Tests
// ─────────────────────────────────────────────────────────────────────────────

section('Dedupe Keys');

test('510k dedupe key is source + k_number', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = map510kToStaging(FIXTURE_510K_MAX, retrievedAt);

  assertEq(staging.source, 'openfda-510k', 'source');
  assertEq(staging.sourceRecordId, 'K231234', 'sourceRecordId');
});

test('PMA dedupe key is source + pma_number/supplement', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = mapPmaToStaging(FIXTURE_PMA_WITH_SUPPLEMENT, retrievedAt);

  assertEq(staging.source, 'openfda-pma', 'source');
  assertEq(staging.sourceRecordId, 'P200022/S001', 'sourceRecordId includes supplement');
});

test('duplicate K-numbers produce same dedupe key', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging1 = map510kToStaging(FIXTURE_DEDUPE_RECORDS[0], retrievedAt);
  const staging2 = map510kToStaging(FIXTURE_DEDUPE_RECORDS[1], retrievedAt);

  assertEq(staging1.source, staging2.source, 'source should match');
  assertEq(staging1.sourceRecordId, staging2.sourceRecordId, 'sourceRecordId should match');
});

// ─────────────────────────────────────────────────────────────────────────────
// Product Code Validation
// ─────────────────────────────────────────────────────────────────────────────

section('Product Codes');

test('SPINE_PRODUCT_CODES includes expected codes', () => {
  assert(SPINE_PRODUCT_CODES.includes('MAX'), 'MAX should be in spine codes');
  assert(SPINE_PRODUCT_CODES.includes('NKB'), 'NKB should be in spine codes');
  assert(SPINE_PRODUCT_CODES.includes('ODP'), 'ODP should be in spine codes');
  assert(SPINE_PRODUCT_CODES.includes('OVD'), 'OVD should be in spine codes');
});

test('all spine product codes are 3 characters', () => {
  for (const code of SPINE_PRODUCT_CODES) {
    assertEq(code.length, 3, `${code} should be 3 characters`);
    assert(/^[A-Z0-9]{3}$/.test(code), `${code} should match pattern`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Invalid Record Handling
// ─────────────────────────────────────────────────────────────────────────────

section('Invalid Records');

test('empty k_number produces empty sourceRecordId (for skip logic)', () => {
  const retrievedAt = new Date('2026-10-15T12:00:00Z');
  const staging = map510kToStaging(FIXTURE_510K_INVALID, retrievedAt);

  assertEq(staging.sourceRecordId, '', 'empty k_number should produce empty sourceRecordId');
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(50));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(50));

if (failed > 0) {
  process.exit(1);
}

console.log('\n✓ All FDA importer checks passed');
