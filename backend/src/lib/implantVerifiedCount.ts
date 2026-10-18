import { prisma } from './prisma';

/** Short TTL cache: verified count is filter chrome, not transactional. */
const TTL_MS = 60_000;

let cache: { value: number; at: number } | null = null;

export function invalidateVerifiedImplantCountCache(): void {
  cache = null;
}

export async function getVerifiedImplantCount(): Promise<number> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return cache.value;
  }
  const value = await prisma.implant.count({ where: { status: 'verified' } });
  cache = { value, at: now };
  return value;
}
