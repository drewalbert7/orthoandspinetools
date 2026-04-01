import { prisma } from '../lib/prisma';

export function parsePollOptionStrings(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const x of raw) {
    const s = typeof x === 'string' ? x.trim() : String(x ?? '').trim();
    if (s.length === 0) return null;
    if (s.length > 200) return null;
    out.push(s);
  }
  if (out.length < 2 || out.length > 6) return null;
  return out;
}

export function normalizeLinkUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim();
  if (!u) return null;
  try {
    const href = u.startsWith('http://') || u.startsWith('https://') ? u : `https://${u}`;
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

export type PollEnrichable = {
  id: string;
  type: string;
  pollOptions?: unknown;
  pollEndsAt?: Date | string | null;
};

export async function enrichPostsPollData<T extends PollEnrichable>(
  posts: T[],
  userId?: string
): Promise<
  Array<
    T & {
      pollVoteCounts?: number[];
      userPollVoteIndex?: number | null;
      pollClosed?: boolean;
    }
  >
> {
  const pollPosts = posts.filter((p) => p.type === 'poll');
  if (pollPosts.length === 0) {
    return posts.map((p) => ({ ...p }));
  }
  const pollIds = pollPosts.map((p) => p.id);
  const countsRows = await prisma.postPollVote.groupBy({
    by: ['postId', 'optionIndex'],
    where: { postId: { in: pollIds } },
    _count: { _all: true },
  });
  const countsByPost = new Map<string, Map<number, number>>();
  for (const row of countsRows) {
    if (!countsByPost.has(row.postId)) countsByPost.set(row.postId, new Map());
    countsByPost.get(row.postId)!.set(row.optionIndex, row._count._all);
  }
  const userVotes = new Map<string, number>();
  if (userId) {
    const uv = await prisma.postPollVote.findMany({
      where: { postId: { in: pollIds }, userId },
      select: { postId: true, optionIndex: true },
    });
    for (const v of uv) userVotes.set(v.postId, v.optionIndex);
  }
  const now = Date.now();
  return posts.map((p) => {
    if (p.type !== 'poll') return { ...p };
    const labels = parsePollOptionStrings(p.pollOptions);
    const n = labels?.length ?? 0;
    const voteCounts =
      n > 0 ? Array.from({ length: n }, (_, i) => countsByPost.get(p.id)?.get(i) ?? 0) : [];
    const ends = p.pollEndsAt ? new Date(p.pollEndsAt as string | Date).getTime() : 0;
    const pollClosed = ends > 0 && ends <= now;
    return {
      ...p,
      pollVoteCounts: voteCounts,
      userPollVoteIndex: userVotes.has(p.id) ? userVotes.get(p.id)! : null,
      pollClosed,
    };
  });
}
