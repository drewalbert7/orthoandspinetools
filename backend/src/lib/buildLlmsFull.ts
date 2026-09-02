import { getPublicSiteUrl } from './sesConfig';
import { stripToPlainText } from './postOgPreviewHtml';

type LlmsCommunity = { slug: string; name: string; description: string | null };
type LlmsPost = {
  id: string;
  title: string;
  content: string | null;
  createdAt: Date;
  author: { username: string };
  community: { slug: string; name: string } | null;
};
type LlmsUser = { username: string; firstName: string; lastName: string; specialty: string | null };

function formatPostLine(origin: string, post: LlmsPost): string[] {
  const date = post.createdAt.toISOString().slice(0, 10);
  const comm = post.community ? `o/${post.community.name}` : 'community';
  const lines = [
    `- ${origin}/post/${post.id} — "${post.title}" — ${comm} — u/${post.author.username} — ${date}`,
  ];
  const excerpt = post.content ? stripToPlainText(post.content, 220) : '';
  if (excerpt) {
    lines.push(`  ${excerpt}`);
  }
  return lines;
}

export function buildLlmsFullText(params: {
  communities: LlmsCommunity[];
  posts: LlmsPost[];
  startupPosts: LlmsPost[];
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
    `- ${origin}/post/{id} — Discussion thread (JSON-LD: DiscussionForumPosting; OG HTML for crawlers)`,
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

  lines.push('', '## Startup & product posts', '');
  if (params.startupPosts.length === 0) {
    lines.push(`- (none yet) — browse ${origin}/startups for orthopedic and spine startup discussions`);
  } else {
    for (const p of params.startupPosts) {
      lines.push(...formatPostLine(origin, p));
    }
  }

  lines.push('', '## Recent posts (newest first)', '');
  for (const p of params.posts) {
    lines.push(...formatPostLine(origin, p));
  }

  lines.push(
    '',
    '## Structured data',
    '',
    '- Post, community, profile, and hub pages serve schema.org JSON-LD in crawler HTML and in the browser SPA.',
    '- Post permalinks include DiscussionForumPosting metadata for search engines and AI systems.',
    ''
  );

  return lines.join('\n');
}
