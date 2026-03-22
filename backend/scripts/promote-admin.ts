#!/usr/bin/env tsx
/**
 * Promote a user to admin (highest access).
 * Usage: npx tsx scripts/promote-admin.ts <username|email>
 * Or: PROMOTE_USER=dstrad npx tsx scripts/promote-admin.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const identifier = process.argv[2] || process.env.PROMOTE_USER;
  if (!identifier) {
    console.error('Usage: npx tsx scripts/promote-admin.ts <username|email>');
    console.error('   Or: PROMOTE_USER=dstrad npx tsx scripts/promote-admin.ts');
    process.exit(1);
  }

  const isEmail = identifier.includes('@');
  const user = await prisma.user.findFirst({
    where: isEmail ? { email: identifier } : { username: identifier },
  });

  if (!user) {
    console.error(`User not found: ${identifier}`);
    process.exit(1);
  }

  if (user.isAdmin) {
    console.log(`User ${user.username} (${user.email}) is already an admin.`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isAdmin: true,
      isActive: true,
    },
  });

  console.log(`✓ Promoted ${user.username} (${user.email}) to admin.`);
  console.log(`  User ID: ${user.id}`);
  console.log(`  isAdmin: true, isActive: true`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
