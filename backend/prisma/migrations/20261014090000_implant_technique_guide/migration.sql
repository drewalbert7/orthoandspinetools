-- Surgeon surgical technique / instructional sheet (prefer direct PDF)
ALTER TABLE "implants"
  ADD COLUMN IF NOT EXISTS "technique_guide_url" TEXT,
  ADD COLUMN IF NOT EXISTS "technique_guide_title" TEXT;

-- Seed direct PDF technique guides where publicly available (not product landing pages)
UPDATE implants SET
  technique_guide_url = 'https://www.centinelspine.com/guides/uploads/file/cent_prodisc_c_surgtechguide.pdf',
  technique_guide_title = 'Surgical technique guide'
WHERE slug = 'prodisc-c';

UPDATE implants SET
  technique_guide_url = 'https://sacchelli.it/wp-content/uploads/04-mobi-c-cervical-disc-surgical-technique-guide.pdf',
  technique_guide_title = 'Surgical technique guide'
WHERE slug = 'mobi-c';

UPDATE implants SET
  technique_guide_url = 'https://www.zimmerbiomet.com/content/dam/zb-corporate/en/education-resources/surgical-techniques/specialties/knee/persona-the-personalized-knee/persona-the-personalized-knee-surgical-technique1.pdf',
  technique_guide_title = 'Surgical technique'
WHERE slug = 'persona-knee';

UPDATE implants SET
  technique_guide_url = 'https://www.oudshoornbv.com/wp-content/uploads/2022/09/Equinoxe_Primary_Reverse.pdf',
  technique_guide_title = 'Operative technique'
WHERE slug = 'equinoxe-shoulder';

UPDATE implants SET
  technique_guide_url = 'https://faculty.washington.edu/alexbert/Shoulder/Surgery/ArthroscopicTechniques/Arthrex/SwiveLock-Technique.pdf',
  technique_guide_title = 'Surgical technique'
WHERE slug = 'swivelock-anchor';

UPDATE implants SET
  technique_guide_url = 'https://a490ebc3686a416702a4-875c9cad01df4876deaf64b6bbcf2205.ssl.cf2.rackcdn.com/ota_6d02298b40146f911e2f37490cd7f3fd.pdf',
  technique_guide_title = 'Surgical technique'
WHERE slug = 'tfn-advanced';

UPDATE implants SET
  technique_guide_url = 'https://www.accessdata.fda.gov/cdrh_docs/pdf/P000058S096D.pdf',
  technique_guide_title = 'TLIF surgical technique'
WHERE slug = 'infuse-bone-graft';
