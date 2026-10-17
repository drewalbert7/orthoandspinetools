-- CreateTable: implant_catalog_staging
-- Staging table for FDA-sourced implant data before human review and promotion to live.
-- Every populated field carries a citation via the field_citations JSONB column.

CREATE TABLE "implant_catalog_staging" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_record_id" TEXT NOT NULL,
    "product_code" TEXT,
    "fda_number" TEXT,
    "fda_decision_date" DATE,
    "fda_applicant" TEXT,
    "device_name" TEXT,
    "device_class" TEXT,
    "material" TEXT,
    "components" TEXT,
    "advisory_committee" TEXT,
    "raw_json" JSONB NOT NULL,
    "field_citations" JSONB NOT NULL DEFAULT '{}',
    "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review_status" TEXT NOT NULL DEFAULT 'pending',
    "review_notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "implant_catalog_staging_pkey" PRIMARY KEY ("id")
);

-- Dedupe key: unique per source + source_record_id (K-number or P-number)
CREATE UNIQUE INDEX "implant_catalog_staging_source_record_unique" ON "implant_catalog_staging"("source", "source_record_id");

-- Query indexes for review workflow
CREATE INDEX "implant_catalog_staging_review_status_idx" ON "implant_catalog_staging"("review_status");
CREATE INDEX "implant_catalog_staging_product_code_idx" ON "implant_catalog_staging"("product_code");
CREATE INDEX "implant_catalog_staging_fda_number_idx" ON "implant_catalog_staging"("fda_number");
CREATE INDEX "implant_catalog_staging_fda_applicant_idx" ON "implant_catalog_staging"("fda_applicant");
CREATE INDEX "implant_catalog_staging_device_name_idx" ON "implant_catalog_staging"("device_name");
CREATE INDEX "implant_catalog_staging_created_at_idx" ON "implant_catalog_staging"("created_at");

-- CreateTable: implant_catalog_staging_citation
-- Per-field source/citation tracking for full provenance.

CREATE TABLE "implant_catalog_staging_citation" (
    "id" TEXT NOT NULL,
    "staging_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "raw_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implant_catalog_staging_citation_pkey" PRIMARY KEY ("id")
);

-- One citation per field per staging record
CREATE UNIQUE INDEX "implant_catalog_staging_citation_staging_field_unique" ON "implant_catalog_staging_citation"("staging_id", "field_name");

-- Foreign key to staging table
ALTER TABLE "implant_catalog_staging_citation" ADD CONSTRAINT "implant_catalog_staging_citation_staging_id_fkey" FOREIGN KEY ("staging_id") REFERENCES "implant_catalog_staging"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index for looking up citations by staging_id
CREATE INDEX "implant_catalog_staging_citation_staging_id_idx" ON "implant_catalog_staging_citation"("staging_id");
