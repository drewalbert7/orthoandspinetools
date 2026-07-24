/* One-off: create Augmedics X2 post for drewalbertmd */
const https = require('https');
const { PrismaClient } = require('@prisma/client');
const {
  uploadToCloudinary,
  getOptimizedImageUrl,
  getThumbnailUrl,
} = require('../dist/services/cloudinaryService');

const IMAGE_URL =
  'https://augmedics.com/wp-content/uploads/2025/11/Augmedics-X2-Headset-scaled-e1762900411738.png';
const AUTHOR_ID = 'cmgegneva000012rq3iebof1y';
const COMMUNITY_ID = 'cmgegnatr0002ltv9bglj4igi';
const TAG_IDS = [
  'dd73a7ae-e8b8-4a94-ae8b-c263fe63005e',
  '7517cc9e-7fc9-4c1a-a8e7-1469a0aec1b5',
];

const TITLE = 'Augmedics X2 — FDA-cleared next-gen AR headset for spine navigation';

const CONTENT = `Augmedics just received FDA 510(k) clearance for X2, the next-generation headset for the xvision Spine System. This is a meaningful hardware upgrade for a platform that already has real adoption — more than 12,000 patients and 65,000+ pedicle screws placed with first-gen xvision across 25 U.S. states.

What stands out on paper:
• Purpose-built OR form factor (not a consumer AR headset repurposed for surgery)
• Detachable surgical-grade headlight + lens tilt for standing and seated cases
• ~100% larger field of view vs the prior headset, with higher resolution and brightness
• More efficient processor for steadier AR overlay performance

For spine surgeons evaluating navigation options, the practical question is whether the ergonomics and optical upgrades translate to smoother workflow in long deformity or MIS cases — especially when you're toggling between direct visualization and AR-guided screw trajectories.

Worth watching as hospitals refresh capital equipment and as VB Spine's planned acquisition of Augmedics' spine platform moves forward.

Press release: https://augmedics.com/news/augmedics-announces-x2/`;

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

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

    console.log('Downloading Augmedics X2 image...');
    const buffer = await download(IMAGE_URL);

    console.log('Uploading to Cloudinary...');
    const uploaded = await uploadToCloudinary(buffer, 'augmedics-x2-headset.png', 'orthoandspinetools/posts');
    const publicId = uploaded.public_id;
    const cloudinaryUrl = uploaded.secure_url;
    const optimizedUrl = getOptimizedImageUrl(publicId, { width: 1920, height: 1080 });
    const thumbnailUrl = getThumbnailUrl(publicId, 300);

    const post = await prisma.post.create({
      data: {
        title: TITLE,
        content: CONTENT,
        type: 'case_study',
        authorId: AUTHOR_ID,
        communityId: COMMUNITY_ID,
        attachments: {
          create: {
            filename: publicId,
            originalName: 'Augmedics-X2-Headset.png',
            mimeType: 'image/png',
            size: uploaded.bytes,
            path: cloudinaryUrl,
            cloudinaryPublicId: publicId,
            cloudinaryUrl,
            optimizedUrl,
            thumbnailUrl,
            width: uploaded.width,
            height: uploaded.height,
          },
        },
        tags: {
          create: TAG_IDS.map((tagId) => ({ tagId })),
        },
      },
      select: { id: true, title: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: AUTHOR_ID,
        action: 'CREATE_POST',
        resource: 'post',
        resourceId: post.id,
        details: { title: post.title, type: 'case_study', source: 'createAugmedicsPost.js' },
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
