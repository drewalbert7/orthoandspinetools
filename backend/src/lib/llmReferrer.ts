/** Map a human pageview referrer to an LLM chat product (beacon only). */

export type LlmProductId =
  | 'chatgpt'
  | 'claude'
  | 'perplexity'
  | 'grok'
  | 'gemini'
  | 'copilot'
  | 'meta'
  | 'other_ai';

const HOST_RULES: Array<{ id: LlmProductId; test: (host: string) => boolean }> = [
  { id: 'chatgpt', test: (h) => /chatgpt\.com$|chat\.openai\.com$/.test(h) },
  { id: 'claude', test: (h) => /(^|\.)claude\.ai$|(^|\.)anthropic\.com$/.test(h) },
  { id: 'perplexity', test: (h) => /(^|\.)perplexity\.ai$/.test(h) },
  { id: 'grok', test: (h) => /(^|\.)grok\.x\.ai$|(^|\.)x\.ai$/.test(h) },
  { id: 'gemini', test: (h) => /gemini\.google\.com$|bard\.google\.com$/.test(h) },
  { id: 'copilot', test: (h) => /copilot\.microsoft\.com$/.test(h) },
  { id: 'meta', test: (h) => /(^|\.)meta\.ai$/.test(h) },
];

export function classifyLlmReferrer(referrer: string | null | undefined): LlmProductId | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    for (const rule of HOST_RULES) {
      if (rule.test(host)) return rule.id;
    }
  } catch {
    return null;
  }
  return null;
}

export const LLM_PRODUCT_LABELS: Record<LlmProductId, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  perplexity: 'Perplexity',
  grok: 'Grok',
  gemini: 'Gemini',
  copilot: 'Copilot',
  meta: 'Meta AI',
  other_ai: 'Other AI',
};

/** Roll bot family → product bucket (agents + crawlers). */
export function botFamilyToProduct(family: string): LlmProductId | 'amazon' | 'bytedance' | 'commoncrawl' {
  const f = family.toLowerCase();
  if (f.includes('chatgpt') || f === 'gptbot' || f.includes('oai-search')) return 'chatgpt';
  if (f.includes('claude')) return 'claude';
  if (f.includes('perplexity')) return 'perplexity';
  if (f.includes('grok')) return 'grok';
  if (f.includes('google-extended')) return 'gemini';
  if (f.includes('amazon')) return 'amazon';
  if (f.includes('bytespider')) return 'bytedance';
  if (f.includes('ccbot')) return 'commoncrawl';
  if (f.includes('copilot') || f.includes('bing')) return 'copilot';
  if (f.includes('meta') || f.includes('facebook')) return 'meta';
  return 'other_ai';
}

export function productLabel(id: string): string {
  if (id in LLM_PRODUCT_LABELS) return LLM_PRODUCT_LABELS[id as LlmProductId];
  if (id === 'amazon') return 'Amazon';
  if (id === 'bytedance') return 'Bytespider';
  if (id === 'commoncrawl') return 'Common Crawl';
  return id;
}
