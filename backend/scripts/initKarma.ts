import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function initializeKarma() {
  console.log('Initializing karma for existing users...');
  
  // Get all users
  const users = await prisma.user.findMany({
    select: { id: true, username: true }
  });
  
  console.log(`Found ${users.length} users`);
  
  for (const user of users) {
    console.log(`Processing user: ${user.username}`);
    
    // Get all post votes for this user's posts
    const userPosts = await prisma.post.findMany({
      where: { authorId: user.id },
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
      where: { authorId: user.id },
      include: { votes: true }
    });
    
    let commentKarma = 0;
    for (const comment of userComments) {
      for (const vote of comment.votes) {
        commentKarma += vote.type === 'upvote' ? 1 : -1;
      }
    }
    
    const totalKarma = postKarma + commentKarma;
    
    if (totalKarma !== 0) {
      console.log(`  Post karma: ${postKarma}, Comment karma: ${commentKarma}, Total: ${totalKarma}`);
      
      // Create or update karma record
      await prisma.userKarma.upsert({
        where: { userId: user.id },
        update: {
          postKarma,
          commentKarma,
          totalKarma
        },
        create: {
          userId: user.id,
          postKarma,
          commentKarma,
          awardKarma: 0,
          totalKarma
        }
      });
    }
  }
  
  console.log('Karma initialization complete!');
  
  // Show leaderboard
  const topUsers = await prisma.userKarma.findMany({
    orderBy: { totalKarma: 'desc' },
    take: 10,
    include: {
      user: {
        select: {
          username: true,
          firstName: true,
          lastName: true
        }
      }
    }
  });
  
  console.log('\nTop users by karma:');
  topUsers.forEach((user, index) => {
    console.log(`${index + 1}. ${user.user.username} (${user.user.firstName} ${user.user.lastName}): ${user.totalKarma} total karma`);
  });
}

initializeKarma()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
