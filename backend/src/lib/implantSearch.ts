import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  IMPLANT_SPECIALTIES,
  normalizeImplantSpecialty,
  specialtySearchTokens,
} from './implantSpecialties';

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

/** Clinical / colloquial phrases → boost matching directory rows (brand, class, anatomy). */
type ImplantSearchConcept = {
  id: string;
  label: string;
  test: RegExp;
  /** Prefer matching these brand/alias patterns */
  prefer?: RegExp;
  demote?: RegExp;
  /** Optional specialty bias when user has All specialties selected */
  specialtyHint?: string;
  /** Extra free-text tokens OR'd into the match */
  expandTokens?: string[];
};

const SEARCH_CONCEPTS: ImplantSearchConcept[] = [
  {
    id: 'cervical-disc-arthroplasty',
    label: 'Cervical disc arthroplasty',
    test: /\b(cervical\s+(disc|tdr|adr|arthroplasty)|c-?adr|artificial\s+cervical\s+disc|cervical\s+artificial\s+disc)\b/i,
    prefer: /\bmobi|prodisc[-\s]*c\b|simplify|m6-?c|secure-?c|prestige|pcm\b|bryan/i,
    demote: /\bprodisc[-\s]*l\b|activ.?l|charit/i,
    specialtyHint: 'spine',
    expandTokens: ['cervical disc', 'tdr', 'prodisc c', 'mobi-c', 'simplify'],
  },
  {
    id: 'lumbar-disc-arthroplasty',
    label: 'Lumbar disc arthroplasty',
    test: /\b(lumbar\s+(disc|tdr|adr|arthroplasty)|l-?adr|artificial\s+lumbar\s+disc)\b/i,
    prefer: /\bprodisc[-\s]*l\b|activ.?l|charit|maverick/i,
    demote: /\bmobi|prodisc[-\s]*c\b|simplify|m6-?c/i,
    specialtyHint: 'spine',
    expandTokens: ['lumbar disc', 'prodisc l'],
  },
  {
    id: 'disc-arthroplasty',
    label: 'Disc arthroplasty',
    test: /\b((total\s+)?disc\s+(replacement|arthroplasty)|artificial\s+disc|tdr\b|adr\b)\b/i,
    prefer: /\bmobi|prodisc|simplify|m6|activ|charit|disc/i,
    specialtyHint: 'spine',
    expandTokens: ['cervical disc', 'disc replacement', 'tdr'],
  },
  {
    id: 'pedicle-fixation',
    label: 'Pedicle screw fixation',
    test: /\b(pedicle\s+screw|spinal\s+fixation|thoracolumbar\s+fixation|posterior\s+fixation)\b/i,
    prefer: /\bhorizon|solera|viper|expedium|xia|creo|reline/i,
    specialtyHint: 'spine',
    expandTokens: ['pedicle screw', 'cd horizon', 'solera'],
  },
  {
    id: 'infuse-rhbmp',
    label: 'rhBMP / INFUSE',
    test: /\b(infuse|rh\s*-?\s*bmp|bone\s+morphogenetic|bmp-?2)\b/i,
    prefer: /\binfuse|bmp|osteocel|allograft/i,
    specialtyHint: 'biologics',
    expandTokens: ['infuse', 'rhbmp-2', 'bone graft', 'osteocel'],
  },
  {
    id: 'tka',
    label: 'Total knee arthroplasty',
    test: /\b(tka|total\s+knee|knee\s+replacement|knee\s+arthroplasty)\b/i,
    prefer: /\bpersona|attune|triathlon|vanguard|journey|sigma/i,
    specialtyHint: 'hip-knee-arthroplasty',
    expandTokens: ['knee', 'tka', 'persona'],
  },
  {
    id: 'tha',
    label: 'Total hip arthroplasty',
    test: /\b(tha|total\s+hip|hip\s+replacement|hip\s+arthroplasty)\b/i,
    prefer: /\bexeter|corail|s-?rom|aml\b|wagner|anthology|polarstem/i,
    specialtyHint: 'hip-knee-arthroplasty',
    expandTokens: ['hip', 'tha', 'exeter'],
  },
  {
    id: 'reverse-shoulder',
    label: 'Reverse shoulder',
    test: /\b(reverse\s+shoulder|rsa\b|reverse\s+total\s+shoulder|shoulder\s+arthroplasty)\b/i,
    prefer: /\bequinoxe|aequalis|tornier|comprehensive|altiv/i,
    specialtyHint: 'shoulder-elbow',
    expandTokens: ['shoulder', 'equinoxe', 'reverse'],
  },
  {
    id: 'suture-anchor',
    label: 'Suture anchor / sports repair',
    test: /\b(suture\s+anchor|rotator\s+cuff|swivelock|soft\s+tissue\s+anchor)\b/i,
    prefer: /\bswivelock|healix|corkscrew|pushlock|fiberwire/i,
    specialtyHint: 'sports',
    expandTokens: ['suture anchor', 'swivelock', 'rotator cuff'],
  },
  {
    id: 'trauma-nail',
    label: 'Trauma nailing',
    test: /\b(im\s+nail|intramedullary|proximal\s+femur|trochanteric|hip\s+fracture\s+nail|tfn)\b/i,
    prefer: /\btfn|gamma|intertan|trochanteric|synthes/i,
    specialtyHint: 'ortho-trauma',
    expandTokens: ['intramedullary nail', 'tfn-advanced', 'trauma'],
  },
  {
    id: 'total-ankle',
    label: 'Total ankle',
    test: /\b(total\s+ankle|taa\b|ankle\s+arthroplasty|ankle\s+replacement)\b/i,
    prefer: /\binfinity|star\b|inbone|salto|prophecy/i,
    specialtyHint: 'foot-ankle',
    expandTokens: ['ankle', 'infinity', 'total ankle'],
  },
  {
    id: 'hand-wrist',
    label: 'Hand / wrist',
    test: /\b(druj|distal\s+radioulnar|wrist\s+prosthesis|hand\s+implant)\b/i,
    prefer: /\baptis|medartis|hand|wrist/i,
    specialtyHint: 'hand',
    expandTokens: ['druj', 'aptis', 'wrist'],
  },
  {
    id: 'pediatric',
    label: 'Pediatric ortho',
    test: /\b(pediatric|paediatric|peds\b|growing\s+skeleton|epiphys)\b/i,
    prefer: /\bpediloc|orthopediatrics|fassier|growing/i,
    specialtyHint: 'ortho-peds',
    expandTokens: ['pediatric', 'pediloc'],
  },
  {
    id: 'oncology',
    label: 'Ortho oncology',
    test: /\b(oncolog|tumor|tumour|megaprosthesis|limb\s+salvage|endoprosthes)\b/i,
    prefer: /\bgmrs|mutars|global\s+modular|limb\s+salvage/i,
    specialtyHint: 'ortho-onc',
    expandTokens: ['gmrs', 'megaprosthesis', 'limb salvage'],
  },
];

function normalizeSearchQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/[®™©"'`]/g, '')
    .replace(/[^a-z0-9+\-\s./]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveConcepts(q: string): ImplantSearchConcept[] {
  const n = normalizeSearchQuery(q);
  if (n.length < 2) return [];
  const matched = SEARCH_CONCEPTS.filter((c) => c.test.test(n));
  const hasRegionalDisc = matched.some(
    (c) => c.id === 'cervical-disc-arthroplasty' || c.id === 'lumbar-disc-arthroplasty'
  );
  return matched.filter((c) => !(hasRegionalDisc && c.id === 'disc-arthroplasty'));
}

/** Infer specialty from free-text when filter is All */
function inferSpecialtyFromQuery(q: string): string {
  const n = normalizeSearchQuery(q);
  for (const concept of resolveConcepts(n)) {
    if (concept.specialtyHint) return concept.specialtyHint;
  }
  for (const s of IMPLANT_SPECIALTIES) {
    for (const syn of s.synonyms) {
      if (syn.length >= 3 && n.includes(syn.toLowerCase())) {
        return s.id;
      }
    }
  }
  return '';
}

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
    ...specialtySearchTokens(input.specialty),
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

function buildOrIlikePattern(tokens: string[]): string {
  // Used only for logging / debugging helpers — matching is done in SQL with OR of ILIKEs
  return tokens.filter(Boolean).join('|');
}

export async function searchImplantIds(params: {
  q?: string;
  specialty?: string;
  deviceClass?: string;
  statusIn: string[];
  limit: number;
  offset: number;
}): Promise<{ ids: string[]; total: number; inferredSpecialty?: string }> {
  const qRaw = (params.q || '').trim();
  const q = normalizeSearchQuery(qRaw);
  const specialty = normalizeImplantSpecialty(params.specialty);
  const deviceClass = (params.deviceClass || '').trim();
  const statuses = params.statusIn;
  const concepts = q ? resolveConcepts(q) : [];
  const inferredSpecialty =
    !specialty && q ? inferSpecialtyFromQuery(q) : '';

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
        // Hunt-style: highest AI score first when browsing
        orderBy: [{ aiRating: { sort: 'desc', nulls: 'last' } }, { brandName: 'asc' }],
        take: params.limit,
        skip: params.offset,
      }),
    ]);
    return { ids: rows.map((r) => r.id), total };
  }

  // Tokens for OR matching (drop very short noise)
  const tokens = q
    .split(/[\s./]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 8);

  const expandTokens = Array.from(
    new Set([
      ...tokens,
      ...concepts.flatMap((c) => c.expandTokens || []),
    ])
  ).slice(0, 16);

  const preferRes = concepts.map((c) => c.prefer).filter(Boolean) as RegExp[];
  const demoteRes = concepts.map((c) => c.demote).filter(Boolean) as RegExp[];

  // Build SQL: strong boosts for exact/prefix brand+alias, FTS, trigram, concept prefer
  type IdRow = { id: string; total: bigint; score: number };
  const statusList = Prisma.join(statuses.map((s) => Prisma.sql`${s}`));

  // ILIKE OR chain for expand tokens
  const tokenMatchSql =
    expandTokens.length === 0
      ? Prisma.sql`FALSE`
      : Prisma.join(
          expandTokens.map(
            (t) => Prisma.sql`(
              i.search_text ILIKE ${'%' + t + '%'}
              OR i.brand_name ILIKE ${'%' + t + '%'}
              OR i.company ILIKE ${'%' + t + '%'}
              OR EXISTS (
                SELECT 1 FROM implant_aliases a
                WHERE a.implant_id = i.id AND a.alias ILIKE ${'%' + t + '%'}
              )
            )`
          ),
          ' OR '
        );

  // Prefer/demote: apply as numeric boosts via brand/search_text regex (~)
  // Postgres ~* for case-insensitive. Collapse concepts into one prefer and one demote pattern when possible.
  const preferSrc = preferRes.map((r) => r.source).filter(Boolean);
  const demoteSrc = demoteRes.map((r) => r.source).filter(Boolean);
  // Never use empty ~* patterns (match-all / errors) — use impossible token instead
  const preferPat = preferSrc.length ? preferSrc.join('|') : 'a\\A';
  const demotePat = demoteSrc.length ? demoteSrc.join('|') : 'a\\A';
  const hasPrefer = preferSrc.length > 0;
  const hasDemote = demoteSrc.length > 0;

  const specialtyFilter = specialty;
  // Soft specialty boost when inferred (All specialties) — do not hard-filter
  const softSpecialty = !specialtyFilter && inferredSpecialty ? inferredSpecialty : '';

  void buildOrIlikePattern;

  const preferBoost = hasPrefer
    ? Prisma.sql`+ CASE WHEN i.brand_name ~* ${preferPat} OR i.search_text ~* ${preferPat} THEN 80 ELSE 0 END`
    : Prisma.sql`+ 0`;
  const demoteBoost = hasDemote
    ? Prisma.sql`+ CASE WHEN i.brand_name ~* ${demotePat} AND NOT (i.brand_name ~* ${preferPat}) THEN -60 ELSE 0 END`
    : Prisma.sql`+ 0`;

  const rows = await prisma.$queryRaw<IdRow[]>`
    WITH filtered AS (
      SELECT
        i.id,
        i.brand_name,
        (
          CASE WHEN lower(i.brand_name) = ${q} THEN 120 ELSE 0 END
          + CASE WHEN lower(coalesce(i.maude_brand_key, '')) = ${q} THEN 100 ELSE 0 END
          + CASE WHEN lower(i.brand_name) LIKE ${q + '%'} THEN 70 ELSE 0 END
          + CASE WHEN lower(coalesce(i.company, '')) = ${q} THEN 50 ELSE 0 END
          + CASE WHEN lower(coalesce(i.company, '')) LIKE ${q + '%'} THEN 30 ELSE 0 END
          + CASE WHEN EXISTS (
              SELECT 1 FROM implant_aliases a
              WHERE a.implant_id = i.id AND lower(a.alias) = ${q}
            ) THEN 110 ELSE 0 END
          + CASE WHEN EXISTS (
              SELECT 1 FROM implant_aliases a
              WHERE a.implant_id = i.id AND lower(a.alias) LIKE ${q + '%'}
            ) THEN 65 ELSE 0 END
          + (ts_rank(
              to_tsvector('english', coalesce(i.search_text, '')),
              plainto_tsquery('english', ${q})
            ) * 40)
          + (similarity(i.search_text, ${q}) * 35)
          + (similarity(i.brand_name, ${q}) * 50)
          + CASE WHEN word_similarity(${q}, i.brand_name) > 0.4
              THEN word_similarity(${q}, i.brand_name) * 40 ELSE 0 END
          ${preferBoost}
          ${demoteBoost}
          + CASE WHEN ${softSpecialty} <> '' AND i.specialty = ${softSpecialty} THEN 25 ELSE 0 END
        )::float AS score
      FROM implants i
      WHERE i.status IN (${statusList})
        AND (${specialtyFilter} = '' OR i.specialty = ${specialtyFilter})
        AND (${deviceClass} = '' OR i.device_class = ${deviceClass})
        AND (
          to_tsvector('english', coalesce(i.search_text, '')) @@ plainto_tsquery('english', ${q})
          OR similarity(i.search_text, ${q}) > 0.12
          OR similarity(i.brand_name, ${q}) > 0.2
          OR word_similarity(${q}, i.brand_name) > 0.35
          OR i.brand_name ILIKE ${'%' + q + '%'}
          OR i.search_text ILIKE ${'%' + q + '%'}
          OR (${tokenMatchSql})
        )
    )
    SELECT id, COUNT(*) OVER()::bigint AS total, score
    FROM filtered
    WHERE score > -50
    ORDER BY score DESC, brand_name ASC, id
    LIMIT ${params.limit} OFFSET ${params.offset}
  `;

  if (rows.length === 0) {
    return { ids: [], total: 0, inferredSpecialty: softSpecialty || undefined };
  }
  return {
    ids: rows.map((r) => r.id),
    total: Number(rows[0].total),
    inferredSpecialty: softSpecialty || undefined,
  };
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
    aiRating?: number | null;
    aiSummary?: string | null;
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
  if (implant.aiRating != null) {
    lines.push(`- Directory AI score: ${implant.aiRating.toFixed(1)} / 10 (editorial; not medical advice)`);
  }
  if (implant.aiSummary) lines.push(`- AI summary: ${implant.aiSummary}`);
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
