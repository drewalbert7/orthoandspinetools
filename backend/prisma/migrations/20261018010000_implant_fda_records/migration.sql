-- Multiple verified FDA records per implant (PR #14). Idempotent; safe to re-run.
--
-- Mobi-C has two separate original PMA approvals, both verified on 2026-10-17 against
-- openFDA device/pma (supplement_number "") and the accessdata pma.cfm pages:
--   P110002  MOBI-C CERVICAL DISC PROSTHESIS (ONE-LEVEL INDICATION)  decision 2013-08-07
--            applicant Highridge Medical, LLC, product code MJO
--            https://api.fda.gov/device/pma.json?search=pma_number:"P110002"+AND+supplement_number:""
--            https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=P110002
--   P110009  MOBI-C CERVICAL DISC PROSTHESIS (TWO-LEVEL INDICATION)  decision 2013-08-23
--            applicant Highridge Medical, LLC, product code MJO
--            https://api.fda.gov/device/pma.json?search=pma_number:"P110009"+AND+supplement_number:""
--            https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=P110009
-- The applicant is the holder FDA lists today on both sources.
-- The single fda_* columns keep P110009 (unchanged values) for older readers.

ALTER TABLE "implants" ADD COLUMN IF NOT EXISTS "fda_records" JSONB;

UPDATE "implants"
SET "fda_records" = '[
  {"number": "P110002", "label": "One-level indication (C3-C7)", "decisionDate": "2013-08-07", "applicant": "Highridge Medical, LLC", "sourceUrl": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=P110002"},
  {"number": "P110009", "label": "Two-level indication (contiguous levels, C3-C7)", "decisionDate": "2013-08-23", "applicant": "Highridge Medical, LLC", "sourceUrl": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=P110009"}
]'::jsonb,
    "fda_number" = 'P110009',
    "fda_decision_date" = DATE '2013-08-23',
    "fda_applicant" = 'Highridge Medical, LLC',
    "fda_source_url" = 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=P110009'
WHERE "slug" = 'mobi-c';
