/**
 * Implant Directory specialty keys — aligned with community slugs + MAUDE filters.
 * Keep in sync with frontend ImplantDirectory options.
 */
export const IMPLANT_SPECIALTIES = [
  { id: 'spine', label: 'Spine' },
  { id: 'hip-knee-arthroplasty', label: 'Hip & Knee Arthroplasty' },
  { id: 'shoulder-elbow', label: 'Shoulder Elbow' },
  { id: 'sports', label: 'Sports' },
  { id: 'ortho-trauma', label: 'Ortho Trauma' },
  { id: 'foot-ankle', label: 'Foot & Ankle' },
  { id: 'hand', label: 'Hand' },
  { id: 'ortho-peds', label: 'Ortho Peds' },
  { id: 'ortho-onc', label: 'Ortho Onc' },
  { id: 'biologics', label: 'Biologics' },
] as const;

export type ImplantSpecialtyId = (typeof IMPLANT_SPECIALTIES)[number]['id'];

const SPECIALTY_IDS = new Set<string>(IMPLANT_SPECIALTIES.map((s) => s.id));

export function isKnownImplantSpecialty(value: string): boolean {
  return SPECIALTY_IDS.has(value);
}

export function normalizeImplantSpecialty(value: string | null | undefined): string {
  const v = (value || '').trim();
  if (!v || v === 'all') return '';
  return SPECIALTY_IDS.has(v) ? v : v;
}
