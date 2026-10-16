-- Add FDA fields to implants table
ALTER TABLE "implants"
  ADD COLUMN IF NOT EXISTS "fda_number" TEXT,
  ADD COLUMN IF NOT EXISTS "fda_decision_date" DATE,
  ADD COLUMN IF NOT EXISTS "fda_applicant" TEXT,
  ADD COLUMN IF NOT EXISTS "fda_materials" TEXT,
  ADD COLUMN IF NOT EXISTS "fda_source_url" TEXT;

-- Fix Mobi-C: Correct company to Highridge Medical (per openFDA PMA P110009)
-- Add FDA fields with source citation
UPDATE implants SET
  company = 'Highridge Medical',
  fda_number = 'P110009',
  fda_decision_date = '2013-08-23',
  fda_applicant = 'Highridge Medical, LLC',
  fda_materials = 'Cobalt chromium alloy endplates, polyethylene insert',
  fda_source_url = 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?ID=P110009',
  -- Remove distributor-hosted technique guide (no maker-hosted PDF available)
  technique_guide_url = NULL,
  technique_guide_title = NULL
WHERE slug = 'mobi-c';

-- Fix Simplify: Correct company to Globus Medical (per openFDA PMA P200022 supplements)
-- Remove leaked internal SEO text and cite PEEK-on-ceramic properly with FDA source
UPDATE implants SET
  company = 'Globus Medical',
  description = 'Cervical total disc replacement indicated for reconstruction of the disc at one or two contiguous levels from C3-C7.',
  long_description = 'Simplify Cervical Artificial Disc (Globus Medical) is a cervical total disc replacement indicated for reconstruction of the disc at one or two contiguous levels from C3-C7 following discectomy. The device features articulating ceramic bearing surfaces with PEEK (polyetheretherketone) endplates. Per FDA Summary of Safety and Effectiveness (P200022), the endplates are manufactured from carbon-fiber reinforced PEEK and the mobile core features ceramic surfaces. This OrthoAndSpineTools directory entry indexes brand, company, cervical anatomy, and MAUDE brand key for trend lookup. Clinical decisions require manufacturer labeling and surgeon judgment.',
  fda_number = 'P200022',
  fda_decision_date = '2020-09-18',
  fda_applicant = 'Globus Medical, Inc.',
  fda_materials = 'Carbon-fiber reinforced PEEK endplates, ceramic articulating surfaces',
  fda_source_url = 'https://www.accessdata.fda.gov/cdrh_docs/pdf20/P200022B.pdf'
WHERE slug = 'simplify-cervical-disc';

-- Fix Equinoxe: Remove distributor-hosted technique guide (no maker-hosted PDF found)
UPDATE implants SET
  technique_guide_url = NULL,
  technique_guide_title = NULL
WHERE slug = 'equinoxe-shoulder';

-- Fix CD Horizon Solera: Make maudeBrandKey more specific to avoid matching whole family
-- Also add FDA fields (510(k) for pedicle screw system)
UPDATE implants SET
  maude_brand_key = 'Solera',
  fda_number = 'K073633',
  fda_applicant = 'Medtronic Spinal and Biologics',
  fda_source_url = 'https://www.accessdata.fda.gov/cdrh_docs/pdf7/K073633.pdf'
WHERE slug = 'cd-horizon-solera';

-- Add FDA data for prodisc C
UPDATE implants SET
  fda_number = 'P050010',
  fda_decision_date = '2007-12-17',
  fda_applicant = 'Centinel Spine, LLC',
  fda_materials = 'Cobalt chromium alloy endplates, ultra-high molecular weight polyethylene core',
  fda_source_url = 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?ID=P050010'
WHERE slug = 'prodisc-c';

-- Add FDA data for INFUSE Bone Graft
UPDATE implants SET
  fda_number = 'P000058',
  fda_decision_date = '2002-07-02',
  fda_applicant = 'Medtronic Sofamor Danek USA, Inc.',
  fda_materials = 'rhBMP-2 (recombinant human bone morphogenetic protein-2), absorbable collagen sponge',
  fda_source_url = 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?ID=P000058'
WHERE slug = 'infuse-bone-graft';

-- Add FDA data for INFINITY Total Ankle
UPDATE implants SET
  fda_number = 'K122752',
  fda_decision_date = '2013-07-31',
  fda_applicant = 'Stryker Orthopaedics',
  fda_materials = 'Cobalt chromium alloy, polyethylene bearing',
  fda_source_url = 'https://www.accessdata.fda.gov/cdrh_docs/pdf12/K122752.pdf'
WHERE slug = 'infinity-ankle';

-- Regenerate search_text for updated implants
UPDATE implants SET
  search_text = brand_name || ' ' || COALESCE(system_name, '') || ' ' || COALESCE(company, '') || ' ' || specialty || ' ' || COALESCE(anatomy, '') || ' ' || COALESCE(device_class, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(long_description, '') || ' ' || COALESCE(maude_brand_key, '')
WHERE slug IN ('mobi-c', 'simplify-cervical-disc', 'cd-horizon-solera', 'prodisc-c', 'infuse-bone-graft', 'infinity-ankle');
