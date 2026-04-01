import { useLayoutEffect } from 'react';
import { SEO_DEFAULTS, absoluteUrl } from '../lib/seo';

type DocumentMetaProps = {
  title?: string;
  description?: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
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

export function DocumentMeta({
  title,
  description,
  canonicalPath,
  ogType = 'website',
  ogImage,
  noIndex,
  jsonLd,
}: DocumentMetaProps) {
  useLayoutEffect(() => {
    const fullTitle = title ? `${title} | ${SEO_DEFAULTS.siteName}` : SEO_DEFAULTS.title;
    document.title = fullTitle;

    const desc = description || SEO_DEFAULTS.description;
    upsertMeta('name', 'description', desc);

    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:type', ogType);
    upsertMeta('property', 'og:site_name', SEO_DEFAULTS.siteName);
    const pageUrl = canonicalPath ? absoluteUrl(canonicalPath) : typeof window !== 'undefined' ? window.location.href.split('#')[0] : absoluteUrl('/');
    upsertMeta('property', 'og:url', pageUrl);
    if (ogImage) {
      upsertMeta('property', 'og:image', ogImage);
    } else {
      removeMeta('property', 'og:image');
    }

    upsertMeta('name', 'twitter:card', ogImage ? 'summary_large_image' : 'summary');
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
      document.title = SEO_DEFAULTS.title;
      upsertMeta('name', 'description', SEO_DEFAULTS.description);
      removeMeta('property', 'og:image');
      removeMeta('name', 'twitter:image');
      upsertMeta('name', 'robots', 'index, follow');
      document.getElementById(scriptId)?.remove();
    };
  }, [title, description, canonicalPath, ogType, ogImage, noIndex, jsonLd]);

  return null;
}
