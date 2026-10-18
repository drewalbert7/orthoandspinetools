/**
 * Implant Directory specialty keys: aligned with community slugs + MAUDE filters.
 * Keep in sync with frontend/src/lib/implantSpecialties.ts
 */
export const IMPLANT_SPECIALTIES = [
  {
    id: 'spine',
    label: 'Spine',
    synonyms: [
      'spine',
      'spinal',
      'cervical',
      'lumbar',
      'thoracolumbar',
      'acdf',
      'tdr',
      'disc arthroplasty',
      'pedicle',
      'sacroiliac',
      'si fusion',
    ],
  },
  {
    id: 'hip-knee-arthroplasty',
    label: 'Hip & Knee Arthroplasty',
    synonyms: [
      'hip',
      'knee',
      'tha',
      'tka',
      'arthroplasty',
      'total hip',
      'total knee',
      'uka',
      'partial knee',
      'joint replacement',
    ],
  },
  {
    id: 'shoulder-elbow',
    label: 'Shoulder Elbow',
    synonyms: ['shoulder', 'elbow', 'rsa', 'reverse shoulder', 'humeral', 'glenoid'],
  },
  {
    id: 'sports',
    label: 'Sports',
    synonyms: [
      'sports',
      'sports medicine',
      'suture anchor',
      'rotator cuff',
      'acl',
      'arthroscope',
      'soft tissue',
    ],
  },
  {
    id: 'ortho-trauma',
    label: 'Ortho Trauma',
    synonyms: [
      'trauma',
      'fracture',
      'intramedullary',
      'im nail',
      'nailing',
      'plate fixation',
      'proximal femur',
    ],
  },
  {
    id: 'foot-ankle',
    label: 'Foot & Ankle',
    synonyms: ['foot', 'ankle', 'total ankle', 'taa', 'calcaneus', 'talus'],
  },
  {
    id: 'hand',
    label: 'Hand',
    synonyms: ['hand', 'wrist', 'druj', 'carpal', 'finger', 'phalanx'],
  },
  {
    id: 'ortho-peds',
    label: 'Ortho Peds',
    synonyms: ['pediatric', 'peds', 'paediatric', 'growth', 'epiphys'],
  },
  {
    id: 'ortho-onc',
    label: 'Ortho Onc',
    synonyms: ['oncology', 'tumor', 'tumour', 'megaprosthesis', 'limb salvage'],
  },
  {
    id: 'biologics',
    label: 'Biologics',
    synonyms: [
      'biologic',
      'biologics',
      'bmp',
      'rhbmp',
      'allograft',
      'bone graft',
      'dbm',
      'prp',
      'infuse',
    ],
  },
] as const;

export type ImplantSpecialtyId = (typeof IMPLANT_SPECIALTIES)[number]['id'];

export const ALL_IMPLANT_SPECIALTY = {
  id: 'all',
  label: 'All specialties',
} as const;

const SPECIALTY_IDS = new Set<string>(IMPLANT_SPECIALTIES.map((s) => s.id));

export function isKnownImplantSpecialty(value: string): boolean {
  return SPECIALTY_IDS.has(value);
}

/** Empty string / "all" → no specialty filter */
export function normalizeImplantSpecialty(value: string | null | undefined): string {
  const v = (value || '').trim().toLowerCase();
  if (!v || v === 'all' || v === 'all-specialties' || v === 'all_specialties') return '';
  return SPECIALTY_IDS.has(v) ? v : v;
}

export function specialtyLabel(id: string): string {
  if (!id || id === 'all') return ALL_IMPLANT_SPECIALTY.label;
  return IMPLANT_SPECIALTIES.find((s) => s.id === id)?.label || id;
}

/** Synonym / label tokens to fold into search_text for a specialty id */
export function specialtySearchTokens(specialtyId: string | null | undefined): string[] {
  const s = IMPLANT_SPECIALTIES.find((x) => x.id === specialtyId);
  if (!s) return specialtyId ? [specialtyId] : [];
  return [s.id, s.label, ...s.synonyms];
}
