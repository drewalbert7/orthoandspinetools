import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanImplantSeoTitle, defaultImplantSeoTitle, fdaPathway, isFdaSourceUrl } from './implantFda';
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
