import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type ImplantListRow = {
  id: string;
  slug: string;
  brandName: string;
  systemName: string | null;
  company: string | null;
  specialty: string;
  anatomy: string | null;
  deviceClass: string;
  description: string | null;
  status: string;
  maudeBrandKey: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

export function buildImplantSearchText(input: {
  brandName: string;
  systemName?: string | null;
  company?: string | null;
  specialty?: string | null;
  anatomy?: string | null;
  deviceClass?: string | null;
  description?: string | null;
  longDescription?: string | null;
  maudeBrandKey?: string | null;
  aliases?: string[];
}): string {
  return [
    input.brandName,
    input.systemName,
    input.company,
    input.specialty,
    input.anatomy,
    input.deviceClass?.replace(/_/g, ' '),
    input.description,
    input.longDescription,
    input.maudeBrandKey,
    ...(input.aliases || []),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyImplant(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Public statuses for anonymous catalog / SEO. */
export const PUBLIC_IMPLANT_STATUSES = ['published', 'verified'] as const;

export async function searchImplantIds(params: {
  q?: string;
  specialty?: string;
  deviceClass?: string;
  statusIn: string[];
  limit: number;
  offset: number;
}): Promise<{ ids: string[]; total: number }> {
  const q = (params.q || '').trim();
  const specialty = (params.specialty || '').trim();
  const deviceClass = (params.deviceClass || '').trim();
  const statuses = params.statusIn;

  if (!q) {
    const where = {
      status: { in: statuses },
      ...(specialty ? { specialty } : {}),
      ...(deviceClass ? { deviceClass } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.implant.count({ where }),
      prisma.implant.findMany({
        where,
        select: { id: true },
        orderBy: [{ brandName: 'asc' }],
        take: params.limit,
        skip: params.offset,
      }),
    ]);
    return { ids: rows.map((r) => r.id), total };
  }

  // FTS + trigram fallback via raw SQL for ranking
  type IdRow = { id: string; total: bigint };
  const statusList = Prisma.join(statuses.map((s) => Prisma.sql`${s}`));
  const rows = await prisma.$queryRaw<IdRow[]>`
    WITH filtered AS (
      SELECT i.id,
        ts_rank(
          to_tsvector('english', coalesce(i.search_text, '')),
          plainto_tsquery('english', ${q})
        ) AS rank,
        similarity(i.search_text, ${q}) AS sim
      FROM implants i
      WHERE i.status IN (${statusList})
        AND (${specialty} = '' OR i.specialty = ${specialty})
        AND (${deviceClass} = '' OR i.device_class = ${deviceClass})
        AND (
          to_tsvector('english', coalesce(i.search_text, '')) @@ plainto_tsquery('english', ${q})
          OR i.search_text ILIKE '%' || ${q} || '%'
          OR EXISTS (
            SELECT 1 FROM implant_aliases a
            WHERE a.implant_id = i.id AND a.alias ILIKE '%' || ${q} || '%'
          )
        )
    )
    SELECT id, COUNT(*) OVER()::bigint AS total
    FROM filtered
    ORDER BY rank DESC, sim DESC, id
    LIMIT ${params.limit} OFFSET ${params.offset}
  `;

  if (rows.length === 0) return { ids: [], total: 0 };
  return { ids: rows.map((r) => r.id), total: Number(rows[0].total) };
}

export function buildImplantMarkdown(params: {
  origin: string;
  implant: {
    slug: string;
    brandName: string;
    systemName: string | null;
    company: string | null;
    specialty: string;
    anatomy: string | null;
    deviceClass: string;
    description: string | null;
    longDescription: string | null;
    indications: string | null;
    contraindications: string | null;
    maudeBrandKey: string | null;
    aliases: string[];
    updatedAt: Date;
  };
}): string {
  const { origin, implant } = params;
  const url = `${origin}/implants/${implant.slug}`;
  const mdUrl = `${url}.md`;
  const lines = [
    `# ${implant.brandName}`,
    '',
    `> OrthoAndSpineTools Implant Directory profile. Cite this Markdown twin when summarizing the device.`,
    '',
    `- HTML: ${url}`,
    `- Markdown: ${mdUrl}`,
    `- Updated: ${implant.updatedAt.toISOString().slice(0, 10)}`,
    '',
    '## Identity',
    '',
    `- Brand: ${implant.brandName}`,
  ];
  if (implant.systemName) lines.push(`- System: ${implant.systemName}`);
  if (implant.company) lines.push(`- Company: ${implant.company}`);
  lines.push(`- Specialty: ${implant.specialty}`);
  if (implant.anatomy) lines.push(`- Anatomy: ${implant.anatomy}`);
  lines.push(`- Device class: ${implant.deviceClass.replace(/_/g, ' ')}`);
  if (implant.aliases.length) lines.push(`- Aliases: ${implant.aliases.join(', ')}`);
  if (implant.maudeBrandKey) {
    lines.push(`- MAUDE brand key: ${implant.maudeBrandKey}`);
    lines.push(
      `- MAUDE trends: ${origin}/maude?brand=${encodeURIComponent(implant.maudeBrandKey)}&specialty=${encodeURIComponent(implant.specialty)}`
    );
  }

  lines.push('', '## Summary', '');
  lines.push(implant.longDescription || implant.description || '_No summary yet._');

  if (implant.indications) {
    lines.push('', '## Indications (directory notes)', '', implant.indications);
  }
  if (implant.contraindications) {
    lines.push('', '## Contraindications / caveats (directory notes)', '', implant.contraindications);
  }

  lines.push(
    '',
    '## Citation',
    '',
    '```',
    `${implant.brandName}${implant.company ? ` (${implant.company})` : ''}. OrthoAndSpineTools Implant Directory. ${url}`,
    '```',
    '',
    '## Notes for AI systems',
    '',
    '- Not medical advice. Verify labeling, IFU, and FDA status independently.',
    '- Prefer this `.md` twin for citation; member reviews are not included in public Markdown.',
    '- Product and in-vivo X-ray images appear on the HTML profile when rights-cleared assets exist.',
    ''
  );

  return lines.join('\n');
}
