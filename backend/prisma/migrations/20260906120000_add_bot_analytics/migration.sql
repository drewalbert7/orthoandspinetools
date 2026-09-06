-- CreateTable
CREATE TABLE "analytics_bots" (
    "family" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_bots_pkey" PRIMARY KEY ("family")
);

-- CreateTable
CREATE TABLE "analytics_bot_paths" (
    "path" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_bot_paths_pkey" PRIMARY KEY ("path")
);

-- CreateTable
CREATE TABLE "analytics_bot_daily" (
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "ai_agent" INTEGER NOT NULL DEFAULT 0,
    "ai_crawl" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analytics_bot_daily_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "analytics_bot_daily_family" (
    "day" DATE NOT NULL,
    "family" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analytics_bot_daily_family_pkey" PRIMARY KEY ("day","family")
);

-- CreateTable
CREATE TABLE "analytics_bot_recent" (
    "id" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_bot_recent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_bot_state" (
    "key" TEXT NOT NULL,
    "inode" TEXT,
    "offset" BIGINT NOT NULL DEFAULT 0,
    "backfilled_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_bot_state_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "analytics_bots_category_idx" ON "analytics_bots"("category");

-- CreateIndex
CREATE INDEX "analytics_bot_recent_created_at_idx" ON "analytics_bot_recent"("created_at");
