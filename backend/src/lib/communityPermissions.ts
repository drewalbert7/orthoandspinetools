import { prisma } from './prisma';

export async function userCanCreateCommunity(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (user?.isAdmin) {
    return true;
  }

  const [modCount, ownedCount] = await Promise.all([
    prisma.communityModerator.count({ where: { userId } }),
    prisma.community.count({ where: { ownerId: userId } }),
  ]);

  return modCount > 0 || ownedCount > 0;
}
