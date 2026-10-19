/**
 * Reported safety signal (FDA MAUDE): thresholds, severity ordering, recalls, shrinkage,
 * and the Solera case. Formula: docs/implant-safety-signal.md. Run: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_I_CAP,
  MIN_DEVICE_REPORTS,
  PRIOR_STRENGTH_K,
  computeSafetySignal,
  severityIndex,
  type CategoryCode,
  type RecallEvent,
  type SafetySignalInput,
  type SeverityCounts,
} from './implantSafetySignal';
import {
  dedupeRecallEvents,
  firmMatches,
  firmToken,
  monthlyTrend,
  productMatchesBrandKey,
  severityFromEventTypes,
} from './implantSafetyData';
import { effectiveParams, publicOpenFdaUrl, KEYLESS_MAX_COUNT_LIMIT } from './openFdaHttp';

function counts(p: Partial<SeverityCounts>): SeverityCounts {
  const c = { death: 0, injury: 0, malfunction: 0, other: 0, breaks: 0, ...p };
  return { ...c, total: p.total ?? c.death + c.injury + c.malfunction + c.other };
}

/** Pedicle screw style category: about 3000 reports, mostly malfunction, a third breaks. */
const spineCategory: CategoryCode[] = [
  { code: 'NKB', share: 0.6, brandCount: 300, counts: counts({ death: 3, injury: 250, malfunction: 1040, breaks: 450 }) },
  { code: 'HXX', share: 0.4, brandCount: 390, counts: counts({ injury: 90, malfunction: 1700, breaks: 600 }) },
];

function input(device: SeverityCounts, extra: Partial<SafetySignalInput> = {}): SafetySignalInput {
  return {
    device,
    categories: spineCategory,
    recalls: [],
    trend: { recentTotal: 0, priorTotal: 0, months: [] },
    sources: [],
    pulledAt: '2026-10-18T00:43:05.590Z',
    windowStart: '2025-10-18',
    windowEnd: '2026-10-17',
    ...extra,
  };
}

function recall(cls: RecallEvent['classification'], id = cls): RecallEvent {
  return { id, classification: cls, date: '2024-01-01', firm: 'Acme', product: 'Acme screw', reason: null, url: 'https://api.fda.gov/device/enforcement.json' };
}

test('zero reports gives Insufficient data with a null score', () => {
  const s = computeSafetySignal(input(counts({})));
  assert.equal(s.score, null);
  assert.equal(s.confidence, 'insufficient');
});

test('fewer than the minimum reports gives Insufficient data, never a number', () => {
  for (let n = 1; n < MIN_DEVICE_REPORTS; n += 1) {
    const s = computeSafetySignal(input(counts({ malfunction: n })));
    assert.equal(s.score, null, `n=${n}`);
    assert.equal(s.confidence, 'insufficient', `n=${n}`);
    assert.match(s.notes[0], /Fewer than 5/);
  }
});

test('no product-code baseline from real data gives Insufficient data', () => {
  const none = computeSafetySignal(input(counts({ malfunction: 200 }), { categories: [] }));
  assert.equal(none.score, null);
  const thin = computeSafetySignal(
    input(counts({ malfunction: 200 }), {
      categories: [{ code: 'ZZZ', share: 1, brandCount: 9, counts: counts({ malfunction: 20 }) }],
    })
  );
  assert.equal(thin.score, null);
  const fewBrands = computeSafetySignal(
    input(counts({ malfunction: 200 }), {
      categories: [{ code: 'ZZZ', share: 1, brandCount: 2, counts: counts({ malfunction: 900 }) }],
    })
  );
  assert.equal(fewBrands.score, null);
});

test('Solera-like data (369 reports, 146 breaks) can never score high', () => {
  const solera = counts({ injury: 58, malfunction: 311, breaks: 146 });
  const baselines: CategoryCode[][] = [
    spineCategory,
    // A category with no breaks at all and a much worse severity mix.
    [{ code: 'AAA', share: 1, brandCount: 50, counts: counts({ death: 40, injury: 900, malfunction: 60 }) }],
    // A category where every report is a break.
    [{ code: 'BBB', share: 1, brandCount: 50, counts: counts({ malfunction: 1000, breaks: 1000 }) }],
  ];
  for (const categories of baselines) {
    const s = computeSafetySignal(input(solera, { categories }));
    assert.ok(s.score != null, 'scored');
    assert.ok(s.score! < 7, `Solera-like scored ${s.score} with ${categories[0].code}`);
  }
});

test('severity ordering holds: death < serious injury < malfunction', () => {
  const base = { malfunction: 80 };
  const m = computeSafetySignal(input(counts({ ...base, malfunction: 100 })));
  const i = computeSafetySignal(input(counts({ ...base, injury: 20 })));
  const d = computeSafetySignal(input(counts({ ...base, death: 20 })));
  assert.ok(severityIndex(counts({ death: 1 })) > severityIndex(counts({ injury: 1 })));
  assert.ok(severityIndex(counts({ injury: 1 })) > severityIndex(counts({ malfunction: 1 })));
  assert.ok(m.score! > i.score!, `malfunction ${m.score} vs injury ${i.score}`);
  assert.ok(i.score! > d.score!, `injury ${i.score} vs death ${d.score}`);
});

test('breaks lower the score at the same event-type mix', () => {
  const none = computeSafetySignal(input(counts({ malfunction: 100 })));
  const some = computeSafetySignal(input(counts({ malfunction: 100, breaks: 60 })));
  assert.ok(some.score! < none.score!);
});

