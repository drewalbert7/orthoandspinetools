-- Create suppression list for SES bounce/complaint protection
CREATE TABLE IF NOT EXISTS "email_suppressions" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'ses_sns',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastEventAt" TIMESTAMP(3),
  CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_suppressions_email_key"
  ON "email_suppressions"("email");

CREATE INDEX IF NOT EXISTS "email_suppressions_reason_idx"
  ON "email_suppressions"("reason");
