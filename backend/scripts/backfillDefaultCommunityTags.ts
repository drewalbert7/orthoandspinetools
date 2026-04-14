#!/usr/bin/env tsx
/**
 * Ensures every community has rows from DEFAULT_COMMUNITY_TOPIC_TAGS (e.g. new “Case” tag).
 * Safe to run multiple times (createMany skipDuplicates).
 *
 * Usage (from backend/): npx tsx scripts/backfillDefaultCommunityTags.ts
 */

import { PrismaClient } from '@prisma/client';
import { ensureDefaultCommunityTags } from '../src/lib/defaultCommunityTags';

const prisma = new PrismaClient();

async function main() {
  const communities = await prisma.community.findMany({ select: { id: true, name: true } });
  for (const c of communities) {
    await ensureDefaultCommunityTags(prisma, c.id);
  }
  console.log(`Ensured default topic tags for ${communities.length} communities.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
