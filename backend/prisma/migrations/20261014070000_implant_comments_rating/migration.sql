-- Implant threaded comments + votes
CREATE TABLE IF NOT EXISTS "implant_comments" (
    "id" TEXT NOT NULL,
    "implant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "body" TEXT NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "implant_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "implant_comment_votes" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "implant_comment_votes_pkey" PRIMARY KEY ("id")
);

-- Proprietary rating components
ALTER TABLE "implants" ADD COLUMN IF NOT EXISTS "catalog_score" DOUBLE PRECISION;
ALTER TABLE "implants" ADD COLUMN IF NOT EXISTS "community_score" DOUBLE PRECISION;
ALTER TABLE "implants" ADD COLUMN IF NOT EXISTS "rating_sample_n" DOUBLE PRECISION;
ALTER TABLE "implants" ADD COLUMN IF NOT EXISTS "rating_version" TEXT;
ALTER TABLE "implants" ADD COLUMN IF NOT EXISTS "ai_rating_locked" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "implant_comments_implant_id_created_at_idx"
  ON "implant_comments"("implant_id", "created_at");
CREATE INDEX IF NOT EXISTS "implant_comments_parent_id_idx"
  ON "implant_comments"("parent_id");
CREATE INDEX IF NOT EXISTS "implant_comments_user_id_created_at_idx"
  ON "implant_comments"("user_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "implant_comment_votes_comment_id_user_id_key"
  ON "implant_comment_votes"("comment_id", "user_id");
CREATE INDEX IF NOT EXISTS "implant_comment_votes_user_id_idx"
  ON "implant_comment_votes"("user_id");

DO $$ BEGIN
  ALTER TABLE "implant_comments"
    ADD CONSTRAINT "implant_comments_implant_id_fkey"
    FOREIGN KEY ("implant_id") REFERENCES "implants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "implant_comments"
    ADD CONSTRAINT "implant_comments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "implant_comments"
    ADD CONSTRAINT "implant_comments_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "implant_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "implant_comment_votes"
    ADD CONSTRAINT "implant_comment_votes_comment_id_fkey"
    FOREIGN KEY ("comment_id") REFERENCES "implant_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "implant_comment_votes"
    ADD CONSTRAINT "implant_comment_votes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed comments from legacy reviews (one-time content migrate; reviews table kept)
INSERT INTO "implant_comments" ("id", "implant_id", "user_id", "parent_id", "body", "is_deleted", "created_at", "updated_at")
SELECT
  'migrated_' || r."id",
  r."implant_id",
  r."user_id",
  NULL,
  CASE
    WHEN r."title" IS NOT NULL AND length(trim(r."title")) > 0
      THEN '**' || trim(r."title") || '** (' || r."rating"::text || '/5)\n\n' || r."body"
    ELSE '(' || r."rating"::text || '/5) ' || r."body"
  END,
  false,
  r."created_at",
  r."updated_at"
FROM "implant_reviews" r
WHERE NOT EXISTS (
  SELECT 1 FROM "implant_comments" c WHERE c."id" = 'migrated_' || r."id"
);
