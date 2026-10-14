-- Keep only manufacturer surgical / operative technique PDFs (not brochures, catalogs, or blocked hosts).
-- Clear INFUSE: FDA TLIF STG URL returns 403 to browsers — do not surface a dead marketing-adjacent link.
UPDATE implants
SET technique_guide_url = NULL,
    technique_guide_title = NULL
WHERE slug = 'infuse-bone-graft';

-- Mobi-C: keep Surgical Technique Guide PDF (stepwise STG, not a product brochure)
UPDATE implants SET
  technique_guide_url = 'https://sacchelli.it/wp-content/uploads/04-mobi-c-cervical-disc-surgical-technique-guide.pdf',
  technique_guide_title = 'Surgical technique guide'
WHERE slug = 'mobi-c';

-- prodisc C: Centinel Technique Guide
UPDATE implants SET
  technique_guide_url = 'https://www.centinelspine.com/guides/uploads/file/cent_prodisc_c_surgtechguide.pdf',
  technique_guide_title = 'Surgical technique guide'
WHERE slug = 'prodisc-c';

-- Persona: Zimmer Biomet surgical technique (education-resources path)
UPDATE implants SET
  technique_guide_url = 'https://www.zimmerbiomet.com/content/dam/zb-corporate/en/education-resources/surgical-techniques/specialties/knee/persona-the-personalized-knee/persona-the-personalized-knee-surgical-technique1.pdf',
  technique_guide_title = 'Surgical technique guide'
WHERE slug = 'persona-knee';

-- Equinoxe: Exactech primary/reverse operative technique (stepwise OT)
UPDATE implants SET
  technique_guide_url = 'https://www.oudshoornbv.com/wp-content/uploads/2022/09/Equinoxe_Primary_Reverse.pdf',
  technique_guide_title = 'Operative technique guide'
WHERE slug = 'equinoxe-shoulder';

-- SwiveLock: Arthrex rotator-cuff surgical technique PDF (SpeedBridge / SwiveLock lateral fixation) — not a brochure
UPDATE implants SET
  technique_guide_url = 'https://cdn.arthrex.io/image/upload/cde99104-f9ec-4783-8c83-18e9591ee663.pdf',
  technique_guide_title = 'Surgical technique guide'
WHERE slug = 'swivelock-anchor';

-- TFNA: DePuy Synthes surgical technique guide
UPDATE implants SET
  technique_guide_url = 'https://a490ebc3686a416702a4-875c9cad01df4876deaf64b6bbcf2205.ssl.cf2.rackcdn.com/ota_6d02298b40146f911e2f37490cd7f3fd.pdf',
  technique_guide_title = 'Surgical technique guide'
WHERE slug = 'tfn-advanced';
