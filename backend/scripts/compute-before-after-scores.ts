/**
 * Compute before/after scores for all 15 implants to show the impact of fixes.
 * Run with: npx tsx scripts/compute-before-after-scores.ts
 */

import {
  computeCatalogScore,
  computeUtilityScore,
  applyMaudeHazard,
  scoreFromParts,
} from '../src/lib/implantDirectoryScore';
import { MAUDE_MIN_REPORTS_FOR_HAZARD } from '../src/lib/implantMaudeSignal';
import type { MaudeSignalSnapshot } from '../src/lib/implantMaudeSignal';

type ImplantData = {
  slug: string;
  brandName: string;
  company: string;
  specialty: string;
  status: 'published' | 'verified';
  description: string;
  longDescription: string | null;
  indications: string | null;
  contraindications: string | null;
  aliasCount: number;
  productImageCount: number;
  xrayCount: number;
  otherImageCount: number;
  hasTechniqueGuide: boolean;
  maudeBrandKey: string | null;
  maudeRecentTotal: number | null;
  maudePriorTotal: number | null;
  maudeRisingScore: number | null;
  maudePeerRisingPercentile: number | null;
  maudePeerVolumePercentile: number | null;
  maudeMatchesFamilyNotSpecific?: boolean;
};

const IMPLANTS: ImplantData[] = [
  {
    slug: 'prodisc-c',
    brandName: 'prodisc C',
    company: 'Centinel Spine',
    specialty: 'spine',
    status: 'published',
    description: 'Cervical total disc replacement system used for motion-preserving ACDF alternatives.',
    longDescription: null,
    indications: null,
    contraindications: null,
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: true,
    maudeBrandKey: 'prodisc C',
    maudeRecentTotal: 14,
    maudePriorTotal: 14,
    maudeRisingScore: 0,
    maudePeerRisingPercentile: 0.75,
    maudePeerVolumePercentile: 0.69,
  },
  {
    slug: 'mobi-c',
    brandName: 'Mobi-C',
    company: 'Highridge Medical',
    specialty: 'spine',
    status: 'published',
    description: 'Cervical disc arthroplasty prosthesis for one- or two-level degeneration.',
    longDescription: null,
    indications: null,
    contraindications: null,
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: false, // Removed distributor link
    maudeBrandKey: 'Mobi-C',
    maudeRecentTotal: 18,
    maudePriorTotal: 15,
    maudeRisingScore: 20,
    maudePeerRisingPercentile: 0.55,
    maudePeerVolumePercentile: 0.72,
  },
  {
    slug: 'cd-horizon-solera',
    brandName: 'CD Horizon Solera',
    company: 'Medtronic',
    specialty: 'spine',
    status: 'published',
    description: 'Thoracolumbar pedicle screw and rod fixation system.',
    longDescription: null,
    indications: null,
    contraindications: null,
    aliasCount: 2,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: false,
    maudeBrandKey: 'Solera', // Changed from CD Horizon Solera 5.5/6.0
    maudeRecentTotal: 7,
    maudePriorTotal: 3,
    // After fix: Solera-specific rising percentile is moderate, not the inflated family-wide signal
    maudeRisingScore: 45,
    maudePeerRisingPercentile: 0.55,
    maudePeerVolumePercentile: 0.28,
    maudeMatchesFamilyNotSpecific: true, // Before fix, matched all CD Horizon
  },
  {
    slug: 'simplify-cervical-disc',
    brandName: 'Simplify Cervical Artificial Disc',
    company: 'Globus Medical',
    specialty: 'spine',
    status: 'published',
    description: 'Cervical total disc replacement indicated for reconstruction at one or two contiguous levels.',
    longDescription: 'Simplify Cervical Artificial Disc (Globus Medical) is a cervical total disc replacement...',
    indications: null,
    contraindications: null,
    aliasCount: 0,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: false,
    maudeBrandKey: 'Simplify Cervical Artificial Disc',
    maudeRecentTotal: 4,
    maudePriorTotal: 2,
    maudeRisingScore: 100,
    maudePeerRisingPercentile: 0.65,
    maudePeerVolumePercentile: 0.15,
  },
  {
    slug: 'infuse-bone-graft',
    brandName: 'INFUSE Bone Graft',
    company: 'Medtronic',
    specialty: 'spine',
    status: 'published',
    description: 'rhBMP-2 bone graft kit used as an adjunct in indicated spinal fusion procedures.',
    longDescription: null,
    indications: null,
    contraindications: null,
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: false,
    maudeBrandKey: 'INFUSE',
    maudeRecentTotal: 25,
    maudePriorTotal: 30,
    maudeRisingScore: -15,
    maudePeerRisingPercentile: 0.35,
    maudePeerVolumePercentile: 0.82,
  },
  {
    slug: 'persona-knee',
    brandName: 'Persona Knee',
    company: 'Zimmer Biomet',
    specialty: 'hip-knee-arthroplasty',
    status: 'published',
    description: 'Personalized total knee arthroplasty system.',
    longDescription: 'Persona Knee (Zimmer Biomet) is a total knee arthroplasty system...',
    indications: 'See current manufacturer labeling / IFU.',
    contraindications: 'See current manufacturer labeling / IFU.',
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: true,
    maudeBrandKey: 'Persona',
    maudeRecentTotal: 45,
    maudePriorTotal: 40,
    maudeRisingScore: 12,
    maudePeerRisingPercentile: 0.45,
    maudePeerVolumePercentile: 0.88,
  },
  {
    slug: 'exeter-hip',
    brandName: 'Exeter',
    company: 'Stryker',
    specialty: 'hip-knee-arthroplasty',
    status: 'published',
    description: 'Cemented femoral stem system for total hip arthroplasty.',
    longDescription: 'The Exeter Hip System (Stryker) is a cemented femoral stem platform...',
    indications: 'See current manufacturer labeling / IFU.',
    contraindications: 'See current manufacturer labeling / IFU.',
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: false,
    maudeBrandKey: 'Exeter',
    maudeRecentTotal: 12,
    maudePriorTotal: 15,
    maudeRisingScore: -20,
    maudePeerRisingPercentile: 0.25,
    maudePeerVolumePercentile: 0.55,
  },
  {
    slug: 'equinoxe-shoulder',
    brandName: 'Equinoxe',
    company: 'Exactech',
    specialty: 'shoulder-elbow',
    status: 'published',
    description: 'Anatomic and reverse shoulder arthroplasty platform.',
    longDescription: 'Equinoxe (Exactech) covers anatomic and reverse shoulder...',
    indications: 'See current manufacturer labeling / IFU.',
    contraindications: 'See current manufacturer labeling / IFU.',
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: false, // Removed distributor link
    maudeBrandKey: 'Equinoxe',
    maudeRecentTotal: 8,
    maudePriorTotal: 6,
    maudeRisingScore: 33,
    maudePeerRisingPercentile: 0.60,
    maudePeerVolumePercentile: 0.45,
  },
  {
    slug: 'swivelock-anchor',
    brandName: 'SwiveLock',
    company: 'Arthrex',
    specialty: 'sports',
    status: 'published',
    description: 'Knotless suture anchor for rotator cuff and soft-tissue repairs.',
    longDescription: 'SwiveLock (Arthrex) is a knotless suture-anchor family...',
    indications: 'See current manufacturer labeling / IFU.',
    contraindications: 'See current manufacturer labeling / IFU.',
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: true,
    maudeBrandKey: 'SwiveLock',
    maudeRecentTotal: 3,
    maudePriorTotal: 2,
    maudeRisingScore: 50,
    maudePeerRisingPercentile: 0.70,
    maudePeerVolumePercentile: 0.20,
  },
  {
    slug: 'tfn-advanced',
    brandName: 'TFN-ADVANCED',
    company: 'DePuy Synthes',
    specialty: 'ortho-trauma',
    status: 'published',
    description: 'Proximal femoral nailing system for hip fracture fixation.',
    longDescription: 'TFN-ADVANCED (DePuy Synthes) is used for proximal femoral fracture fixation...',
    indications: 'See current manufacturer labeling / IFU.',
    contraindications: 'See current manufacturer labeling / IFU.',
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: true,
    maudeBrandKey: 'TFN-ADVANCED',
    maudeRecentTotal: 6,
    maudePriorTotal: 4,
    maudeRisingScore: 50,
    maudePeerRisingPercentile: 0.55,
    maudePeerVolumePercentile: 0.35,
  },
  {
    slug: 'infinity-ankle',
    brandName: 'INFINITY',
    company: 'Stryker',
    specialty: 'foot-ankle',
    status: 'published',
    description: 'Total ankle arthroplasty system.',
    longDescription: 'INFINITY Total Ankle (Stryker) is indexed under foot-ankle...',
    indications: 'See current manufacturer labeling / IFU.',
    contraindications: 'See current manufacturer labeling / IFU.',
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: false,
    maudeBrandKey: 'INFINITY',
    maudeRecentTotal: 2,
    maudePriorTotal: 0,
    maudeRisingScore: 200,
    maudePeerRisingPercentile: 0.85,
    maudePeerVolumePercentile: 0.10,
  },
  {
    slug: 'aptis-druj',
    brandName: 'Aptis DRUJ',
    company: 'Aptis Medical',
    specialty: 'hand',
    status: 'published',
    description: 'Distal radioulnar joint prosthesis.',
    longDescription: 'Aptis DRUJ prosthesis is indexed under hand specialty...',
    indications: 'See current manufacturer labeling / IFU.',
    contraindications: 'See current manufacturer labeling / IFU.',
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: false,
    maudeBrandKey: 'Aptis',
    maudeRecentTotal: 1,
    maudePriorTotal: 1,
    maudeRisingScore: 0,
    maudePeerRisingPercentile: 0.50,
    maudePeerVolumePercentile: 0.15,
  },
  {
    slug: 'pediloc',
    brandName: 'PediLoc',
    company: 'OrthoPediatrics',
    specialty: 'ortho-peds',
    status: 'published',
    description: 'Pediatric locked plating system.',
    longDescription: 'PediLoc (OrthoPediatrics) is a pediatric plating platform...',
    indications: 'See current manufacturer labeling / IFU.',
    contraindications: 'See current manufacturer labeling / IFU.',
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: false,
    maudeBrandKey: 'PediLoc',
    maudeRecentTotal: 0,
    maudePriorTotal: 0,
    maudeRisingScore: null,
    maudePeerRisingPercentile: null,
    maudePeerVolumePercentile: null,
  },
  {
    slug: 'gmrs',
    brandName: 'GMRS',
    company: 'Stryker',
    specialty: 'ortho-onc',
    status: 'published',
    description: 'Modular endoprosthetic system for limb-salvage reconstruction.',
    longDescription: 'GMRS (Stryker) modular replacement constructs are used after tumor resection...',
    indications: 'See current manufacturer labeling / IFU.',
    contraindications: 'See current manufacturer labeling / IFU.',
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: false,
    maudeBrandKey: 'GMRS',
    maudeRecentTotal: 3,
    maudePriorTotal: 2,
    maudeRisingScore: 50,
    maudePeerRisingPercentile: 0.65,
    maudePeerVolumePercentile: 0.30,
  },
  {
    slug: 'osteocel',
    brandName: 'Osteocel',
    company: 'NuVasive',
    specialty: 'biologics',
    status: 'published',
    description: 'Cellular allograft bone matrix.',
    longDescription: 'Osteocel (NuVasive) is indexed under biologics...',
    indications: 'See current manufacturer labeling / IFU.',
    contraindications: 'See current manufacturer labeling / IFU.',
    aliasCount: 1,
    productImageCount: 0,
    xrayCount: 0,
    otherImageCount: 0,
    hasTechniqueGuide: false,
    maudeBrandKey: 'Osteocel',
    maudeRecentTotal: 1,
    maudePriorTotal: 0,
    maudeRisingScore: 100,
    maudePeerRisingPercentile: 0.75,
    maudePeerVolumePercentile: 0.10,
  },
];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// OLD hazard calculation (before fix) - no minimum threshold
function hazardFromPeerStatsOLD(input: {
  risingScore: number;
  recentTotal: number;
  priorTotal: number;
  peerRisingPercentile: number;
  peerVolumePercentile: number;
}): { hazard: number; label: string; quietScore: number } {
  const n = input.recentTotal + input.priorTotal;
  const risingP = clamp01(input.peerRisingPercentile);
  const volumeP = clamp01(input.peerVolumePercentile);
  const rs = input.risingScore;

  let hazard: number;

  if (rs <= 0) {
    hazard = 0.1 * volumeP + 0.06 * Math.max(0, risingP - 0.55);
    if (rs < -20) hazard *= 0.45;
    else if (rs < 0) hazard *= 0.7;
  } else {
    const magnitude = clamp01(rs / (rs + 90));
    hazard =
      0.52 * Math.pow(risingP, 1.2) +
      0.28 * magnitude +
      0.2 * Math.pow(volumeP, 1.05);
    if (risingP >= 0.8 && rs >= 50) hazard = Math.min(1, hazard + 0.1);
    if (risingP >= 0.9 && rs >= 120) hazard = Math.min(1, hazard + 0.08);
  }

  // OLD: Small-n damping but no minimum threshold
  if (n < 2) hazard *= 0.2;
  else if (n < 5) hazard *= 0.45;
  else if (n < 10) hazard *= 0.7;

  hazard = clamp01(hazard);

  const quietScore = round1(10 * (1 - hazard));
  let label: string;
  if (n < 3 && hazard < 0.35) label = 'insufficient';
  else if (rs > 0 && hazard >= 0.55) label = 'elevated';
  else if (rs > 0 && hazard >= 0.32) label = 'watch';
  else label = 'quiet';

  return { hazard, label, quietScore };
}

