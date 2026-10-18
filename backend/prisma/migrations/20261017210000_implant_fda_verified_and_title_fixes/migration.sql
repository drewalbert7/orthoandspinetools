-- Implant FDA data verified against openFDA (api.fda.gov), 2026-10-17.
-- Rule: a value is written only when exactly one openFDA record matches the listing's
-- system (same device and maker family). Anything ambiguous or unverified is left NULL
-- and the detail page shows "Not on file". Values from 20261016030000 that openFDA
-- contradicts are cleared. Data only; no schema change. Idempotent (safe to re-run).

-- 1) prodisc C: P050010 is the ProDisc-L lumbar PMA (openFDA trade_name
--    "PRODISC -L TOTAL DISC REPLACEMENT DEVICE", decision 2006-08-14).
--    The prodisc C original PMA is P070001.
--    Source: https://api.fda.gov/device/pma.json?search=pma_number:"P070001"
--      trade_name "PRODISC TM-C TOTAL DISC REPLACEMENT", applicant "Centinel Spine, LLC",
--      decision_date 2007-12-17 (original, no supplement_number).
UPDATE implants SET
  fda_number = 'P070001',
  fda_decision_date = '2007-12-17',
  fda_applicant = 'Centinel Spine, LLC',
  fda_source_url = 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=P070001'
WHERE slug = 'prodisc-c';

-- 2) CD Horizon Solera: K073633 is a Stryker ESSX microdebrider (openFDA
--    https://api.fda.gov/device/510k.json?search=k_number:"K073633").
--    No single openFDA 510(k) names the Solera implant system, so leave blank.
UPDATE implants SET
  fda_number = NULL,
  fda_decision_date = NULL,
  fda_applicant = NULL,
  fda_materials = NULL,
  fda_source_url = NULL
WHERE slug = 'cd-horizon-solera' AND fda_number = 'K073633';

-- 3) INFINITY total ankle: K122752 is a Branan Medical drug screen dipstick (openFDA
--    https://api.fda.gov/device/510k.json?search=k_number:"K122752").
--    openFDA lists several INFINITY Total Ankle System 510(k)s (K123954, K140749,
--    K172633, K181557, ...), so no single number is unambiguous. Leave blank.
UPDATE implants SET
  fda_number = NULL,
  fda_decision_date = NULL,
  fda_applicant = NULL,
  fda_materials = NULL,
  fda_source_url = NULL
WHERE slug = 'infinity-ankle' AND fda_number = 'K122752';

-- 4) GMRS: exactly one openFDA 510(k) names the system.
--    Source: https://api.fda.gov/device/510k.json?search=k_number:"K023087"
--      device_name "GLOBAL MODULAR REPLACEMENT SYSTEM (GMRS)", applicant
--      "Howmedica Osteonics Corp.", decision_date 2002-12-16, product_code KRO.
--    (K022403 and K031217 are "GMRS PRESS FIT STEMS WITH PUREFIX HA" components.)
--    Materials are not an openFDA 510(k) field, so they stay NULL.
UPDATE implants SET
  fda_number = 'K023087',
  fda_decision_date = '2002-12-16',
  fda_applicant = 'Howmedica Osteonics Corp.',
  fda_source_url = 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K023087'
WHERE slug = 'gmrs' AND fda_number IS NULL;

-- Kept as is (verified against openFDA): simplify-cervical-disc P200022, infuse-bone-graft
-- P000058, mobi-c P110009 (two-level PMA; openFDA also lists P110002 for one-level Mobi-C,
-- flagged for an editorial call in the PR). Their fda_materials predate this migration and
-- are not openFDA fields.

-- Left blank on purpose (openFDA checked 2026-10-17, no single unambiguous record):
--   equinoxe-shoulder  three 510(k)s named "Equinoxe Shoulder System" (K042021, K243448, K260583)
--   exeter-hip         many Exeter hip 510(k)s, none named "Exeter Hip System" alone
--   osteocel           no openFDA 510(k) or PMA record
--   aptis-druj         five Aptis Medical DRUJ implant 510(k)s
--   pediloc            three PediLoc 510(k)s (locking plate, tibia plate, fragment)
--   persona-knee       about 30 Persona knee 510(k)s
--   swivelock-anchor   18 SwiveLock 510(k)s
--   tfn-advanced       no openFDA record named TFN-ADVANCED (only older TFN records)

-- 5) Page titles: drop the em dash and the duplicate site name. The SPA appends
--    " | OrthoAndSpineTools" itself, so the stored title must not include it.
UPDATE implants
SET seo_title = regexp_replace(seo_title, '\s*[\u2014\u2013-]\s*OrthoAndSpineTools Directory\s*$', ' | Implant Directory')
WHERE seo_title ~ '[\u2014\u2013-]\s*OrthoAndSpineTools Directory\s*$';

-- 6) Stored MAUDE facet: insufficient data must not keep a 10.0 until the next recompute.
UPDATE implants SET maude_score = NULL WHERE maude_signal = 'insufficient';
