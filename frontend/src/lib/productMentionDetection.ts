import type { Post } from '../services/apiService';

const DEVICE_TAG_NAMES = new Set(['medical device', 'tool', 'biologic'].map((s) => s.toLowerCase()));

const IMPLANT_KEYWORD_PATTERNS: RegExp[] = [
  /\bimplants?\b/i,
  /\binterbody\b/i,
  /\bcages?\b/i,
  /\b(alif|tlif|plif|olif|xlif)\b/i,
  /\bpedicle\b/i,
  /\bpedicle\s+screw/i,
  /\b(bone\s+screw|locking\s+screw|polyaxial\s+screw)\b/i,
  /\b(rod|rods)\s+(system|reduction|contour)\b/i,
  /\b(plate|plates)\s+(fixation|system|locking)\b/i,
  /\b(cervical|lumbar)\s+(plate|cage|disc)\b/i,
  /\b(anchor|anchors)\s+(system)?\b/i,
  /\bspinal\s+(fixation|implant|device|system)\b/i,
  /\bfixation\s+(system|device|implant)\b/i,
  /\bspacer(s)?\b/i,
  /\bprosthes(is|es)\b/i,
  /\barthroplasty\b/i,
  /\b(tka|tha)\b/i,
  /\bprosthetic\b/i,
  /\bsurgical\s+(implant|device|instrument|hardware)\b/i,
  /\bmedical\s+device\b/i,
  /\binstrumentation\b/i,
  /\b(titanium|peek)\s+(cage|implant|spacer)\b/i,
  /\b(3d|3-d)\s*[-]?\s*print(ed)?\s+(cage|implant|titanium|device)\b/i,
  /\bprinted\s+titanium\b/i,
  /[®™]/,
  /\b(prp|bmac|bone\s+marrow\s+aspirate|stem\s+cell)\s+(therapy|concentrate|injection)?\b/i,
  /\b510\s*\(\s*k\s*\)\b/i,
  /\bifu\b/i,
  /\b(stryker|zimmer|depuy|synthes|medtronic|nuvasive|globus|orthofix|smith[-\s]?nephew|acumed|arthrex|conmed|degen\s*medical|biomet|exactech)\b/i,
  /degenmedical\.com/i,
];

function tagHaystack(post: Pick<Post, 'tags'>): string {
  if (!post.tags?.length) return '';
  return post.tags
    .map((pt) => pt?.tag?.name)
    .filter(Boolean)
    .join(' ');
}

export function postMentionsDevicesOrTools(
  post: Pick<Post, 'title' | 'content' | 'type' | 'linkUrl' | 'tags'>
): boolean {
  const t = post.type;
  if (t === 'tool_review' || t === 'case_study') return true;

  const tags = tagHaystack(post).toLowerCase();
  for (const name of DEVICE_TAG_NAMES) {
    if (tags.includes(name)) return true;
  }

  const hay = [post.title || '', post.content || '', post.linkUrl || '', tags].join('\n');

  return IMPLANT_KEYWORD_PATTERNS.some((re) => re.test(hay));
}
