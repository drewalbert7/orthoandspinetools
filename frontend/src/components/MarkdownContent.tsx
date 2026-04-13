import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

export function safeMarkdownHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const t = href.trim();
  if (/^javascript:/i.test(t) || /^data:/i.test(t) || /^vbscript:/i.test(t)) return undefined;
  if (t.startsWith('//')) return `https:${t}`;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith('/') || t.startsWith('#')) return t;
  if (/^mailto:/i.test(t)) return t;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return t;
  return undefined;
}

const markdownComponents: Components = {
  a({ href, children, ...props }) {
    const safe = safeMarkdownHref(href);
    if (!safe) {
      return <span className="text-gray-800 [overflow-wrap:anywhere] break-words">{children}</span>;
    }
    const external = /^https?:\/\//i.test(safe) || safe.startsWith('//');
    return (
      <a
        href={safe}
        className="text-blue-600 hover:text-blue-800 underline decoration-blue-600/30 hover:decoration-blue-800 underline-offset-2 [overflow-wrap:anywhere] break-words"
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        {...props}
      >
        {children}
      </a>
    );
  },
  img({ src, alt, ...props }) {
    const safe = safeMarkdownHref(src);
    if (!safe) return null;
    return (
      <img
        src={safe}
        alt={alt ?? ''}
        className="my-2 max-h-64 max-w-full rounded-md object-contain"
        loading="lazy"
        {...props}
      />
    );
  },
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code({ className, children, ...props }) {
    return (
      <code
        className={`rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.9em] text-gray-800 ${className ?? ''}`}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-md bg-gray-100 p-3 font-mono text-sm text-gray-800 last:mb-0 [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-sm [&>code]:text-inherit">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-4 border-gray-200 pl-3 text-gray-600 italic last:mb-0">{children}</blockquote>
  ),
  h1: ({ children }) => <h1 className="mb-2 text-xl font-bold last:mb-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 text-lg font-bold last:mb-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 text-base font-semibold last:mb-0">{children}</h3>,
};

const LINE_CLAMP_OVERFLOW: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: 'max-h-[2lh] overflow-hidden',
  3: 'max-h-[3lh] overflow-hidden',
  4: 'max-h-[4lh] overflow-hidden',
  5: 'max-h-[5lh] overflow-hidden',
  6: 'max-h-[6lh] overflow-hidden',
};

export type MarkdownContentProps = {
  children: string;
  className?: string;
  lineClamp?: 2 | 3 | 4 | 5 | 6;
};

const MarkdownContent: React.FC<MarkdownContentProps> = ({ children, className = '', lineClamp }) => {
  const clampClass = lineClamp != null ? LINE_CLAMP_OVERFLOW[lineClamp] : '';

  return (
    <div
      className={`markdown-content w-full min-w-0 leading-relaxed ${clampClass} ${className}`.trim()}
    >
      <ReactMarkdown components={markdownComponents}>{children}</ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;
