-- Optional GeoIP country (ISO 3166-1 alpha-2) for human pageviews. Nullable for historical rows.
ALTER TABLE "analytics_page_views" ADD COLUMN IF NOT EXISTS "country" TEXT;

CREATE INDEX IF NOT EXISTS "analytics_page_views_country_created_at_idx"
  ON "analytics_page_views" ("country", "created_at");
