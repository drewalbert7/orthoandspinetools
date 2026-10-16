import { prisma } from './prisma';

export type ImplantCommentDto = {
  id: string;
  body: string;
  parentId: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    specialty: string | null;
  };
  voteScore: number;
  upvotes: number;
  downvotes: number;
  userVote: 'upvote' | 'downvote' | null;
  replies: ImplantCommentDto[];
};

type Author = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
};

type CommentRow = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  user: Author;
};

async function voteTalliesForCommentIds(
  commentIds: string[],
  viewerId?: string | null
): Promise<
  Map<string, { upvotes: number; downvotes: number; userVote: 'upvote' | 'downvote' | null }>
> {
  const map = new Map<
    string,
    { upvotes: number; downvotes: number; userVote: 'upvote' | 'downvote' | null }
  >();
  for (const id of commentIds) {
    map.set(id, { upvotes: 0, downvotes: 0, userVote: null });
  }
  if (commentIds.length === 0) return map;

  const groups = await prisma.implantCommentVote.groupBy({
    by: ['commentId', 'value'],
    where: { commentId: { in: commentIds } },
    _count: { _all: true },
  });

  for (const g of groups) {
    const row = map.get(g.commentId);
    if (!row) continue;
    if (g.value === 1) row.upvotes = g._count._all;
    else if (g.value === -1) row.downvotes = g._count._all;
  }

  if (viewerId) {
    const mine = await prisma.implantCommentVote.findMany({
      where: { userId: viewerId, commentId: { in: commentIds } },
      select: { commentId: true, value: true },
    });
    for (const v of mine) {
      const row = map.get(v.commentId);
      if (!row) continue;
      row.userVote = v.value === 1 ? 'upvote' : 'downvote';
    }
  }

  return map;
}

function toDto(
  c: CommentRow,
  tallies: Map<string, { upvotes: number; downvotes: number; userVote: 'upvote' | 'downvote' | null }>,
  replies: ImplantCommentDto[] = []
): ImplantCommentDto {
  const t = tallies.get(c.id) || { upvotes: 0, downvotes: 0, userVote: null };
  return {
    id: c.id,
    body: c.isDeleted ? '[deleted]' : c.body,
    parentId: c.parentId,
    isDeleted: c.isDeleted,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    author: c.user,
    voteScore: t.upvotes - t.downvotes,
    upvotes: t.upvotes,
    downvotes: t.downvotes,
    userVote: t.userVote,
    replies,
  };
}

const authorSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  specialty: true,
} as const;

/**
 * Load threaded comments without hydrating every vote row.
 * Tallies via groupBy; viewer vote via one small query.
 */
export async function loadImplantCommentThread(
  implantId: string,
  viewerId?: string | null
): Promise<ImplantCommentDto[]> {
  const topLevel = await prisma.implantComment.findMany({
    where: { implantId, parentId: null },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: {
      user: { select: authorSelect },
      replies: {
        orderBy: { createdAt: 'asc' },
        take: 50,
        include: { user: { select: authorSelect } },
      },
    },
  });

  const allIds: string[] = [];
  for (const c of topLevel) {
    allIds.push(c.id);
    for (const r of c.replies) allIds.push(r.id);
  }

  const tallies = await voteTalliesForCommentIds(allIds, viewerId);

  return topLevel.map((c) =>
    toDto(
      c,
      tallies,
      c.replies.map((r) => toDto(r, tallies))
    )
  );
}

/** Map a freshly created comment (no replies / no votes yet). */
export function mapNewImplantComment(
  c: CommentRow & { votes?: Array<{ userId: string; value: number }> },
  viewerId?: string | null
): ImplantCommentDto {
  const votes = c.votes || [];
  const upvotes = votes.filter((v) => v.value === 1).length;
  const downvotes = votes.filter((v) => v.value === -1).length;
  const mine = viewerId ? votes.find((v) => v.userId === viewerId) : undefined;
  return {
    id: c.id,
    body: c.isDeleted ? '[deleted]' : c.body,
    parentId: c.parentId,
    isDeleted: c.isDeleted,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    author: c.user,
    voteScore: upvotes - downvotes,
    upvotes,
    downvotes,
    userVote: mine ? (mine.value === 1 ? 'upvote' : 'downvote') : null,
    replies: [],
  };
}

/** Cheap tallies for a single comment after vote mutate. */
export async function talliesForOneComment(
  commentId: string,
  viewerId: string
): Promise<{
  upvotes: number;
  downvotes: number;
  voteScore: number;
  userVote: 'upvote' | 'downvote' | null;
}> {
  const groups = await prisma.implantCommentVote.groupBy({
    by: ['value'],
    where: { commentId },
    _count: { _all: true },
  });
  let upvotes = 0;
  let downvotes = 0;
  for (const g of groups) {
    if (g.value === 1) upvotes = g._count._all;
    else if (g.value === -1) downvotes = g._count._all;
  }
  const mine = await prisma.implantCommentVote.findUnique({
    where: { commentId_userId: { commentId, userId: viewerId } },
    select: { value: true },
  });
  return {
    upvotes,
    downvotes,
    voteScore: upvotes - downvotes,
    userVote: mine ? (mine.value === 1 ? 'upvote' : 'downvote') : null,
  };
}
