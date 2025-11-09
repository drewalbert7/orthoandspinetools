import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPosts() {
  try {
    console.log('📊 Checking posts in database...\n');

    // Get total post count
    const totalPosts = await prisma.post.count();
    console.log(`Total posts in database: ${totalPosts}`);

    // Get non-deleted posts
    const activePosts = await prisma.post.count({
      where: { isDeleted: false }
    });
    console.log(`Active posts (not deleted): ${activePosts}`);

    // Get deleted posts
    const deletedPosts = await prisma.post.count({
      where: { isDeleted: true }
    });
    console.log(`Deleted posts: ${deletedPosts}\n`);

    // Get recent posts (last 10)
    console.log('📝 Recent posts (last 10):');
    const recentPosts = await prisma.post.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        createdAt: true,
        isDeleted: true,
        isLocked: true,
        isPinned: true,
        author: {
          select: {
            username: true,
          }
        },
        community: {
          select: {
            name: true,
            slug: true,
          }
        },
        _count: {
          select: {
            comments: true,
            votes: true,
          }
        }
      }
    });

    recentPosts.forEach((post, index) => {
      console.log(`\n${index + 1}. ${post.title}`);
      console.log(`   ID: ${post.id}`);
      console.log(`   Author: ${post.author.username}`);
      console.log(`   Community: ${post.community.name} (${post.community.slug})`);
      console.log(`   Created: ${post.createdAt}`);
      console.log(`   Comments: ${post._count.comments}, Votes: ${post._count.votes}`);
      console.log(`   Status: ${post.isDeleted ? 'DELETED' : 'ACTIVE'} | ${post.isLocked ? 'LOCKED' : 'UNLOCKED'} | ${post.isPinned ? 'PINNED' : 'NOT PINNED'}`);
    });

    // Get posts by community
    console.log('\n\n📊 Posts by community:');
    const postsByCommunity = await prisma.post.groupBy({
      by: ['communityId'],
      where: { isDeleted: false },
      _count: true,
    });

    for (const group of postsByCommunity) {
      const community = await prisma.community.findUnique({
        where: { id: group.communityId },
        select: { name: true, slug: true }
      });
      console.log(`   ${community?.name || 'Unknown'}: ${group._count} posts`);
    }

    // Check for any issues
    console.log('\n\n🔍 Checking for potential issues:');
    
    // Posts without community
    const postsWithoutCommunity = await prisma.post.count({
      where: {
        isDeleted: false,
        community: null
      }
    });
    if (postsWithoutCommunity > 0) {
      console.log(`   ⚠️  ${postsWithoutCommunity} posts without valid community`);
    }

    // Posts without author
    const postsWithoutAuthor = await prisma.post.count({
      where: {
        isDeleted: false,
        author: null
      }
    });
    if (postsWithoutAuthor > 0) {
      console.log(`   ⚠️  ${postsWithoutAuthor} posts without valid author`);
    }

    // All posts (including deleted) for reference
    console.log('\n\n📋 All posts (including deleted) - last 5:');
    const allPosts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        createdAt: true,
        isDeleted: true,
        author: {
          select: {
            username: true,
          }
        },
        community: {
          select: {
            name: true,
          }
        }
      }
    });

    allPosts.forEach((post, index) => {
      console.log(`${index + 1}. [${post.isDeleted ? 'DELETED' : 'ACTIVE'}] ${post.title} by ${post.author?.username || 'Unknown'} in ${post.community?.name || 'Unknown'}`);
    });

  } catch (error) {
    console.error('❌ Error checking posts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPosts();

