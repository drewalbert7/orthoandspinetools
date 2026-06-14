/** Specialties that represent licensed physicians (NPI or manual international verification). */
export const PHYSICIAN_SPECIALTIES = new Set([
  'Orthopedic Surgery',
  'Spine Surgery',
  'Sports Medicine',
  'Trauma Surgery',
  'Pediatric Orthopedics',
  'Hand Surgery',
  'Foot & Ankle Surgery',
  'Joint Replacement',
  'Spine Deformity',
  'Orthopedic Oncology',
  'Resident',
]);

export const NON_PHYSICIAN_SPECIALTIES = new Set(['Physical Therapy', 'Medical Student', 'Other']);

export function requiresPhysicianVerification(specialty: string | null | undefined): boolean {
  if (!specialty?.trim()) return false;
  return PHYSICIAN_SPECIALTIES.has(specialty.trim());
}

export type PracticeCountry = 'US' | 'INTL';

export function normalizePracticeCountry(value: string | null | undefined): PracticeCountry | null {
  const v = (value || '').trim().toUpperCase();
  if (v === 'US' || v === 'USA' || v === 'UNITED STATES') return 'US';
  if (v === 'INTL' || v === 'INTERNATIONAL' || v === 'NON-US' || v === 'NON_US') return 'INTL';
  return null;
}
