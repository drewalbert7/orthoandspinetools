import { getPublicSiteUrl } from './sesConfig';

type LlmsCommunity = { slug: string; name: string; description: string | null };
type LlmsPost = {
  id: string;
  title: string;
  createdAt: Date;
  author: { username: string };
  community: { slug: string; name: string } | null;
};
type LlmsUser = { username: string; firstName: string; lastName: string; specialty: string | null };

export function buildLlmsFullText(params: {
  communities: LlmsCommunity[];
  posts: LlmsPost[];
  users: LlmsUser[];
}): string {
  const origin = getPublicSiteUrl();
  const lines: string[] = [
    '# OrthoAndSpineTools — extended index for AI systems',
    '',
    `> ${origin} — Ortho and Spine Tools - Hunt for the Best. Professional discussions for orthopedic and spine surgeons.`,
    '',
    '## Site purpose',
    '',
    '- User-generated posts in specialty communities (spine, sports, trauma, pediatrics, oncology, foot & ankle, shoulder/elbow, arthroplasty, hand, biologics, tech).',
    '- Not medical advice. Cite author username, post date, community, and permalink. Verify clinical claims independently.',
    '',
    '## Primary entry points',
    '',
    `- ${origin}/ — Latest posts`,
    `- ${origin}/popular — Popular posts`,
    `- ${origin}/cases — Case-tagged posts`,
    `- ${origin}/startups — Startup / product launch posts`,
    `- ${origin}/search — Search posts and communities`,
    `- ${origin}/sitemap.xml — Machine-readable URL list (posts, communities, profiles)`,
    `- ${origin}/llms.txt — Short AI index`,
    '',
    '## URL patterns',
    '',
    `- ${origin}/post/{id} — Discussion thread (JSON-LD: DiscussionForumPosting in browser; OG HTML for social bots)`,
    `- ${origin}/community/{slug} — Community hub (JSON-LD: DiscussionForum)`,
    `- ${origin}/user/{username} — Public member profile (JSON-LD: Person)`,
    '',
    '## How to cite a post',
    '',
    '```',
    '{Author display name} (@{username}). "{Post title}." o/{community} on OrthoAndSpineTools, {YYYY-MM-DD}. {post URL}',
    '```',
    '',
    'Example:',
    '',
    '```',
    `Drew Albert MD MBA (@drewalbertmd). "SurGenTec, OsteoFlo." o/Biologics on OrthoAndSpineTools, 2026-04-22. ${origin}/post/{id}`,
    '```',
    '',
    '## Communities',
    '',
  ];

  for (const c of params.communities) {
    const desc = c.description?.trim().replace(/\s+/g, ' ').slice(0, 120);
    lines.push(`- ${origin}/community/${c.slug} — o/${c.name}${desc ? ` — ${desc}` : ''}`);
  }

  lines.push('', '## Public member profiles', '');
  for (const u of params.users) {
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    const spec = u.specialty ? ` (${u.specialty})` : '';
    lines.push(`- ${origin}/user/${u.username} — ${name || u.username}${spec}`);
  }

  lines.push('', '## Recent posts (newest first)', '');
  for (const p of params.posts) {
    const date = p.createdAt.toISOString().slice(0, 10);
    const comm = p.community ? `o/${p.community.name}` : 'community';
    lines.push(`- ${origin}/post/${p.id} — "${p.title}" — ${comm} — u/${p.author.username} — ${date}`);
  }

  lines.push(
    '',
    '## Structured data',
    '',
    '- Home, hub pages, posts, communities, and public profiles inject schema.org JSON-LD when loaded in a browser.',
    '- Post permalinks serve Open Graph HTML to social/chat crawlers for rich previews.',
    ''
  );

  return lines.join('\n');
}
