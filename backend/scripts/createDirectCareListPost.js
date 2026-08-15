/* One-off: create The Direct Care List post for drewalbertmd */
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

const TITLE = 'I built The Direct Care List — a crowd-ranked directory of direct care practices';

const CONTENT = `New project: https://thedirectcarelist.com

It's a crowd-ranked directory of direct primary care (DPC), direct specialty care (DSC), and cash-pay clinics — practices with transparent prices and no middlemen, where the clinician works for the patient relationship.

Why I built it:
• Patients and employers struggle to find direct/cash-pay options in one place
• Prices are transparent and practices are ranked by community votes, not fake star ratings
• Natural-language search works, e.g. "spine surgeon near Atlanta, GA" or "DPC family medicine Texas"
• Per-state guides for all 50 states + DC, and claimable practice profiles

For the surgeons here running or considering a direct specialty / cash-pay model: you can add your practice (specialty, city/state, membership or cash pricing, and why it's direct) at https://thedirectcarelist.com/#add

Feedback welcome — especially on what would make a listing genuinely useful to patients.`;

const IMAGES = [
  { path: '/tmp/dcl-og.png', name: 'the-direct-care-list.png', mime: 'image/png' },
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
        details: { title: post.title, type: 'discussion', source: 'createDirectCareListPost.js' },
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
