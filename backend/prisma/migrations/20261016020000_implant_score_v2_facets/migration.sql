-- Directory Score ost-dir-v2 facet persistence (utility + MAUDE hazard breakdown)

ALTER TABLE "implants" ADD COLUMN IF NOT EXISTS "utility_score" DOUBLE PRECISION;
ALTER TABLE "implants" ADD COLUMN IF NOT EXISTS "maude_score" DOUBLE PRECISION;
ALTER TABLE "implants" ADD COLUMN IF NOT EXISTS "maude_hazard" DOUBLE PRECISION;
ALTER TABLE "implants" ADD COLUMN IF NOT EXISTS "maude_signal" TEXT;
ALTER TABLE "implants" ADD COLUMN IF NOT EXISTS "score_breakdown" JSONB;