// NEW hazard calculation (after fix) - with minimum threshold
function hazardFromPeerStatsNEW(input: {
  risingScore: number;
  recentTotal: number;
  priorTotal: number;
  peerRisingPercentile: number;
  peerVolumePercentile: number;
}): { hazard: number; label: string; quietScore: number } {
  const n = input.recentTotal + input.priorTotal;
  const risingP = clamp01(input.peerRisingPercentile);
  const volumeP = clamp01(input.peerVolumePercentile);
  const rs = input.risingScore;

  // NEW: Below minimum threshold, no hazard applied
  if (n < MAUDE_MIN_REPORTS_FOR_HAZARD) {
    return {
      hazard: 0,
      label: 'insufficient',
      quietScore: 10,
    };
  }

  let hazard: number;

  if (rs <= 0) {
    hazard = 0.1 * volumeP + 0.06 * Math.max(0, risingP - 0.55);
    if (rs < -20) hazard *= 0.45;
    else if (rs < 0) hazard *= 0.7;
  } else {
    const magnitude = clamp01(rs / (rs + 90));
    hazard =
      0.52 * Math.pow(risingP, 1.2) +
      0.28 * magnitude +
      0.2 * Math.pow(volumeP, 1.05);
    if (risingP >= 0.8 && rs >= 50) hazard = Math.min(1, hazard + 0.1);
    if (risingP >= 0.9 && rs >= 120) hazard = Math.min(1, hazard + 0.08);
  }

  // NEW: Gradual ramp for reports between threshold and 10
  if (n < 10) {
    const ramp = (n - MAUDE_MIN_REPORTS_FOR_HAZARD) / (10 - MAUDE_MIN_REPORTS_FOR_HAZARD);
    hazard *= 0.5 + 0.5 * ramp;
  }

  hazard = clamp01(hazard);

  const quietScore = round1(10 * (1 - hazard));
  let label: string;
  if (rs > 0 && hazard >= 0.55) label = 'elevated';
  else if (rs > 0 && hazard >= 0.32) label = 'watch';
  else label = 'quiet';

  return { hazard, label, quietScore };
}

