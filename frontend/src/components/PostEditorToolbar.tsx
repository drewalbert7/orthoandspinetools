import React from 'react';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import {
  toggleBulletMarkdown,
  toggleNumberedMarkdown,
  toggleQuoteMarkdown,
} from '../lib/postBodyMarkdown';

const btnClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1';

const sepClass = 'mx-0.5 h-6 w-px shrink-0 bg-gray-200 self-center';

function resolveMarkdown(
  isPlainMarkdown: boolean,
  plainBody: string,
  getEditor: () => MarkdownEditorHandle | null
): string {
  if (isPlainMarkdown) return plainBody;
  return getEditor()?.getMarkdownFromDom() ?? plainBody;
}

function insertPlainAtCursor(
  body: string,
  setBody: (s: string) => void,
  ta: HTMLTextAreaElement,
  insert: string,
  absoluteCursorPos?: number
) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const next = body.slice(0, start) + insert + body.slice(end);
  setBody(next);
  const pos = absoluteCursorPos != null ? absoluteCursorPos : start + insert.length;
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(pos, pos);
  });
}

function wrapPlainSelection(
  body: string,
  setBody: (s: string) => void,
  ta: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder: string
) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const sel = body.substring(start, end) || placeholder;
  const wrapped = before + sel + after;
  setBody(body.slice(0, start) + wrapped + body.slice(end));
  const caret = start + before.length + sel.length;
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(caret, caret);
  });
}

export interface PostEditorToolbarProps {
  isPlainMarkdown: boolean;
  body: string;
  setBody: (value: string) => void;
  getEditor: () => MarkdownEditorHandle | null;
  bodyTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onTogglePlainMarkdown: () => void;
  /** Omit image embed (captions / media handled elsewhere). */
  compact?: boolean;
}

