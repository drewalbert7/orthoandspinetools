import {
  applyMaudeHazard,
  computeCatalogScore,
  computeUtilityScore,
  scoreFromParts,
} from './implantDirectoryScore';
import { hazardFromPeerStats } from './implantMaudeSignal';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function nearly(a: number, b: number, eps = 0.15) {
  return Math.abs(a - b) <= eps;
}

/** Lightweight assertions — run with: npx ts-node --transpile-only src/lib/implantDirectoryScore.v2.test.ts */
function main() {
  // Rich listing alone must not look "great" without discussion
  const richListing = computeCatalogScore({
    status: 'verified',
    company: 'Acme',
    description: 'x'.repeat(200),
    longDescription: 'y'.repeat(800),
    indications: 'z'.repeat(50),
    contraindications: 'w'.repeat(50),
    aliasCount: 3,
    productImageCount: 1,
    xrayCount: 2,
    otherImageCount: 1,
    hasTechniqueGuide: true,
  });
  assert(richListing >= 8, `expected rich listing >= 8, got ${richListing}`);
  const { utility: utilityNoDiscuss } = computeUtilityScore(richListing, null, 0);
  assert(
    utilityNoDiscuss < richListing - 0.8,
    `utility without discussion should shrink toward 5 (got ${utilityNoDiscuss} from ${richListing})`
  );

  // Hot peer rising → high hazard
  const hot = hazardFromPeerStats({
    risingScore: 200,
    recentTotal: 40,
    priorTotal: 8,
    peerRisingPercentile: 0.95,
    peerVolumePercentile: 0.7,
  });
  assert(hot.hazard >= 0.55, `hot hazard expected elevated, got ${hot.hazard}`);
  assert(hot.label === 'elevated', `label ${hot.label}`);

  // Quiet / declining
  const quiet = hazardFromPeerStats({
    risingScore: -20,
    recentTotal: 5,
    priorTotal: 12,
    peerRisingPercentile: 0.15,
    peerVolumePercentile: 0.2,
  });
  assert(quiet.hazard < 0.32, `quiet hazard ${quiet.hazard}`);
  assert(quiet.label === 'quiet' || quiet.label === 'insufficient', quiet.label);

  // Flat window must stay quiet even if peer rising-pctl looks high (ProDisc-C case)
  const flat = hazardFromPeerStats({
    risingScore: 0,
    recentTotal: 14,
    priorTotal: 14,
    peerRisingPercentile: 0.75,
    peerVolumePercentile: 0.69,
  });
  assert(flat.label === 'quiet', `flat must be quiet, got ${flat.label}`);
  assert(flat.hazard < 0.32, `flat hazard ${flat.hazard}`);

  // Declining mid-pack peers must not become watch
  const declining = hazardFromPeerStats({
    risingScore: -30,
    recentTotal: 13,
    priorTotal: 14,
    peerRisingPercentile: 0.64,
    peerVolumePercentile: 0.64,
  });
  assert(declining.label === 'quiet', `declining must be quiet, got ${declining.label}`);

  // Real rising outlier (Solera-like) stays elevated
  const risingOutlier = hazardFromPeerStats({
    risingScore: 287,
    recentTotal: 7,
    priorTotal: 3,
    peerRisingPercentile: 0.97,
    peerVolumePercentile: 0.28,
  });
  assert(risingOutlier.label === 'elevated', `rising outlier ${risingOutlier.label}`);
  assert(risingOutlier.hazard >= 0.55, `rising outlier H ${risingOutlier.hazard}`);

  // Asymmetry: quiet does not punish; elevated crushes
  const u = 8.0;
  const clean = applyMaudeHazard(u, 0.2, 'quiet');
  const watch = applyMaudeHazard(u, 0.4, 'watch');
  const dirty = applyMaudeHazard(u, 0.8, 'elevated');
  assert(nearly(clean, 8), `quiet must preserve utility (got ${clean})`);
  assert(watch < clean && watch > dirty, `watch mid ${watch}`);
  assert(dirty <= 3.5, `elevated must pull hard (got ${dirty})`);
  assert(dirty < clean - 3, 'asymmetric gap');

  // Full scoreFromParts: elevated MAUDE cannot be saved by rich listing
  const breakdown = scoreFromParts(
    {
      status: 'verified',
      company: 'Acme',
      description: 'x'.repeat(200),
      longDescription: 'y'.repeat(800),
      indications: 'z'.repeat(50),
      contraindications: 'w'.repeat(50),
      aliasCount: 2,
      productImageCount: 1,
      xrayCount: 1,
      otherImageCount: 0,
      hasTechniqueGuide: true,
    },
    [],
    {
      linked: true,
      label: 'elevated',
      hazard: 0.75,
      quietScore: 2.5,
      recentTotal: 30,
      priorTotal: 5,
      changePct: 200,
      risingScore: 180,
      peerRisingPercentile: 0.92,
      peerVolumePercentile: 0.8,
      peerCount: 20,
      matchedBrand: 'Problem Device',
      windowLabel: '6mo',
    }
  );
  assert(breakdown.finalScore < 4.5, `problem device final ${breakdown.finalScore}`);
  assert(breakdown.facets.length >= 4, 'facets present');
  assert(breakdown.version === 'ost-dir-v2', breakdown.version);

  console.log('ost-dir-v2 math checks OK', {
    richListing,
    utilityNoDiscuss,
    hot: hot.hazard,
    quiet: quiet.hazard,
    clean,
    dirty,
    problemFinal: breakdown.finalScore,
  });
}

main();
