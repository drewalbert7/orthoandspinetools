-- AlterTable
ALTER TABLE "posts" ADD COLUMN "link_url" TEXT,
ADD COLUMN "poll_options" JSONB,
ADD COLUMN "poll_ends_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "post_poll_votes" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "option_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_poll_votes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_poll_votes_post_id_user_id_key" ON "post_poll_votes"("post_id", "user_id");

ALTER TABLE "post_poll_votes" ADD CONSTRAINT "post_poll_votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_poll_votes" ADD CONSTRAINT "post_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
