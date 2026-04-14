import { useLayoutEffect } from 'react';
import { SEO_DEFAULTS, absoluteUrl } from '../lib/seo';

export type ArticleMetaFields = {
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  authorName?: string;
};

type DocumentMetaProps = {
  title?: string;
  description?: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  /** Shown as og:image:alt and helps accessibility in link previews. */
  ogImageAlt?: string;
  /** When set, overrides the default rule (large image only when `ogImage` is set). */
  twitterCard?: 'summary' | 'summary_large_image';
  /** Open Graph locale, e.g. en_US */
  locale?: string;
  /** Facebook / LinkedIn article tags (optional). */
  articleMeta?: ArticleMetaFields | null;
  /**
   * When true, `title` is used as the full document / OG / Twitter title (no extra ` | SiteName` suffix).
   * Use for post pages with a pre-formatted headline.
   */
  titleExact?: boolean;
  noIndex?: boolean;
  jsonLd?: Record<string, unknown> | null;
};

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const sel = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(sel) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function removeMeta(attr: 'name' | 'property', key: string) {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
}

function clearOptionalShareMeta() {
  removeMeta('property', 'article:published_time');
  removeMeta('property', 'article:modified_time');
  removeMeta('property', 'article:section');
  removeMeta('property', 'article:author');
  removeMeta('property', 'og:image:alt');
  removeMeta('property', 'og:locale');
}

export function DocumentMeta({
  title,
  description,
  canonicalPath,
  ogType = 'website',
  ogImage,
  ogImageAlt,
  twitterCard,
  locale = 'en_US',
  articleMeta,
  titleExact = false,
  noIndex,
  jsonLd,
}: DocumentMetaProps) {
  useLayoutEffect(() => {
    clearOptionalShareMeta();

    const fullTitle = titleExact
      ? title || SEO_DEFAULTS.title
      : title
        ? `${title} | ${SEO_DEFAULTS.siteName}`
        : SEO_DEFAULTS.title;
    document.title = fullTitle;

    const desc = description || SEO_DEFAULTS.description;
    upsertMeta('name', 'description', desc);

    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:type', ogType);
    upsertMeta('property', 'og:site_name', SEO_DEFAULTS.siteName);
    upsertMeta('property', 'og:locale', locale);

    const pageUrl = canonicalPath
      ? absoluteUrl(canonicalPath)
      : typeof window !== 'undefined'
        ? window.location.href.split('#')[0]
        : absoluteUrl('/');
    upsertMeta('property', 'og:url', pageUrl);

    if (ogImage) {
      upsertMeta('property', 'og:image', ogImage);
    } else {
      removeMeta('property', 'og:image');
    }

    if (ogImage && ogImageAlt?.trim()) {
      upsertMeta('property', 'og:image:alt', ogImageAlt.trim());
    }

    if (articleMeta?.publishedTime?.trim()) {
      upsertMeta('property', 'article:published_time', articleMeta.publishedTime.trim());
    }
    if (articleMeta?.modifiedTime?.trim()) {
      upsertMeta('property', 'article:modified_time', articleMeta.modifiedTime.trim());
    }
    if (articleMeta?.section?.trim()) {
      upsertMeta('property', 'article:section', articleMeta.section.trim());
    }
    if (articleMeta?.authorName?.trim()) {
      upsertMeta('property', 'article:author', articleMeta.authorName.trim());
    }

    const card =
      twitterCard ?? (ogImage ? 'summary_large_image' : 'summary');
    upsertMeta('name', 'twitter:card', card);
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', desc);
    if (ogImage) {
      upsertMeta('name', 'twitter:image', ogImage);
    } else {
      removeMeta('name', 'twitter:image');
    }

    if (noIndex) {
      upsertMeta('name', 'robots', 'noindex, nofollow');
    } else {
      upsertMeta('name', 'robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    }

    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', pageUrl);

    const scriptId = 'ortho-document-jsonld';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (jsonLd) {
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else if (script) {
      script.remove();
    }

    return () => {
      clearOptionalShareMeta();
      document.title = SEO_DEFAULTS.title;
      upsertMeta('name', 'description', SEO_DEFAULTS.description);
      removeMeta('property', 'og:image');
      removeMeta('name', 'twitter:image');
      upsertMeta('name', 'robots', 'index, follow');
      document.getElementById(scriptId)?.remove();
    };
  }, [
    title,
    description,
    canonicalPath,
    ogType,
    ogImage,
    ogImageAlt,
    twitterCard,
    locale,
    articleMeta,
    titleExact,
    noIndex,
    jsonLd,
  ]);

  return null;
}
