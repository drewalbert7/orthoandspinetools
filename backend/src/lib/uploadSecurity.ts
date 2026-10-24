import path from 'path';

// Local upload subdirectories that may be addressed by the ?type= query param.
export const ALLOWED_UPLOAD_TYPES = ['images', 'xrays', 'videos'] as const;
export type UploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

export const isAllowedUploadType = (type: unknown): type is UploadType =>
  typeof type === 'string' && (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(type);

/**
 * Resolve a user supplied filename to an absolute path strictly inside baseDir.
 * Returns null for anything unsafe: empty, '.', '..', NUL bytes, path separators,
 * or any result that does not stay inside the resolved base directory.
 */
export const resolveSafeUploadPath = (baseDir: string, filename: unknown): string | null => {
  if (typeof filename !== 'string') return null;
  if (filename.length === 0 || filename.includes('\0')) return null;

  // Only the final path segment is ever used; a name that carries directory parts is rejected.
  const base = path.basename(filename);
  if (base !== filename || filename.includes('/') || filename.includes('\\')) return null;
  if (base === '.' || base === '..') return null;

  const root = path.resolve(baseDir);
  const full = path.resolve(root, base);
  if (!full.startsWith(root + path.sep)) return null;
  return full;
};

/** True when target resolves strictly inside baseDir (not equal to it). */
export const isPathInside = (baseDir: string, target: string): boolean => {
  const root = path.resolve(baseDir);
  const full = path.resolve(target);
  return full.startsWith(root + path.sep);
};

export type MediaDeleteDecision = 'allow' | 'forbidden' | 'not_found';

/**
 * Decide whether a requester may delete an uploaded file or media object.
 * ownerIds: user ids recorded as owning the object (empty when no record exists).
 * Admins may always delete (older files without a record are admin-only).
 * Otherwise unknown objects are 404 and objects owned by someone else are 403.
 */
export const decideMediaDelete = (
  requester: { id: string; isAdmin?: boolean | null },
  ownerIds: Array<string | null | undefined>
): MediaDeleteDecision => {
  if (requester.isAdmin === true) return 'allow';
  const owners = ownerIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (owners.length === 0) return 'not_found';
  return owners.includes(requester.id) ? 'allow' : 'forbidden';
};

/**
 * Owner ids for a local upload, from server written UPLOAD_* audit log rows.
 * resourceId is either the exact filename or (older multi file uploads) a comma joined list.
 */
export const ownerIdsFromUploadLogs = (
  filename: string,
  logs: Array<{ userId: string | null; resourceId: string | null }>
): string[] =>
  logs
    .filter((l) => typeof l.resourceId === 'string' && l.resourceId.split(',').includes(filename))
    .map((l) => l.userId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
