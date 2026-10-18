import {
  applyMaudeHazard,
  computeCatalogScore,
  computeUtilityScore,
  scoreFromParts,
} from './implantDirectoryScore';
import { MAUDE_MIN_REPORTS_FOR_HAZARD } from './implantMaudeSignal';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function nearly(a: number, b: number, eps = 0.15) {
  return Math.abs(a - b) <= eps;
}

/** Lightweight assertions. Run with: npx ts-node --transpile-only src/lib/implantDirectoryScore.v2.check.ts */
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

  // MAUDE math (safety signal) is covered by implantSafetySignal.test.ts (npm test).

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
      matchedBrand: 'Problem Device',
      windowLabel: '12mo',
    }
  );
  assert(breakdown.finalScore < 4.5, `problem device final ${breakdown.finalScore}`);
  assert(breakdown.facets.length >= 4, 'facets present');
  assert(breakdown.version === 'ost-dir-v3', breakdown.version);

  // Verify minimum threshold constant
  assert(MAUDE_MIN_REPORTS_FOR_HAZARD >= 5, `threshold ${MAUDE_MIN_REPORTS_FOR_HAZARD}`);

  console.log('ost-dir-v3 math checks OK', {
    richListing,
    utilityNoDiscuss,
    clean,
    dirty,
    problemFinal: breakdown.finalScore,
    minThreshold: MAUDE_MIN_REPORTS_FOR_HAZARD,
  });
}

main();
