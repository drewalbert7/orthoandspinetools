/**
 * Bot / LLM agent User-Agent classification (Physician Forge rules).
 * First match wins. Returns null for likely human browsers.
 */

export type BotCategory =
  | 'ai_agent'
  | 'ai_crawl'
  | 'search'
  | 'social'
  | 'seo'
  | 'tool'
  | 'scanner'
  | 'other';

export type BotClassification = {
  family: string;
  category: BotCategory;
};

type Rule = {
  category: BotCategory;
  family: string;
  test: (ua: string) => boolean;
};

const RULES: Rule[] = [
  // Live agent / user fetches
  { category: 'ai_agent', family: 'ChatGPT-User', test: (ua) => /chatgpt-user/i.test(ua) },
  { category: 'ai_agent', family: 'Claude-User', test: (ua) => /claude-user/i.test(ua) },
  { category: 'ai_agent', family: 'Perplexity-User', test: (ua) => /perplexity-user/i.test(ua) },

  // Training / indexing crawlers
  { category: 'ai_crawl', family: 'GPTBot', test: (ua) => /gptbot/i.test(ua) },
  { category: 'ai_crawl', family: 'ClaudeBot', test: (ua) => /claudebot|claude-web|anthropic-ai/i.test(ua) },
  { category: 'ai_crawl', family: 'Google-Extended', test: (ua) => /google-extended/i.test(ua) },
  { category: 'ai_crawl', family: 'Amazonbot', test: (ua) => /amazonbot/i.test(ua) },
  { category: 'ai_crawl', family: 'Bytespider', test: (ua) => /bytespider/i.test(ua) },
  { category: 'ai_crawl', family: 'OAI-SearchBot', test: (ua) => /oai-searchbot/i.test(ua) },
  { category: 'ai_crawl', family: 'GrokBot', test: (ua) => /grok|xai-bot|x\.ai/i.test(ua) },
  { category: 'ai_crawl', family: 'CCBot', test: (ua) => /ccbot/i.test(ua) },
  { category: 'ai_crawl', family: 'Applebot-Extended', test: (ua) => /applebot-extended/i.test(ua) },
  { category: 'ai_crawl', family: 'PerplexityBot', test: (ua) => /perplexitybot/i.test(ua) },

  // Search
  { category: 'search', family: 'Googlebot', test: (ua) => /googlebot|google-inspectiontool/i.test(ua) },
  { category: 'search', family: 'Bingbot', test: (ua) => /bingbot|bingpreview|msnbot/i.test(ua) },
  { category: 'search', family: 'Applebot', test: (ua) => /applebot/i.test(ua) },
  { category: 'search', family: 'Yandex', test: (ua) => /yandex/i.test(ua) },
  { category: 'search', family: 'DuckDuckBot', test: (ua) => /duckduckbot/i.test(ua) },
  { category: 'search', family: 'Seznam', test: (ua) => /seznam/i.test(ua) },

  // Social / unfurl
  { category: 'social', family: 'Twitterbot', test: (ua) => /twitterbot/i.test(ua) },
  { category: 'social', family: 'Slackbot', test: (ua) => /slackbot/i.test(ua) },
  { category: 'social', family: 'Discordbot', test: (ua) => /discordbot/i.test(ua) },
  {
    category: 'social',
    family: 'Facebook',
    test: (ua) => /facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher/i.test(ua),
  },
  { category: 'social', family: 'LinkedInBot', test: (ua) => /linkedinbot/i.test(ua) },
  { category: 'social', family: 'TelegramBot', test: (ua) => /telegrambot/i.test(ua) },
  { category: 'social', family: 'WhatsApp', test: (ua) => /whatsapp/i.test(ua) },

  // SEO
  { category: 'seo', family: 'AhrefsBot', test: (ua) => /ahrefsbot|ahrefssiteaudit/i.test(ua) },
  { category: 'seo', family: 'SemrushBot', test: (ua) => /semrushbot/i.test(ua) },
  { category: 'seo', family: 'PetalBot', test: (ua) => /petalbot/i.test(ua) },
  { category: 'seo', family: 'MJ12bot', test: (ua) => /mj12bot/i.test(ua) },
  { category: 'seo', family: 'DotBot', test: (ua) => /dotbot/i.test(ua) },

  // Tools / scripts
  { category: 'tool', family: 'curl', test: (ua) => /^curl\//i.test(ua) || /\bcurl\//i.test(ua) },
  { category: 'tool', family: 'wget', test: (ua) => /\bwget\//i.test(ua) },
  { category: 'tool', family: 'Go-http-client', test: (ua) => /go-http-client/i.test(ua) },
  {
    category: 'tool',
    family: 'python-requests',
    test: (ua) => /python-requests|aiohttp|httpx/i.test(ua),
  },
  { category: 'tool', family: 'node-fetch', test: (ua) => /node-fetch|undici/i.test(ua) },

  // Scanners / probes
  {
    category: 'scanner',
    family: 'scanner',
    test: (ua) => /modat|genome|zgrab|masscan|nikto|sqlmap|nmap/i.test(ua),
  },
  {
    category: 'scanner',
    family: 'wp-probe',
    test: (ua) => /wordpress|wp.?login|xmlrpc/i.test(ua),
  },

  // Generic leftover bots
  {
    category: 'other',
    family: 'bot',
    test: (ua) => /bot|crawl|spider|slurp|crawler/i.test(ua),
  },
];

export function classifyBot(userAgent: string | undefined | null): BotClassification | null {
  if (userAgent == null) {
    return { family: 'empty-ua', category: 'scanner' };
  }
  const ua = userAgent.trim();
  // nginx combined format uses "-" for missing UA
  if (!ua || ua === '-') {
    return { family: 'empty-ua', category: 'scanner' };
  }
  for (const rule of RULES) {
    if (rule.test(ua)) {
      return { family: rule.family, category: rule.category };
    }
  }
  return null;
}

export function isHeadlineBotCategory(category: BotCategory): boolean {
  return category !== 'scanner';
}
