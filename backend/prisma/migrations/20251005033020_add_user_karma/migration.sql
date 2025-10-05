-- CreateTable
CREATE TABLE "user_karma" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postKarma" INTEGER NOT NULL DEFAULT 0,
    "commentKarma" INTEGER NOT NULL DEFAULT 0,
    "awardKarma" INTEGER NOT NULL DEFAULT 0,
    "totalKarma" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_karma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_karma_userId_key" ON "user_karma"("userId");

-- AddForeignKey
ALTER TABLE "user_karma" ADD CONSTRAINT "user_karma_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
