import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  // Create a default admin user if it doesn't exist
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@orthoandspinetools.com' },
    update: {},
    create: {
      email: 'admin@orthoandspinetools.com',
      username: 'admin',
      firstName: 'Admin',
      lastName: 'User',
      passwordHash: await bcrypt.hash('admin123', 10),
      isEmailVerified: true,
      specialty: 'Orthopedic Surgery',
      institution: 'OrthoAndSpineTools',
      yearsExperience: 10,
      bio: 'Administrator of OrthoAndSpineTools platform'
    }
  });

  console.log('Admin user created:', adminUser.username);

  // Create communities
  const communities = [
    {
      name: 'Spine',
      slug: 'spine',
      description: 'Community for spine surgery professionals discussing spinal disorders, procedures, and treatments.',
      specialty: 'Spine Surgery',
      ownerId: adminUser.id
    },
    {
      name: 'Sports',
      slug: 'sports',
      description: 'Sports medicine community for orthopedic professionals treating athletic injuries and performance optimization.',
      specialty: 'Sports Medicine',
      ownerId: adminUser.id
    },
    {
      name: 'Ortho Trauma',
      slug: 'ortho-trauma',
      description: 'Emergency orthopedic trauma surgery community for acute injury management and fracture care.',
      specialty: 'Orthopedic Trauma',
      ownerId: adminUser.id
    },
    {
      name: 'Ortho Peds',
      slug: 'ortho-peds',
      description: 'Pediatric orthopedic surgery community for treating musculoskeletal conditions in children.',
      specialty: 'Pediatric Orthopedics',
      ownerId: adminUser.id
    },
    {
      name: 'Ortho Onc',
      slug: 'ortho-onc',
      description: 'Orthopedic oncology community for bone and soft tissue tumor treatment and limb salvage procedures.',
      specialty: 'Orthopedic Oncology',
      ownerId: adminUser.id
    },
    {
      name: 'Foot & Ankle',
      slug: 'foot-ankle',
      description: 'Foot and ankle surgery community for complex reconstructive procedures and sports injuries.',
      specialty: 'Foot & Ankle Surgery',
      ownerId: adminUser.id
    },
    {
      name: 'Shoulder Elbow',
      slug: 'shoulder-elbow',
      description: 'Shoulder and elbow surgery community for arthroscopic and reconstructive procedures.',
      specialty: 'Shoulder & Elbow Surgery',
      ownerId: adminUser.id
    },
    {
      name: 'Hip & Knee Arthroplasty',
      slug: 'hip-knee-arthroplasty',
      description: 'Joint replacement surgery community for hip and knee arthroplasty procedures and implant discussions.',
      specialty: 'Joint Replacement',
      ownerId: adminUser.id
    },
    {
      name: 'Hand',
      slug: 'hand',
      description: 'Hand surgery community for microsurgery, trauma, and reconstructive procedures of the hand and wrist.',
      specialty: 'Hand Surgery',
      ownerId: adminUser.id
    }
  ];

  for (const communityData of communities) {
    const community = await prisma.community.upsert({
      where: { slug: communityData.slug },
      update: {},
      create: communityData
    });
    console.log(`Community created: ${community.name}`);
  }

  console.log('Database seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
