-- Pre-catalog-growth indexes for Implant Directory browse / related / verified filter

-- Default directory sort: status + specialty + Directory Score
CREATE INDEX IF NOT EXISTS "implants_status_specialty_ai_rating_idx"
  ON "implants" ("status", "specialty", "ai_rating" DESC NULLS LAST);

-- Related strip / company matches
CREATE INDEX IF NOT EXISTS "implants_status_company_idx"
  ON "implants" ("status", "company");

-- Fast verified-count filter chip
CREATE INDEX IF NOT EXISTS "implants_verified_partial_idx"
  ON "implants" ("id")
  WHERE "status" = 'verified';
