#!/usr/bin/env tsx
/**
 * Adds the default "Case" topic tag to existing case_study posts that lack it.
 * Safe to run multiple times (skips posts already tagged).
 *
 * Usage (from backend/): npm run backfill-case-post-tags
 */

import { PrismaClient } from '@prisma/client';
import { DEFAULT_CASE_TOPIC_NAME, ensureDefaultCommunityTags } from '../src/lib/defaultCommunityTags';

const prisma = new PrismaClient();

async function main() {
  const communities = await prisma.community.findMany({ select: { id: true, name: true } });
  for (const c of communities) {
    await ensureDefaultCommunityTags(prisma, c.id);
  }

  const posts = await prisma.post.findMany({
    where: { isDeleted: false, type: 'case_study' },
    select: {
      id: true,
      title: true,
      communityId: true,
      tags: { select: { tagId: true, tag: { select: { name: true } } } },
    },
  });

  let added = 0;
  let skipped = 0;

  for (const post of posts) {
    const alreadyHasCase = post.tags.some(
      (t) => t.tag.name.toLowerCase() === DEFAULT_CASE_TOPIC_NAME.toLowerCase()
    );
    if (alreadyHasCase) {
      skipped += 1;
      continue;
    }

    const caseTag = await prisma.communityTag.findFirst({
      where: {
        communityId: post.communityId,
        name: { equals: DEFAULT_CASE_TOPIC_NAME, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (!caseTag) {
      console.warn(`No Case tag for community ${post.communityId}; post ${post.id} skipped`);
      continue;
    }

    await prisma.postTag.create({
      data: { postId: post.id, tagId: caseTag.id },
    });
    console.log(`Tagged: ${post.title}`);
    added += 1;
  }

  console.log(
    `Done. ${added} post(s) tagged with "${DEFAULT_CASE_TOPIC_NAME}", ${skipped} already had it, ${posts.length} case_study post(s) checked.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
