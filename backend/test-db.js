// Quick test script for database connection
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function test() {
  try {
    console.log('Testing database connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    const count = await prisma.post.count();
    console.log('✅ Success! Post count:', count);
    const posts = await prisma.post.findMany({ take: 3 });
    console.log('Sample posts:', posts.map(p => ({ id: p.id, title: p.title })));
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();