test('a recall lowers the score, Class I most', () => {
  const dev = counts({ injury: 10, malfunction: 90, breaks: 10 });
  const none = computeSafetySignal(input(dev)).score!;
  const c3 = computeSafetySignal(input(dev, { recalls: [recall('Class III')] })).score!;
  const c2 = computeSafetySignal(input(dev, { recalls: [recall('Class II')] })).score!;
  const c1 = computeSafetySignal(input(dev, { recalls: [recall('Class I')] })).score!;
  assert.ok(c3 < none && c2 < c3 && c1 < c2, `none ${none} III ${c3} II ${c2} I ${c1}`);
  assert.ok(c1 <= CLASS_I_CAP);
  const two = computeSafetySignal(input(dev, { recalls: [recall('Class II', 'a'), recall('Class II', 'b')] })).score!;
  assert.ok(two < c2, 'each recall event counts');
});

test('shrinkage pulls thin data toward the category mean', () => {
  // All-death device: extreme index. Thin data must sit much closer to the category.
  const thin = computeSafetySignal(input(counts({ death: 6 })));
  const thick = computeSafetySignal(input(counts({ death: 600 })));
  assert.ok(Math.abs(thin.shrunkIndex! - thin.categoryIndex!) < Math.abs(thick.shrunkIndex! - thick.categoryIndex!));
  assert.ok(thin.score! > thick.score!, `thin ${thin.score} thick ${thick.score}`);
  assert.equal(thin.shrinkWeight, Math.round((6 / (6 + PRIOR_STRENGTH_K)) * 1000) / 1000);
  // Quiet thin device cannot look perfect either.
  const quietThin = computeSafetySignal(input(counts({ other: 5 })));
  const quietThick = computeSafetySignal(input(counts({ other: 500 })));
  assert.ok(quietThin.score! < quietThick.score!);
  assert.ok(quietThin.score! < 9, `quiet thin ${quietThin.score}`);
});

test('a device at the category mean scores 5 and confidence tracks evidence', () => {
  const cat = spineCategory[0].counts;
  const same = computeSafetySignal(input(counts({ death: 3, injury: 250, malfunction: 1040, breaks: 450 }), { categories: [{ ...spineCategory[0], share: 1 }] }));
  assert.equal(severityIndex(cat).toFixed(3), same.severityIndex!.toFixed(3));
  assert.ok(Math.abs(same.score! - 5) <= 0.1, `score ${same.score}`);
  assert.equal(same.confidence, 'medium', 'device is its whole baseline, so confidence drops');
  assert.equal(computeSafetySignal(input(counts({ malfunction: 300 }))).confidence, 'high');
  assert.equal(computeSafetySignal(input(counts({ malfunction: 30 }))).confidence, 'medium');
  assert.equal(computeSafetySignal(input(counts({ malfunction: 8 }))).confidence, 'low');
});

test('event types map onto death, injury, malfunction and other', () => {
  const c = severityFromEventTypes(
    [
      { term: 'Malfunction', count: 311 },
      { term: 'Injury', count: 58 },
      { term: 'Death', count: 1 },
      { term: 'No answer provided', count: 2 },
    ],
    146
  );
  assert.deepEqual(c, { death: 1, injury: 58, malfunction: 311, other: 2, total: 372, breaks: 146 });
});

test('monthly trend covers the window and splits last 6 months from earlier', () => {
  const t = monthlyTrend(
    [
      { term: '20251020', count: 3 },
      { term: '20260501', count: 4 },
      { term: '20261016', count: 5 },
      { term: '20240101', count: 99 },
    ],
    '2025-10-18',
    '2026-10-17'
  );
  assert.equal(t.months.length, 13);
  assert.equal(t.recentTotal, 9);
  assert.equal(t.priorTotal, 3);
});

test('recalls match on the firm and count once per recall event', () => {
  assert.equal(firmToken('Medtronic Sofamor Danek USA, Inc'), 'medtronic');
  assert.equal(firmToken('Aptis Medical, LLC'), 'aptis');
  const firms = new Set(['medtronic']);
  assert.ok(firmMatches('Medtronic Navigation, Inc.', firms));
  assert.ok(!firmMatches('Stryker Corporation', firms));
  const out = dedupeRecallEvents([recall('Class II', '9'), recall('Class I', '9'), recall('Class III', '8')]);
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.id === '9')!.classification, 'Class I');
});

test('shared-PMA recalls stay on the named commercial line only', () => {
  const sk =
    'Prodisc C SK U.S. IMPLANT EXTRA LARGE 5MM. Model: PDSXL5 Total cervical disc replacement.';
  assert.ok(productMatchesBrandKey(sk, 'prodisc C SK'));
  assert.ok(!productMatchesBrandKey(sk, 'prodisc C Vivo'));
  assert.ok(productMatchesBrandKey('PRODISC C VIVO US IMPLANT MEDIUM 5MM', 'prodisc C Vivo'));
  assert.ok(!productMatchesBrandKey('PRODISC C VIVO US IMPLANT MEDIUM 5MM', 'prodisc C SK'));
});

test('keyless requests clamp count limits and cited URLs never carry a key', () => {
  assert.equal(effectiveParams({ count: 'x', limit: '1000' }, false).limit, String(KEYLESS_MAX_COUNT_LIMIT));
  assert.equal(effectiveParams({ count: 'x', limit: '1000' }, true).limit, '1000');
  const url = publicOpenFdaUrl('event', { search: 'device.brand_name:"Solera"', count: 'event_type.exact', api_key: 'SECRET' });
  assert.ok(url.startsWith('https://api.fda.gov/device/event.json?'));
  assert.doesNotMatch(url, /api_key|SECRET/);
});
