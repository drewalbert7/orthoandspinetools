export type CommunityModeratorEntry = {
  userId: string;
  username: string;
  role: string;
  profileImage?: string;
  isVerifiedPhysician?: boolean;
  isVerifiedFounder?: boolean;
};

type CommunityModeratorSource = {
  owner?: {
    id: string;
    username: string;
    profileImage?: string;
    isVerifiedPhysician?: boolean;
    isVerifiedFounder?: boolean;
  } | null;
  moderators?: Array<{
    userId: string;
    role: string;
    user?: {
      id: string;
      username: string;
      profileImage?: string;
      isVerifiedPhysician?: boolean;
      isVerifiedFounder?: boolean;
    };
  }>;
};

export function buildCommunityModeratorRoster(
  community: CommunityModeratorSource
): CommunityModeratorEntry[] {
  const roster: CommunityModeratorEntry[] = [];
  const seen = new Set<string>();

  if (community.owner?.id) {
    seen.add(community.owner.id);
    roster.push({
      userId: community.owner.id,
      username: community.owner.username,
      role: 'owner',
      profileImage: community.owner.profileImage,
      isVerifiedPhysician: community.owner.isVerifiedPhysician,
      isVerifiedFounder: community.owner.isVerifiedFounder,
    });
  }

  for (const mod of community.moderators ?? []) {
    if (seen.has(mod.userId)) continue;
    seen.add(mod.userId);
    roster.push({
      userId: mod.userId,
      username: mod.user?.username ?? 'unknown',
      role: mod.role,
      profileImage: mod.user?.profileImage,
      isVerifiedPhysician: mod.user?.isVerifiedPhysician,
      isVerifiedFounder: mod.user?.isVerifiedFounder,
    });
  }

  return roster;
}
