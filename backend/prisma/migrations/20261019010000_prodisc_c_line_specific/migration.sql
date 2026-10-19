-- Split prodisc C into commercial lines so Directory Score / MAUDE use line-specific
-- brand keys (Vivo vs SK), not a family rollup or a shared-PMA recall dump.
-- openFDA phrase counts (12mo window checked 2026-10-18): Vivo ~45, SK ~9, family ~73.
-- Shared PMA P070001 S019 names SK / Nova / Vivo together; recall attribution is
-- filtered in code by product_description matching the brand key.

-- 1) Existing listing → prodisc C Vivo (keep slug for SEO; most report volume).
UPDATE implants SET
  brand_name = 'prodisc C Vivo',
  system_name = 'prodisc C Vivo Cervical Total Disc Replacement',
  maude_brand_key = 'prodisc C Vivo',
  description = 'prodisc C Vivo is Centinel Spine''s keel-less cervical total disc replacement line (motion-preserving ACDF alternative in indicated patients). Directory score and MAUDE use the Vivo brand key only — not SK/Nova siblings.',
  seo_title = 'prodisc C Vivo implant | Implant Directory',
  seo_description = 'prodisc C Vivo cervical TDR (Centinel Spine): directory profile, line-specific FDA MAUDE safety signal, and technique materials. Not medical advice.',
  search_text = 'prodisc C Vivo ProDisc-C Vivo Centinel Spine spine cervical cervical disc TDR arthroplasty prodisc C Vivo',
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'prodisc-c';

UPDATE implant_aliases SET alias = 'ProDisc-C Vivo'
WHERE implant_id = (SELECT id FROM implants WHERE slug = 'prodisc-c')
  AND alias IN ('ProDisc-C', 'prodisc C');

INSERT INTO implant_aliases (id, implant_id, alias)
SELECT 'cimplantaliasprodiscvivo1', id, 'ProDisc-C'
FROM implants WHERE slug = 'prodisc-c'
  AND NOT EXISTS (
    SELECT 1 FROM implant_aliases x
    WHERE x.implant_id = implants.id AND x.alias = 'ProDisc-C'
  );

-- 2) New listing: prodisc C SK (keel / SK line; Class II labeling recalls name SK).
INSERT INTO implants (
  id, slug, brand_name, system_name, company, specialty, anatomy, device_class,
  description, status, maude_brand_key, published_at, created_at, updated_at,
  long_description, seo_title, seo_description, search_text,
  fda_number, fda_decision_date, fda_applicant, fda_source_url, ai_rating_locked
)
SELECT
  'cimplantseed0001prodiscsk',
  'prodisc-c-sk',
  'prodisc C SK',
  'prodisc C SK Cervical Total Disc Replacement',
  'Centinel Spine',
  'spine',
  'cervical',
  'cervical_disc',
  'prodisc C SK is Centinel Spine''s keeled cervical total disc replacement line. Directory score and MAUDE use the SK brand key only — not Vivo/Nova siblings.',
  'published',
  'prodisc C SK',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL,
  'prodisc C SK implant | Implant Directory',
  'prodisc C SK cervical TDR (Centinel Spine): directory profile and line-specific FDA MAUDE safety signal. Not medical advice.',
  'prodisc C SK ProDisc-C SK Centinel Spine spine cervical cervical disc TDR arthroplasty keeled',
  'P070001',
  '2007-12-17',
  'Centinel Spine, LLC',
  'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=P070001',
  false
WHERE NOT EXISTS (SELECT 1 FROM implants WHERE slug = 'prodisc-c-sk');

INSERT INTO implant_aliases (id, implant_id, alias)
SELECT 'cimplantaliasprodiscsk1', id, 'ProDisc-C SK'
FROM implants WHERE slug = 'prodisc-c-sk'
  AND NOT EXISTS (
    SELECT 1 FROM implant_aliases x
    WHERE x.implant_id = implants.id AND x.alias = 'ProDisc-C SK'
  );

INSERT INTO implant_aliases (id, implant_id, alias)
SELECT 'cimplantaliasprodiscsk2', id, 'prodisc C SK'
FROM implants WHERE slug = 'prodisc-c-sk'
  AND NOT EXISTS (
    SELECT 1 FROM implant_aliases x
    WHERE x.implant_id = implants.id AND x.alias = 'prodisc C SK'
  );
