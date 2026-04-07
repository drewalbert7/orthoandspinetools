import type { PrismaClient } from '@prisma/client';

export const DEFAULT_COMMUNITY_TOPIC_TAGS: ReadonlyArray<{
  name: string;
  color: string | null;
  description: string | null;
}> = [
  {
    name: 'Startup',
    color: '#2563eb',
    description: 'Startups, companies, and entrepreneurial topics',
  },
  {
    name: 'Medical Device',
    color: '#0891b2',
    description: 'Implants, instruments, and regulated devices',
  },
  {
    name: 'Technique',
    color: '#7c3aed',
    description: 'Surgical techniques, approaches, and how-to discussion',
  },
  {
    name: 'Research',
    color: '#059669',
    description: 'Studies, evidence, and academic or clinical research',
  },
  {
    name: 'Biologic',
    color: '#db2777',
    description: 'Biologics, growth factors, and related therapies',
  },
  {
    name: 'Tech',
    color: '#4f46e5',
    description: 'Software, AI, digital health, and engineering',
  },
  {
    name: 'Tool',
    color: '#ca8a04',
    description: 'Instruments, equipment, and practical tools',
  },
];

export async function ensureDefaultCommunityTags(
  prisma: Pick<PrismaClient, 'communityTag'>,
  communityId: string
): Promise<void> {
  await prisma.communityTag.createMany({
    data: DEFAULT_COMMUNITY_TOPIC_TAGS.map((t) => ({
      communityId,
      name: t.name,
      color: t.color,
      description: t.description,
    })),
    skipDuplicates: true,
  });
}
