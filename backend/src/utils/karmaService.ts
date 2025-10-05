import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface KarmaUpdate {
  userId: string;
  postKarma?: number;
  commentKarma?: number;
  awardKarma?: number;
}

export interface UserKarmaStats {
  postKarma: number;
  commentKarma: number;
  awardKarma: number;
  totalKarma: number;
}

/**
 * Get or create karma record for a user
 */
export async function getUserKarma(userId: string) {
  let karma = await prisma.userKarma.findUnique({
    where: { userId }
  });

  if (!karma) {
    karma = await prisma.userKarma.create({
      data: {
        userId,
        postKarma: 0,
        commentKarma: 0,
        awardKarma: 0,
        totalKarma: 0
      }
    });
  }

  return karma;
}

/**
 * Update user karma based on vote action
 */
export async function updateUserKarma(
  userId: string, 
  karmaType: 'post' | 'comment' | 'award', 
  karmaChange: number
) {
  const karma = await getUserKarma(userId);
  
  const updateData: any = {};
  
  switch (karmaType) {
    case 'post':
      updateData.postKarma = karma.postKarma + karmaChange;
      break;
    case 'comment':
      updateData.commentKarma = karma.commentKarma + karmaChange;
      break;
    case 'award':
      updateData.awardKarma = karma.awardKarma + karmaChange;
      break;
  }
  
  // Calculate new total karma
  updateData.totalKarma = 
    (updateData.postKarma || karma.postKarma) + 
    (updateData.commentKarma || karma.commentKarma) + 
    (updateData.awardKarma || karma.awardKarma);
  
  // Cap negative karma at -99 to avoid discouragement
  if (updateData.totalKarma < -99) {
    updateData.totalKarma = -99;
    if (karmaType === 'post') {
      updateData.postKarma = updateData.totalKarma - karma.commentKarma - karma.awardKarma;
    } else if (karmaType === 'comment') {
      updateData.commentKarma = updateData.totalKarma - karma.postKarma - karma.awardKarma;
    } else if (karmaType === 'award') {
      updateData.awardKarma = updateData.totalKarma - karma.postKarma - karma.commentKarma;
    }
  }
  
  return await prisma.userKarma.update({
    where: { userId },
    data: updateData
  });
}

/**
 * Calculate karma change for a vote action
 */
export function calculateKarmaChange(
  oldVote: string | null, 
  newVote: string
): number {
  // If no previous vote
  if (!oldVote) {
    return newVote === 'upvote' ? 1 : -1;
  }
  
  // If changing vote
  if (oldVote !== newVote) {
    if (oldVote === 'upvote' && newVote === 'downvote') {
      return -2; // Lost +1, gained -1
    } else if (oldVote === 'downvote' && newVote === 'upvote') {
      return 2; // Lost -1, gained +1
    }
  }
  
  // If removing vote
  if (newVote === 'remove') {
    return oldVote === 'upvote' ? -1 : 1;
  }
  
  return 0; // No change
}

/**
 * Get karma statistics for a user
 */
export async function getUserKarmaStats(userId: string): Promise<UserKarmaStats> {
  const karma = await getUserKarma(userId);
  
  return {
    postKarma: karma.postKarma,
    commentKarma: karma.commentKarma,
    awardKarma: karma.awardKarma,
    totalKarma: karma.totalKarma
  };
}

/**
 * Get top users by karma
 */
export async function getTopUsersByKarma(limit: number = 10) {
  return await prisma.userKarma.findMany({
    orderBy: { totalKarma: 'desc' },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          specialty: true,
          profileImage: true
        }
      }
    }
  });
}

/**
 * Recalculate karma for a user based on all their votes
 */
export async function recalculateUserKarma(userId: string) {
  // Get all post votes for this user's posts
  const userPosts = await prisma.post.findMany({
    where: { authorId: userId },
    include: { votes: true }
  });
  
  let postKarma = 0;
  for (const post of userPosts) {
    for (const vote of post.votes) {
      postKarma += vote.type === 'upvote' ? 1 : -1;
    }
  }
  
  // Get all comment votes for this user's comments
  const userComments = await prisma.comment.findMany({
    where: { authorId: userId },
    include: { votes: true }
  });
  
  let commentKarma = 0;
  for (const comment of userComments) {
    for (const vote of comment.votes) {
      commentKarma += vote.type === 'upvote' ? 1 : -1;
    }
  }
  
  const totalKarma = postKarma + commentKarma;
  
  // Update or create karma record
  await prisma.userKarma.upsert({
    where: { userId },
    update: {
      postKarma,
      commentKarma,
      totalKarma
    },
    create: {
      userId,
      postKarma,
      commentKarma,
      awardKarma: 0,
      totalKarma
    }
  });
  
  return { postKarma, commentKarma, totalKarma };
}
