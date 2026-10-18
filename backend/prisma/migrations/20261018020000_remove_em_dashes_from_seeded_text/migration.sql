-- Remove em dashes (U+2014) from implant text seeded by earlier migrations
-- (20261014020000, 20261014030000, 20261014050000). House style: no em dashes in
-- anything a surgeon reads. The dash is written as chr(8212) so this file has none.
-- Data only; no schema change. Each UPDATE matches the exact seeded text, so admin
-- edits are left alone. Idempotent (safe to re-run).

-- 1) Short SEO descriptions: "Brand (Maker) <dash> Implant Directory profile." becomes
--    "Brand (Maker): Implant Directory profile."
UPDATE implants
SET seo_description = replace(seo_description, ' ' || chr(8212) || ' ', ': ')
WHERE seo_description IN (
  'Persona Knee (Zimmer Biomet) ' || chr(8212) || ' TKA system profile in the Implant Directory.',
  'Exeter (Stryker) cemented hip stem ' || chr(8212) || ' Implant Directory profile.',
  'Equinoxe (Exactech) shoulder arthroplasty ' || chr(8212) || ' Implant Directory profile.',
  'SwiveLock (Arthrex) suture anchor ' || chr(8212) || ' Implant Directory sports profile.',
  'TFN-ADVANCED (DePuy Synthes) proximal femoral nail ' || chr(8212) || ' Implant Directory.',
  'INFINITY (Stryker) total ankle ' || chr(8212) || ' Implant Directory foot & ankle profile.',
  'Aptis DRUJ prosthesis ' || chr(8212) || ' Implant Directory hand profile.',
  'PediLoc (OrthoPediatrics) pediatric plate ' || chr(8212) || ' Implant Directory profile.',
  'GMRS (Stryker) modular oncology prosthesis ' || chr(8212) || ' Implant Directory profile.',
  'Osteocel (NuVasive) cellular allograft ' || chr(8212) || ' Implant Directory biologics profile.'
);

-- 2) SEO titles on databases that never ran 20261017210000 (that migration already
--    rewrites "<brand> implant <dash> OrthoAndSpineTools Directory").
UPDATE implants
SET seo_title = brand_name || ' implant | Implant Directory'
WHERE seo_title = brand_name || ' implant ' || chr(8212) || ' OrthoAndSpineTools Directory';

-- 3) INFUSE long description.
UPDATE implants
SET long_description = replace(
  long_description,
  'labeled indications are critical ' || chr(8212) || ' this page is informational identity only.',
  'labeled indications are critical. This page is informational identity only.'
)
WHERE slug = 'infuse-bone-graft'
  AND long_description LIKE '%labeled indications are critical ' || chr(8212) || ' this page is informational identity only.%';

-- 4) Preliminary editorial summaries from 20261014050000 (a recompute replaces these,
--    but a locked listing keeps them).
UPDATE implants SET ai_summary = 'High-impact rhBMP-2 biologic with extensive regulatory history. Score reflects visibility, not endorsement.'
WHERE ai_summary = 'High-impact rhBMP-2 biologic with extensive regulatory history ' || chr(8212) || ' score reflects visibility, not endorsement.';
UPDATE implants SET ai_summary = 'Specialized DRUJ reconstruction prosthesis: niche but well-defined hand indication.'
WHERE ai_summary = 'Specialized DRUJ reconstruction prosthesis ' || chr(8212) || ' niche but well-defined hand indication.';
UPDATE implants SET ai_summary = 'Modular oncology endoprosthesis for limb salvage, with high specialty relevance.'
WHERE ai_summary = 'Modular oncology endoprosthesis for limb salvage ' || chr(8212) || ' high specialty relevance.';
