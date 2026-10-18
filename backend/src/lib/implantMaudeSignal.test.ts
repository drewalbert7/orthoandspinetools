/**
 * MAUDE facet: a 10.0 must never appear when the MAUDE snapshot shows many reports, low
 * counts must read "Insufficient data" (null score), and the score must use the snapshot's
 * brand key and 365-day window. Run: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildMaudeSignal,
  hazardFromPeerStats,
  MAUDE_MAX_QUIET_WITH_REPORTS,
  MAUDE_MIN_REPORTS_FOR_HAZARD,
  MAUDE_SIGNAL_WINDOW_DAYS,
  splitHalves,
  type MaudePeerWindow,
} from './implantMaudeSignal';
import { scoreFromParts } from './implantDirectoryScore';
import { sanitizeScoreBreakdown } from './implantApiCards';

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

/** Spine-like peer panel: some brands far bigger than the device under test. */
const bigPeers: MaudePeerWindow[] = [
  { recentTotal: 900, priorTotal: 950, windowTotal: 1850 },
  { recentTotal: 700, priorTotal: 640, windowTotal: 1340 },
  { recentTotal: 420, priorTotal: 480, windowTotal: 900 },
  { recentTotal: 300, priorTotal: 310, windowTotal: 610 },
  { recentTotal: 160, priorTotal: 150, windowTotal: 310 },
  { recentTotal: 40, priorTotal: 45, windowTotal: 85 },
];

test('Solera-like brand with 369 snapshot reports never scores 10.0', () => {
  const s = buildMaudeSignal({
    brandLabel: 'Solera',
    windowReports: 369,
    recentTotal: 180,
    priorTotal: 189,
    peers: bigPeers,
  });
  assert.equal(s.windowReports, 369);
  assert.notEqual(s.label, 'insufficient');
  assert.ok(s.quietScore != null, 'high-count brand with peers gets a score');
  assert.ok(s.quietScore! < 10, `quietScore ${s.quietScore} must be below 10`);
  assert.ok(s.quietScore! <= MAUDE_MAX_QUIET_WITH_REPORTS);
});

test('high snapshot count cannot hit 10.0 for any split of the window or peer panel', () => {
  const panels: MaudePeerWindow[][] = [bigPeers, bigPeers.slice(0, 3), bigPeers.map((p) => ({ ...p, windowTotal: p.windowTotal * 10 }))];
  for (const peers of panels) {
    for (const [recent, prior] of [
      [1, 0], // old bug: narrow brand row with 1 recent and 0 prior
      [0, 369],
      [369, 0],
      [100, 269],
      [184, 185],
    ]) {
      const s = buildMaudeSignal({ brandLabel: 'Solera', windowReports: 369, recentTotal: recent, priorTotal: prior, peers });
      assert.notEqual(s.quietScore, 10, `recent ${recent} prior ${prior} gave 10.0`);
      assert.ok(s.quietScore == null || s.quietScore <= MAUDE_MAX_QUIET_WITH_REPORTS);
    }
  }
});

test('thin halves cannot push a 369-report brand into the low-count branch', () => {
  const s = buildMaudeSignal({ brandLabel: 'Solera', windowReports: 369, recentTotal: 1, priorTotal: 0, peers: bigPeers });
  assert.notEqual(s.label, 'insufficient');
  assert.ok(s.quietScore != null && s.quietScore < 10);
});

test('low snapshot counts give Insufficient data with a null score', () => {
  for (let n = 0; n < MAUDE_MIN_REPORTS_FOR_HAZARD; n += 1) {
    const s = buildMaudeSignal({ brandLabel: 'Aptis', windowReports: n, recentTotal: n, priorTotal: 0, peers: bigPeers });
    assert.equal(s.label, 'insufficient', `n=${n}`);
    assert.equal(s.quietScore, null, `n=${n} must not carry a score`);
    assert.equal(s.hazard, null);
  }
});

test('hazardFromPeerStats below the threshold returns no score (was 10)', () => {
  const r = hazardFromPeerStats({ risingScore: 229, recentTotal: 2, priorTotal: 0, peerRisingPercentile: 0.9, peerVolumePercentile: 0.8 });
  assert.equal(r.label, 'insufficient');
  assert.equal(r.quietScore, null);
});

test('high count without a peer panel is Insufficient data, not 10.0', () => {
  const s = buildMaudeSignal({ brandLabel: 'Solera', windowReports: 369, recentTotal: 180, priorTotal: 189, peers: [] });
  assert.equal(s.label, 'insufficient');
  assert.equal(s.quietScore, null);
});

test('facet shows "Insufficient data" and no number for low counts', () => {
  const maude = buildMaudeSignal({ brandLabel: 'INFINITY', windowReports: 2, recentTotal: 2, priorTotal: 0, peers: bigPeers });
  const b = scoreFromParts(catalog, [], maude);
  const facet = b.facets.find((f) => f.id === 'maude')!;
  assert.equal(facet.score, null);
  assert.equal(facet.status, 'Insufficient data');
  assert.equal(b.maudeScore, null);
});

test('score window and count match the 12-month snapshot (prodisc C case)', () => {
  // Snapshot: 73 reports in the last 12 months. The facet must say 73 and 12 mo, not 3mo 14 vs 14.
  const maude = buildMaudeSignal({ brandLabel: 'prodisc C', windowReports: 73, recentTotal: 37, priorTotal: 36, peers: bigPeers });
  assert.equal(maude.windowLabel, '12mo');
  assert.equal(maude.windowReports, 73);
  const facet = scoreFromParts(catalog, [], maude).facets.find((f) => f.id === 'maude')!;
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
  assert.equal(recentTotal + priorTotal, series.reduce((a, p) => a + p.count, 0));
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

test('stored openFDA brand text loses the garbled trademark character', () => {
  const stored = {
    maudeSignal: 'quiet',
    facets: [{ id: 'maude', score: 9.2, detail: 'Linked (CD HORIZON\u00ae SOLERA\u00ae VOYAGER\u00bf SPINAL SYSTEM)' }],
    maude: { matchedBrand: 'CD HORIZON\u00ae SOLERA\u00ae VOYAGER\u00bf SPINAL SYSTEM' },
  };
  const out = sanitizeScoreBreakdown(stored, 'quiet') as typeof stored;
  assert.equal(out.maude.matchedBrand, 'CD HORIZON\u00ae SOLERA\u00ae VOYAGER SPINAL SYSTEM');
  assert.doesNotMatch(out.facets[0].detail, /\u00bf/);
  assert.equal(out.facets[0].score, 9.2, 'non-insufficient scores are untouched');
});

test('new facet uses the cleaned brand key, not the raw openFDA string', () => {
  const s = buildMaudeSignal({ brandLabel: 'Solera', windowReports: 369, recentTotal: 180, priorTotal: 189, peers: bigPeers });
  assert.equal(s.matchedBrand, 'Solera');
});
