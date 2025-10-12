-- AddCloudinaryFields
ALTER TABLE "post_attachments" ADD COLUMN "cloudinaryPublicId" TEXT;
ALTER TABLE "post_attachments" ADD COLUMN "cloudinaryUrl" TEXT;
ALTER TABLE "post_attachments" ADD COLUMN "optimizedUrl" TEXT;
ALTER TABLE "post_attachments" ADD COLUMN "thumbnailUrl" TEXT;
ALTER TABLE "post_attachments" ADD COLUMN "width" INTEGER;
ALTER TABLE "post_attachments" ADD COLUMN "height" INTEGER;
ALTER TABLE "post_attachments" ADD COLUMN "duration" INTEGER;
