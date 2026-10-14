/** Keep in sync with backend/src/lib/implantSpecialties.ts */
export const ALL_IMPLANT_SPECIALTY = {
  id: 'all',
  label: 'All specialties',
} as const;

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

export const IMPLANT_SPECIALTY_FILTERS = [
  ALL_IMPLANT_SPECIALTY,
  ...IMPLANT_SPECIALTIES,
] as const;

export function specialtyLabel(id: string): string {
  if (!id || id === 'all') return ALL_IMPLANT_SPECIALTY.label;
  return IMPLANT_SPECIALTIES.find((s) => s.id === id)?.label || id;
}
