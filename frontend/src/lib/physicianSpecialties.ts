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

export function requiresPhysicianVerification(specialty: string): boolean {
  return PHYSICIAN_SPECIALTIES.has(specialty);
}

export type PracticeCountry = 'US' | 'INTL';