function computeScore(implant: ImplantData, useNewLogic: boolean): { score: number; maudeLabel: string } {
  const catalogScore = computeCatalogScore({
    status: implant.status,
    company: implant.company,
    description: implant.description,
    longDescription: implant.longDescription,
    indications: implant.indications,
    contraindications: implant.contraindications,
    aliasCount: implant.aliasCount,
    productImageCount: implant.productImageCount,
    xrayCount: implant.xrayCount,
    otherImageCount: implant.otherImageCount,
    hasTechniqueGuide: implant.hasTechniqueGuide,
  });

  const { utility } = computeUtilityScore(catalogScore, null, 0);

  if (implant.maudeRecentTotal === null || implant.maudePriorTotal === null) {
    return { score: utility, maudeLabel: 'unlinked' };
  }

  const hazardCalc = useNewLogic ? hazardFromPeerStatsNEW : hazardFromPeerStatsOLD;
  
  // For CD Horizon Solera BEFORE fix: simulate matching all CD Horizon family
  // The family matching inflated volume percentile and the rising score
  let recentTotal = implant.maudeRecentTotal;
  let priorTotal = implant.maudePriorTotal;
  let peerVolumePercentile = implant.maudePeerVolumePercentile ?? 0.5;
  let risingScore = implant.maudeRisingScore ?? 0;
  
  if (!useNewLogic && implant.maudeMatchesFamilyNotSpecific) {
    // Simulate matching all CD Horizon variants: 
    // - Much higher report count (83 vs 10)
    // - Higher peer volume percentile (0.92 vs 0.28)
    // - Family had rising issues too
    recentTotal = 45;
    priorTotal = 38;
    peerVolumePercentile = 0.92;
    risingScore = 287;
  }

  const { hazard, label } = hazardCalc({
    risingScore,
    recentTotal,
    priorTotal,
    peerRisingPercentile: implant.maudePeerRisingPercentile ?? 0.5,
    peerVolumePercentile,
  });

  const finalScore = applyMaudeHazard(utility, hazard, label as any);
  return { score: finalScore, maudeLabel: label };
}

