import { getPublicSiteUrl } from './sesConfig';

type SitemapEntry = {
  path: string;
  lastmod?: Date;
  changefreq?: string;
  priority?: string;
};

function formatLastmod(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const origin = getPublicSiteUrl();
  const urls = entries
    .map((entry) => {
      const loc = `${origin}${entry.path.startsWith('/') ? entry.path : `/${entry.path}`}`;
      const lastmod = entry.lastmod ? `\n    <lastmod>${formatLastmod(entry.lastmod)}</lastmod>` : '';
      const changefreq = entry.changefreq ? `\n    <changefreq>${entry.changefreq}</changefreq>` : '';
      const priority = entry.priority ? `\n    <priority>${entry.priority}</priority>` : '';
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod}${changefreq}${priority}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export const STATIC_SITEMAP_PAGES: SitemapEntry[] = [
  { path: '/', changefreq: 'hourly', priority: '1.0' },
  { path: '/popular', changefreq: 'hourly', priority: '0.9' },
  { path: '/startups', changefreq: 'daily', priority: '0.8' },
  { path: '/cases', changefreq: 'daily', priority: '0.8' },
  { path: '/search', changefreq: 'weekly', priority: '0.6' },
];
