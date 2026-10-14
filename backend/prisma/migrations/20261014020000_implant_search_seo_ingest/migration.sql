-- Implant Directory: SEO fields, search optimization, edit audit

ALTER TABLE "implants" ADD COLUMN "long_description" TEXT;
ALTER TABLE "implants" ADD COLUMN "indications" TEXT;
ALTER TABLE "implants" ADD COLUMN "contraindications" TEXT;
ALTER TABLE "implants" ADD COLUMN "seo_title" TEXT;
ALTER TABLE "implants" ADD COLUMN "seo_description" TEXT;
ALTER TABLE "implants" ADD COLUMN "search_text" TEXT NOT NULL DEFAULT '';

CREATE INDEX "implants_status_published_at_idx" ON "implants"("status", "published_at");

CREATE TABLE "implant_edit_logs" (
    "id" TEXT NOT NULL,
    "implant_id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implant_edit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "implant_edit_logs_implant_id_created_at_idx" ON "implant_edit_logs"("implant_id", "created_at");

ALTER TABLE "implant_edit_logs" ADD CONSTRAINT "implant_edit_logs_implant_id_fkey" FOREIGN KEY ("implant_id") REFERENCES "implants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trigram + full-text search (Postgres)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

UPDATE "implants" SET "search_text" = trim(both ' ' FROM concat_ws(' ',
  "brand_name",
  COALESCE("system_name", ''),
  COALESCE("company", ''),
  "specialty",
  COALESCE("anatomy", ''),
  replace("device_class", '_', ' '),
  COALESCE("description", ''),
  COALESCE("long_description", ''),
  COALESCE("maude_brand_key", ''),
  COALESCE((
    SELECT string_agg(a."alias", ' ')
    FROM "implant_aliases" a
    WHERE a."implant_id" = "implants"."id"
  ), '')
));

CREATE INDEX "implants_search_text_trgm_idx" ON "implants" USING gin ("search_text" gin_trgm_ops);
CREATE INDEX "implants_brand_name_trgm_idx" ON "implants" USING gin ("brand_name" gin_trgm_ops);
CREATE INDEX "implants_search_text_fts_idx" ON "implants" USING gin (to_tsvector('english', coalesce("search_text", '')));
CREATE INDEX "implant_aliases_alias_trgm_idx" ON "implant_aliases" USING gin ("alias" gin_trgm_ops);

-- Enrich seed long descriptions for AI SEO detail pages
UPDATE "implants" SET
  "long_description" = CASE "slug"
    WHEN 'prodisc-c' THEN 'prodisc C is a cervical total disc replacement (TDR) system from Centinel Spine used as a motion-preserving alternative to ACDF in indicated patients with symptomatic cervical disc disease. Directory profile covers brand identity, anatomy (cervical), device class, and links to FDA MAUDE adverse-event trends for clinical signal monitoring. Not a substitute for labeling or IFU.'
    WHEN 'mobi-c' THEN 'Mobi-C is a cervical disc arthroplasty prosthesis (Zimmer Biomet) indicated for one- or two-level degeneration in appropriately selected patients. This OrthoAndSpineTools directory entry indexes brand, company, cervical anatomy, and MAUDE brand key for trend lookup. Clinical decisions require manufacturer labeling and surgeon judgment.'
    WHEN 'cd-horizon-solera' THEN 'CD Horizon Solera is a Medtronic thoracolumbar pedicle screw and rod fixation system used in fusion constructs. This directory listing provides searchable brand/system identity, specialty/anatomy tags, and a MAUDE brand key for adverse-event trend charts. Verify current product codes and IFU with the manufacturer.'
    WHEN 'simplify-cervical-disc' THEN 'Simplify Cervical Artificial Disc (NuVasive) is an MRI-friendly cervical TDR with PEEK-on-ceramic articulation. Profile pages support AI/SEO discovery via HTML + Markdown twins and structured MedicalDevice markup. Confirm indications/contraindications in current labeling.'
    WHEN 'infuse-bone-graft' THEN 'INFUSE Bone Graft (Medtronic) is an rhBMP-2 kit used as an adjunct in indicated spinal fusion procedures. Directory entry links brand aliases (including rhBMP-2) and MAUDE trend monitoring. Regulatory history and labeled indications are critical — this page is informational identity only.'
    ELSE COALESCE("description", "brand_name" || ' orthopedic implant profile')
  END,
  "seo_title" = "brand_name" || ' implant — OrthoAndSpineTools Directory',
  "seo_description" = left(COALESCE("description", "brand_name" || ' orthopedic implant profile'), 160),
  "indications" = COALESCE("indications", 'See current manufacturer labeling / IFU for labeled indications.'),
  "contraindications" = COALESCE("contraindications", 'See current manufacturer labeling / IFU. Directory notes are not medical advice.')
WHERE "long_description" IS NULL OR "slug" IN ('prodisc-c', 'mobi-c', 'cd-horizon-solera', 'simplify-cervical-disc', 'infuse-bone-graft');

-- Refresh search_text after long_description enrichment
UPDATE "implants" SET "search_text" = trim(both ' ' FROM concat_ws(' ',
  "brand_name",
  COALESCE("system_name", ''),
  COALESCE("company", ''),
  "specialty",
  COALESCE("anatomy", ''),
  replace("device_class", '_', ' '),
  COALESCE("description", ''),
  COALESCE("long_description", ''),
  COALESCE("maude_brand_key", ''),
  COALESCE((
    SELECT string_agg(a."alias", ' ')
    FROM "implant_aliases" a
    WHERE a."implant_id" = "implants"."id"
  ), '')
));
