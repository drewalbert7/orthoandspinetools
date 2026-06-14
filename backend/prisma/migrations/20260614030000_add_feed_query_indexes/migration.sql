-- Feed and profile query indexes (home, community, user, tag filters, sitemap)

CREATE INDEX "posts_isDeleted_createdAt_idx" ON "posts"("isDeleted", "createdAt" DESC);
CREATE INDEX "posts_communityId_isDeleted_createdAt_idx" ON "posts"("communityId", "isDeleted", "createdAt" DESC);
CREATE INDEX "posts_authorId_isDeleted_createdAt_idx" ON "posts"("authorId", "isDeleted", "createdAt" DESC);
CREATE INDEX "posts_isDeleted_type_createdAt_idx" ON "posts"("isDeleted", "type", "createdAt" DESC);
CREATE INDEX "posts_isDeleted_updatedAt_idx" ON "posts"("isDeleted", "updatedAt" DESC);

CREATE INDEX "comments_postId_isDeleted_createdAt_idx" ON "comments"("postId", "isDeleted", "createdAt" ASC);
CREATE INDEX "comments_authorId_isDeleted_createdAt_idx" ON "comments"("authorId", "isDeleted", "createdAt" DESC);

CREATE INDEX "post_votes_postId_idx" ON "post_votes"("postId");
CREATE INDEX "post_tags_tagId_idx" ON "post_tags"("tagId");
