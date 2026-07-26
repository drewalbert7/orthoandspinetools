/* One-off: create Ortho & Spine Jobs platform post for drewalbertmd */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const {
  uploadToCloudinary,
  getOptimizedImageUrl,
  getThumbnailUrl,
} = require('../dist/services/cloudinaryService');

const AUTHOR_ID = 'cmgegneva000012rq3iebof1y';
const COMMUNITY_ID = 'cmnfelfr7000113suuq7t82ay';
const TAG_IDS = ['85839822-b2ee-49a6-a6ce-9d42fba56341'];

const TITLE = 'I built Ortho & Spine Jobs — a surgeon-run job board and compensation map';

const CONTENT = `I built https://orthoandspinejobs.com because our job search deserves better than a generic listings site.

What's live now:
• 160 open orthopedic and spine positions, filterable by subspecialty, state, and compensation
• Sports, Spine, Joints, Foot & Ankle, Hand, Peds, and Trauma, plus a research fellowship database
• Free for surgeons and trainees — research positions are always free to post
• ~700 surgeons and trainees reached each month

The piece I'd most like help with is the compensation map.

Most of us negotiate with almost no idea what the market actually pays in our state and subspecialty. The map reports P25, median, and P75 instead of hiding the spread behind one average, suppresses any cell with too few responses, and reviews submissions before release. It's anonymous, and everyone who completes it gets the results sent back.

It only becomes useful if enough of us contribute — right now it's built on a small sample.

Take the anonymous survey: https://orthoandspinejobs.com/compensation/survey/
Explore the map: https://orthoandspinejobs.com/compensation/

Feedback welcome, especially on which benchmarks would actually change how you negotiate.`;

const IMAGES = [
  { path: '/tmp/osj-hero-mobile.jpg', name: 'ortho-and-spine-jobs-hero.jpg', mime: 'image/jpeg' },
  { path: '/tmp/osj-compensation-map.png', name: 'ortho-and-spine-compensation-map.png', mime: 'image/png' },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.post.findFirst({
      where: { authorId: AUTHOR_ID, title: TITLE, isDeleted: false },
      select: { id: true },
    });
    if (existing) {
      console.log(`Post already exists: ${existing.id}`);
      return;
    }

    const attachments = [];
    for (const img of IMAGES) {
      console.log(`Uploading ${img.name}...`);
      const buffer = fs.readFileSync(img.path);
      const uploaded = await uploadToCloudinary(buffer, img.name, 'orthoandspinetools/posts');
      attachments.push({
        filename: uploaded.public_id,
        originalName: img.name,
        mimeType: img.mime,
        size: uploaded.bytes,
        path: uploaded.secure_url,
        cloudinaryPublicId: uploaded.public_id,
        cloudinaryUrl: uploaded.secure_url,
        optimizedUrl: getOptimizedImageUrl(uploaded.public_id, { width: 1920, height: 1080 }),
        thumbnailUrl: getThumbnailUrl(uploaded.public_id, 300),
        width: uploaded.width,
        height: uploaded.height,
      });
    }

    const post = await prisma.post.create({
      data: {
        title: TITLE,
        content: CONTENT,
        type: 'discussion',
        authorId: AUTHOR_ID,
        communityId: COMMUNITY_ID,
        attachments: { create: attachments },
        tags: { create: TAG_IDS.map((tagId) => ({ tagId })) },
      },
      select: { id: true, title: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: AUTHOR_ID,
        action: 'CREATE_POST',
        resource: 'post',
        resourceId: post.id,
        details: { title: post.title, type: 'discussion', source: 'createOrthoJobsPost.js' },
      },
    });

    console.log(`Created post: ${post.id}`);
    console.log(`URL: https://orthoandspinetools.com/post/${post.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