const PostEditorToolbar: React.FC<PostEditorToolbarProps> = ({
  isPlainMarkdown,
  body,
  setBody,
  getEditor,
  bodyTextareaRef,
  onTogglePlainMarkdown,
  compact = false,
}) => {
  const applyTransform = (fn: (md: string) => string) => {
    const md = resolveMarkdown(isPlainMarkdown, body, getEditor);
    setBody(fn(md));
  };

  const withTextarea = (fn: (ta: HTMLTextAreaElement) => void) => {
    const ta = bodyTextareaRef.current;
    if (ta) fn(ta);
  };

  const onBold = () => {
    if (isPlainMarkdown) {
      withTextarea((ta) => wrapPlainSelection(body, setBody, ta, '**', '**', 'bold text'));
      return;
    }
    getEditor()?.toggleInlineFormat('bold');
  };
  const onItalic = () => {
    if (isPlainMarkdown) {
      withTextarea((ta) => wrapPlainSelection(body, setBody, ta, '*', '*', 'italic text'));
      return;
    }
    getEditor()?.toggleInlineFormat('italic');
  };
  const onStrike = () => {
    if (isPlainMarkdown) {
      withTextarea((ta) => wrapPlainSelection(body, setBody, ta, '~~', '~~', 'text'));
      return;
    }
    getEditor()?.toggleInlineFormat('strike');
  };
  const onSup = () => {
    if (isPlainMarkdown) {
      withTextarea((ta) => wrapPlainSelection(body, setBody, ta, '^', '^', 'sup'));
      return;
    }
    getEditor()?.toggleInlineFormat('superscript');
  };
  const onInlineCode = () => {
    if (isPlainMarkdown) {
      withTextarea((ta) => wrapPlainSelection(body, setBody, ta, '`', '`', 'code'));
      return;
    }
    getEditor()?.toggleInlineFormat('code');
  };
  const onCodeBlock = () => {
    if (isPlainMarkdown) {
      withTextarea((ta) => {
        const start = ta.selectionStart;
        insertPlainAtCursor(body, setBody, ta, '\n```\n\n```\n', start + 5);
      });
      return;
    }
    getEditor()?.insertMarkdown('```\n', '\n```', 'paste code here');
  };

  const onLink = () => {
    const raw = window.prompt('Link URL (https://…)', 'https://');
    if (raw == null) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        window.alert('Please use an http or https URL.');
        return;
      }
      const href = u.toString();
      if (isPlainMarkdown) {
        withTextarea((ta) => {
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const sel = body.substring(start, end) || 'link text';
          const insert = `[${sel}](${href})`;
          setBody(body.slice(0, start) + insert + body.slice(end));
          requestAnimationFrame(() => {
            ta.focus();
            const pos = start + insert.length;
            ta.setSelectionRange(pos, pos);
          });
        });
        return;
      }
      getEditor()?.insertLink(href);
    } catch {
      window.alert('Enter a valid URL.');
    }
  };

  const onBullet = () => applyTransform(toggleBulletMarkdown);
  const onNumbered = () => applyTransform(toggleNumberedMarkdown);
  const onQuote = () => applyTransform(toggleQuoteMarkdown);

  const onEmbedImage = () => {
    if (isPlainMarkdown) {
      withTextarea((ta) =>
        wrapPlainSelection(body, setBody, ta, '![', '](https://)', 'description')
      );
      return;
    }
    getEditor()?.insertMarkdown('![', '](https://)', 'description');
  };

  return (
    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div
        className="flex flex-wrap items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50/90 px-1 py-1 shadow-sm"
        role="toolbar"
        aria-label="Formatting"
      >
        <button type="button" className={btnClass} aria-label="Bold" title="Bold (Ctrl+B)" onMouseDown={(e) => e.preventDefault()} onClick={onBold}>
          <span className="font-sans text-sm font-bold">B</span>
        </button>
        <button type="button" className={btnClass} aria-label="Italic" title="Italic (Ctrl+I)" onMouseDown={(e) => e.preventDefault()} onClick={onItalic}>
          <span className="font-serif text-sm italic">I</span>
        </button>
        <button type="button" className={btnClass} aria-label="Strikethrough" title="Strikethrough" onMouseDown={(e) => e.preventDefault()} onClick={onStrike}>
          <span className="text-sm line-through decoration-2">S</span>
        </button>
        <span className={sepClass} aria-hidden />
        <button type="button" className={btnClass} aria-label="Superscript" title="Superscript" onMouseDown={(e) => e.preventDefault()} onClick={onSup}>
          <span className="text-xs font-semibold">x²</span>
        </button>
        <button type="button" className={btnClass} aria-label="Inline code" title="Inline code" onMouseDown={(e) => e.preventDefault()} onClick={onInlineCode}>
          <span className="font-mono text-xs text-gray-800">&lt;/&gt;</span>
        </button>
        <button type="button" className={btnClass} aria-label="Code block" title="Code block" onMouseDown={(e) => e.preventDefault()} onClick={onCodeBlock}>
          <span className="font-mono text-[10px] font-semibold leading-none text-gray-800">{'{ }'}</span>
        </button>
        <span className={sepClass} aria-hidden />
        <button type="button" className={btnClass} aria-label="Link" title="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={onLink}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </button>
        {!compact && (
          <button
            type="button"
            className={btnClass}
            aria-label="Image Markdown"
            title="Insert image Markdown — prefer media upload when available"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onEmbedImage}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </button>
        )}
        <span className={sepClass} aria-hidden />
        <button type="button" className={btnClass} aria-label="Bullet list" title="Bullet list" onMouseDown={(e) => e.preventDefault()} onClick={onBullet}>
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
          </svg>
        </button>
        <button type="button" className={btnClass} aria-label="Numbered list" title="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={onNumbered}>
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
          </svg>
        </button>
        <button type="button" className={btnClass} aria-label="Quote" title="Block quote" onMouseDown={(e) => e.preventDefault()} onClick={onQuote}>
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
          </svg>
        </button>
      </div>
      <button
        type="button"
        onClick={onTogglePlainMarkdown}
        className="shrink-0 text-left text-xs font-medium text-blue-700 hover:text-blue-900 sm:text-sm"
      >
        {isPlainMarkdown ? 'Visual editor' : 'Plain Markdown'}
      </button>
    </div>
  );
};

export default PostEditorToolbar;
