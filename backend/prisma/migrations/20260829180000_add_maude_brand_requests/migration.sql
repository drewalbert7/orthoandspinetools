-- CreateTable
CREATE TABLE "maude_brand_requests" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "company" TEXT,
    "specialty" TEXT,
    "note" TEXT,
    "contact_email" TEXT,
    "user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ip_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maude_brand_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maude_brand_requests_status_created_at_idx" ON "maude_brand_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "maude_brand_requests_brand_idx" ON "maude_brand_requests"("brand");

-- AddForeignKey
ALTER TABLE "maude_brand_requests" ADD CONSTRAINT "maude_brand_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
