-- Physician verification: NPI (US) and manual international review

ALTER TABLE "users" ADD COLUMN "npi_number" TEXT;
ALTER TABLE "users" ADD COLUMN "practice_country" TEXT;
ALTER TABLE "users" ADD COLUMN "physician_verification_pending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "physician_verification_method" TEXT;

CREATE UNIQUE INDEX "users_npi_number_key" ON "users"("npi_number");
