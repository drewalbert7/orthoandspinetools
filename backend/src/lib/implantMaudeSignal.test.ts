/**
 * MAUDE facet of the Directory Score: Insufficient data never carries a number, the facet
 * reads the snapshot's brand key and 365-day window, and legacy stored rows are cleaned.
 * Run: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAUDE_SIGNAL_WINDOW_DAYS, snapshotFromSafety, splitHalves } from './implantMaudeSignal';
import { SAFETY_FACET_LABEL, scoreFromParts } from './implantDirectoryScore';
import { sanitizeScoreBreakdown } from './implantApiCards';
import { computeSafetySignal, type SafetySignalInput, type SeverityCounts } from './implantSafetySignal';

const catalog = {
  status: 'published',
  company: 'Medtronic',
  description: 'Thoracolumbar pedicle screw and rod fixation system.',
  longDescription: 'x'.repeat(300),
  indications: null,
  contraindications: null,
  aliasCount: 2,
  productImageCount: 1,
  xrayCount: 0,
  otherImageCount: 0,
  hasTechniqueGuide: false,
};

function counts(p: Partial<SeverityCounts>): SeverityCounts {
  const c = { death: 0, injury: 0, malfunction: 0, other: 0, breaks: 0, ...p };
  return { ...c, total: c.death + c.injury + c.malfunction + c.other };
}

function safety(device: SeverityCounts, months: Array<{ month: string; count: number }> = []) {
  const input: SafetySignalInput = {
    device,
    categories: [{ code: 'NKB', share: 1, brandCount: 300, counts: counts({ injury: 300, malfunction: 2700, breaks: 900 }) }],
    recalls: [],
    trend: { recentTotal: 0, priorTotal: 0, months },
    sources: [{ label: 'Device', url: 'https://api.fda.gov/device/event.json?search=x' }],
    pulledAt: '2026-10-18T00:43:05.590Z',
    windowStart: '2025-10-18',
    windowEnd: '2026-10-17',
  };
  return computeSafetySignal(input);
}

test('facet is labeled "Reported safety signal (FDA MAUDE)" with a confidence status', () => {
  const m = snapshotFromSafety('Solera', safety(counts({ injury: 58, malfunction: 311, breaks: 146 })));
  const facet = scoreFromParts(catalog, [], m).facets.find((f) => f.id === 'maude')!;
  assert.equal(facet.label, SAFETY_FACET_LABEL);
  assert.equal(facet.label, 'Reported safety signal (FDA MAUDE)');
  assert.match(facet.status!, /^(High|Medium|Low) confidence$/);
  assert.match(facet.detail, /369 reports in the last 12 mo/);
  assert.doesNotMatch(facet.detail, /\u2014/);
});

test('facet shows "Insufficient data" and no number for low counts', () => {
  const m = snapshotFromSafety('INFINITY', safety(counts({ injury: 2 })));
  const b = scoreFromParts(catalog, [], m);
  const facet = b.facets.find((f) => f.id === 'maude')!;
  assert.equal(facet.score, null);
  assert.equal(facet.status, 'Insufficient data');
  assert.equal(b.maudeScore, null);
  assert.equal(b.maudeSignal, 'insufficient');
});

test('facet count and window match the 12-month snapshot (prodisc C case)', () => {
  const months = Array.from({ length: 13 }, (_, i) => ({ month: `m${i}`, count: i < 7 ? 6 : 5 }));
  const m = snapshotFromSafety('prodisc C', safety(counts({ injury: 40, malfunction: 33 }), months));
  assert.equal(m.windowLabel, '12mo');
  assert.equal(m.windowReports, 73);
  assert.equal(m.recentTotal! + m.priorTotal!, 72);
  const facet = scoreFromParts(catalog, [], m).facets.find((f) => f.id === 'maude')!;
  assert.match(facet.detail, /73 reports in the last 12 mo/);
  assert.doesNotMatch(facet.detail, /3mo/);
});

test('score window is the same 365 days the detail page snapshot requests', () => {
  assert.equal(MAUDE_SIGNAL_WINDOW_DAYS, 365);
  const page = readFileSync(join(__dirname, '../../../frontend/src/pages/ImplantDetail.tsx'), 'utf8');
  const synopsisCall = page.slice(page.indexOf("'maude-synopsis'"), page.indexOf("'maude-synopsis'") + 400);
  assert.match(synopsisCall, /brand: data!\.maudeBrandKey!/, 'snapshot uses the implant maudeBrandKey');
  assert.match(synopsisCall, new RegExp(`days: ${MAUDE_SIGNAL_WINDOW_DAYS}`), 'snapshot uses the same window');
});

test('splitHalves covers the whole window: last 6 months plus everything earlier', () => {
  const series = Array.from({ length: 13 }, (_, i) => ({ date: `2026-${i}`, count: i + 1 }));
  const { recentTotal, priorTotal } = splitHalves(series);
  assert.equal(recentTotal, 8 + 9 + 10 + 11 + 12 + 13);
  assert.equal(priorTotal, 1 + 2 + 3 + 4 + 5 + 6 + 7);
});

test('API never serves a stored 10.0 for an insufficient MAUDE facet', () => {
  const stored = {
    maudeSignal: 'insufficient',
    maudeScore: 10,
    facets: [
      { id: 'listing', score: 6.2 },
      { id: 'maude', score: 10, status: 'Insufficient data' },
    ],
    maude: { quietScore: 10, label: 'insufficient' },
  };
  const out = sanitizeScoreBreakdown(stored, 'insufficient') as typeof stored;
  assert.equal(out.maudeScore, null);
  assert.equal(out.facets.find((f) => f.id === 'maude')!.score, null);
  assert.equal(out.facets.find((f) => f.id === 'listing')!.score, 6.2);
  assert.equal(out.maude.quietScore, null);
});

test('legacy v2 MAUDE numbers without safety evidence read Insufficient data', () => {
  const stored = {
    version: 'ost-dir-v2',
    maudeSignal: 'quiet',
    maudeScore: 9.2,
    facets: [{ id: 'maude', score: 9.2, status: 'Quiet vs peers', detail: 'peer pctl' }],
    maude: { quietScore: 9.2, label: 'quiet' },
  };
  const out = sanitizeScoreBreakdown(stored, 'quiet') as typeof stored;
  assert.equal(out.facets[0].score, null);
  assert.equal(out.facets[0].status, 'Insufficient data');
  assert.equal(out.maude.quietScore, null);
});

test('stored openFDA brand text loses the garbled trademark character', () => {
  const m = snapshotFromSafety('Solera', safety(counts({ malfunction: 300 })));
  const stored = {
    maudeSignal: 'quiet',
    facets: [{ id: 'maude', score: 9.2, detail: 'Linked (CD HORIZON\u00ae SOLERA\u00ae VOYAGER\u00bf SPINAL SYSTEM)' }],
    maude: { ...m, matchedBrand: 'CD HORIZON\u00ae SOLERA\u00ae VOYAGER\u00bf SPINAL SYSTEM' },
  };
  const out = sanitizeScoreBreakdown(stored, 'quiet') as typeof stored;
  assert.equal(out.maude.matchedBrand, 'CD HORIZON\u00ae SOLERA\u00ae VOYAGER SPINAL SYSTEM');
  assert.doesNotMatch(out.facets[0].detail, /\u00bf/);
  assert.equal(out.facets[0].score, 9.2, 'scores with safety evidence are untouched');
});