function main() {
  console.log('\n## Before/After Score Comparison (All 15 Implants)\n');
  console.log('| Implant | Specialty | Total Reports | Before Score | Before Label | After Score | After Label | Change |');
  console.log('|---------|-----------|---------------|--------------|--------------|-------------|-------------|--------|');

  for (const implant of IMPLANTS) {
    const before = computeScore(implant, false);
    const after = computeScore(implant, true);
    const change = after.score - before.score;
    const changeStr = change === 0 ? 'n/a' : change > 0 ? `+${change.toFixed(1)}` : change.toFixed(1);
    const totalReports = (implant.maudeRecentTotal ?? 0) + (implant.maudePriorTotal ?? 0);
    const reportsStr = implant.maudeRecentTotal === null ? 'n/a' : totalReports.toString();
    
    console.log(
      `| ${implant.brandName} | ${implant.specialty} | ${reportsStr} | ${before.score.toFixed(1)} | ${before.maudeLabel} | ${after.score.toFixed(1)} | ${after.maudeLabel} | ${changeStr} |`
    );
  }

  console.log('\n### Score Changes Explained\n');
  console.log('**MAUDE minimum report threshold (5 reports)**:');
  console.log('- Products with <5 MAUDE reports now get `insufficient` label with no hazard penalty');
  console.log('- Products with 5-10 reports get a gradual hazard ramp (reduced impact)');
  console.log('- Products with 10+ reports get full hazard calculation');
  console.log('');
  console.log('**Affected by minimum threshold**:');
  console.log('- **INFINITY ankle** (2 reports): No longer penalized by MAUDE hazard');
  console.log('- **SwiveLock** (5 reports): At threshold, gradual ramp applied');
  console.log('- **Simplify** (6 reports): Just above threshold, gradual ramp applied');
  console.log('- **Aptis DRUJ** (2 reports): Below threshold, no hazard');
  console.log('- **Osteocel** (1 report): Below threshold, no hazard');
  console.log('- **GMRS** (5 reports): At threshold, gradual ramp applied');
  console.log('');
  console.log('**CD Horizon Solera brand matching fix**:');
  console.log('- Before: maudeBrandKey matched entire "CD Horizon" family (simulated as 83 reports)');
  console.log('- After: maudeBrandKey="Solera" matches only Solera-specific reports (10 reports)');
  console.log('');
  console.log(`Minimum threshold constant: MAUDE_MIN_REPORTS_FOR_HAZARD = ${MAUDE_MIN_REPORTS_FOR_HAZARD}`);

  console.log('\n---\n');
  console.log('## FDA Data Added (6 Records)\n');
  console.log('| Device | FDA Number | Decision Date | Applicant | Source URL |');
  console.log('|--------|------------|---------------|-----------|------------|');
  console.log('| prodisc C | P050010 (PMA) | 2007-12-17 | Centinel Spine, LLC | https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?ID=P050010 |');
  console.log('| Mobi-C | P110009 (PMA) | 2013-08-23 | Highridge Medical, LLC | https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?ID=P110009 |');
  console.log('| Simplify | P200022 (PMA) | 2020-09-18 | Globus Medical, Inc. | https://www.accessdata.fda.gov/cdrh_docs/pdf20/P200022B.pdf |');
  console.log('| INFUSE Bone Graft | P000058 (PMA) | 2002-07-02 | Medtronic Sofamor Danek USA, Inc. | https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?ID=P000058 |');
  console.log('| INFINITY | K122752 (510k) | 2013-07-31 | Stryker Orthopaedics | https://www.accessdata.fda.gov/cdrh_docs/pdf12/K122752.pdf |');
  console.log('| CD Horizon Solera | K073633 (510k) | n/a | Medtronic Spinal and Biologics | https://www.accessdata.fda.gov/cdrh_docs/pdf7/K073633.pdf |');
}

main();
