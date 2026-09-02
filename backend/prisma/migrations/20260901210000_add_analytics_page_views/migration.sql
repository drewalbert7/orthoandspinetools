-- CreateTable
CREATE TABLE "analytics_page_views" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "visitor_hash" TEXT NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_page_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_page_views_created_at_idx" ON "analytics_page_views"("created_at");

-- CreateIndex
CREATE INDEX "analytics_page_views_path_created_at_idx" ON "analytics_page_views"("path", "created_at");

-- CreateIndex
CREATE INDEX "analytics_page_views_visitor_hash_created_at_idx" ON "analytics_page_views"("visitor_hash", "created_at");

-- AddForeignKey
ALTER TABLE "analytics_page_views" ADD CONSTRAINT "analytics_page_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
