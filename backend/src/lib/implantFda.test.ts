import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanImplantSeoTitle, defaultImplantSeoTitle, fdaPathway, implantFdaRecords, isFdaSourceUrl } from './implantFda';
import { implantListOrderSql } from './implantSearch';

test('fdaPathway maps K, P and DEN numbers and rejects anything else', () => {
  assert.equal(fdaPathway('K023087'), '510(k)');
  assert.equal(fdaPathway('P070001'), 'PMA');
  assert.equal(fdaPathway('DEN180044'), 'De Novo');
  assert.equal(fdaPathway(''), null);
  assert.equal(fdaPathway(null), null);
  assert.equal(fdaPathway('K12'), null);
});

test('only fda.gov https links count as an FDA source', () => {
  assert.equal(isFdaSourceUrl('https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K023087'), true);
  assert.equal(isFdaSourceUrl('https://example.com/fda.gov'), false);
  assert.equal(isFdaSourceUrl('http://www.accessdata.fda.gov/x'), false);
  assert.equal(isFdaSourceUrl(null), false);
});

test('legacy titles lose the dash and the duplicate site name', () => {
  assert.equal(cleanImplantSeoTitle('prodisc C implant \u2014 OrthoAndSpineTools Directory'), 'prodisc C implant | Implant Directory');
  assert.equal(cleanImplantSeoTitle('Exeter hip implant | OrthoAndSpineTools'), 'Exeter hip implant');
  assert.equal(cleanImplantSeoTitle('Custom title'), 'Custom title');
  assert.equal(cleanImplantSeoTitle(''), null);
  assert.doesNotMatch(defaultImplantSeoTitle('GMRS'), /[\u2014\u2013]|OrthoAndSpineTools/);
});

test('name and discussion sorts are case-insensitive', () => {
  for (const sort of ['name', 'reviews'] as const) {
    const sql = implantListOrderSql(sort).sql;
    assert.match(sql, /lower\(i\.brand_name\) ASC/);
  }
  assert.match(implantListOrderSql('reviews').sql, /count\(\*\).*DESC/);
});

test('a listing with two verified approvals returns both records, each with its own source', () => {
  const recs = implantFdaRecords({
    fdaNumber: 'P110009',
    fdaRecords: [
      { number: 'P110002', label: 'One-level indication (C3-C7)', decisionDate: '2013-08-07', applicant: 'Highridge Medical, LLC', sourceUrl: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=P110002' },
      { number: 'p110009', label: 'Two-level indication', decisionDate: '2013-08-23T00:00:00Z', applicant: 'Highridge Medical, LLC', sourceUrl: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=P110009' },
      { number: 'not-a-number', sourceUrl: 'https://example.com' },
    ],
  });
  assert.equal(recs.length, 2, 'invalid entries are dropped, never repaired');
  assert.deepEqual(recs.map((r) => [r.number, r.pathway, r.decisionDate]), [
    ['P110002', 'PMA', '2013-08-07'],
    ['P110009', 'PMA', '2013-08-23'],
  ]);
  assert.ok(recs.every((r) => r.sourceUrl && r.sourceUrl.endsWith(r.number)));
});

test('single-record listings fall back to the fda_* columns; none on file gives no record', () => {
  const one = implantFdaRecords({ fdaNumber: 'K023087', fdaDecisionDate: new Date('2002-12-16T00:00:00Z'), fdaApplicant: 'Howmedica Osteonics Corp.', fdaSourceUrl: 'https://evil.example.com/x' });
  assert.equal(one.length, 1);
  assert.equal(one[0].pathway, '510(k)');
  assert.equal(one[0].decisionDate, '2002-12-16');
  assert.equal(one[0].sourceUrl, null, 'non-FDA links are not shown as a source');
  assert.deepEqual(implantFdaRecords({ fdaNumber: null }), []);
});

test('Mobi-C migration writes both openFDA-verified PMAs with level, date and source', () => {
  const sql = readFileSync(join(__dirname, '../../prisma/migrations/20261018010000_implant_fda_records/migration.sql'), 'utf8');
  assert.match(sql, /"number": "P110002", "label": "One-level[^"]*", "decisionDate": "2013-08-07"/);
  assert.match(sql, /"number": "P110009", "label": "Two-level[^"]*", "decisionDate": "2013-08-23"/);
  assert.match(sql, /pma\.cfm\?id=P110002/);
  assert.match(sql, /pma\.cfm\?id=P110009/);
  assert.doesNotMatch(sql, /\u2014/);
});
