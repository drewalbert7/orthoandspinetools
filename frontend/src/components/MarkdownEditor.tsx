import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { marked } from 'marked';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export interface MarkdownEditorHandle {
  insertMarkdown: (before: string, after: string, placeholder: string) => void;
}

function getPlainTextFromHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

/** True when there is no real user text (ignores empty s/del/strong wrappers and ZWSP). Preserves non-text media if ever present. */
function isWhitespaceOnly(s: string): boolean {
  return !s.replace(/[\s\u00a0\u200b\ufeff]/g, '').length;
}

function isEffectivelyEmptyContent(html: string): boolean {
  if (!html || html === '<br>' || html === '<div><br></div>' || html === '<p><br></p>') return true;
  const div = document.createElement('div');
  div.innerHTML = html;
  if (div.querySelector('img,video,iframe')) return false;
  const text = (div.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/\ufeff/g, '')
    .trim();
  return text.length === 0;
}

function normalizeMarkdownForCompare(s: string): string {
  return (s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(?:~~\s*~~)+/g, '')
    .trimEnd();
}

/** Compare stored markdown to what the editor DOM currently represents (avoids fighting the browser on every keystroke). */
function markdownMatchesDom(html: string, markdown: string, toMd: (h: string) => string): boolean {
  let derived: string;
  try {
    derived = toMd(html);
  } catch {
    derived = getPlainTextFromHtml(html);
  }
  const a = normalizeMarkdownForCompare(derived);
  const b = normalizeMarkdownForCompare(markdown);
  return a === b;
}

/** Remove empty inline format wrappers the browser often leaves after deleting text (esp. strikethrough). */
function removeEmptyInlineFormatElements(root: HTMLElement): void {
  const selector = 's, strike, del, strong, b, em, i, sup';
  let removed = true;
  while (removed) {
    removed = false;
    const list = Array.from(root.querySelectorAll(selector));
    for (const el of list) {
      if (!root.contains(el)) continue;
      if (el.closest('pre')) continue;
      const raw = el.textContent ?? '';
      if (!isWhitespaceOnly(raw)) continue;
      el.parentNode?.removeChild(el);
      removed = true;
    }
  }
}

function fixCaretIfOrphaned(root: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const r = sel.getRangeAt(0);
  if (root.contains(r.commonAncestorContainer)) return;
  const nr = document.createRange();
  nr.selectNodeContents(root);
  nr.collapse(false);
  sel.removeAllRanges();
  sel.addRange(nr);
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(({
  value,
  onChange,
  placeholder = '',
  rows = 12,
  className = '',
  onKeyDown,
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const cursorPosRef = useRef(0);

  // Configure marked
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // Simple markdown to HTML
  const markdownToHtml = useCallback((markdown: string): string => {
    if (!markdown) return '';
    try {
      return marked.parse(markdown) as string;
    } catch {
      return markdown.replace(/\n/g, '<br>');
    }
  }, []);

  const getTextFromHtml = getPlainTextFromHtml;

  // Save cursor position
  const saveCursor = useCallback(() => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(editorRef.current);
    preRange.setEnd(range.endContainer, range.endOffset);

    const text = getTextFromHtml(editorRef.current.innerHTML);
    cursorPosRef.current = Math.min(preRange.toString().length, text.length);
  }, []);

  // Restore cursor
  const restoreCursor = useCallback((pos: number) => {
    if (!editorRef.current || isUpdating) return;
    
    requestAnimationFrame(() => {
      if (!editorRef.current) return;
      
      const text = getTextFromHtml(editorRef.current.innerHTML);
      const targetPos = Math.min(pos, text.length);
      
      const walker = document.createTreeWalker(
        editorRef.current,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let currentPos = 0;
      let targetNode: Node | null = null;
      let targetOffset = 0;
      
      let node;
      while ((node = walker.nextNode())) {
        const nodeLength = node.textContent?.length || 0;
        if (currentPos + nodeLength >= targetPos) {
          targetNode = node;
          targetOffset = targetPos - currentPos;
          break;
        }
        currentPos += nodeLength;
      }
      
      if (targetNode) {
        const range = document.createRange();
        const selection = window.getSelection();
        try {
          range.setStart(targetNode, targetOffset);
          range.setEnd(targetNode, targetOffset);
          selection?.removeAllRanges();
          selection?.addRange(range);
        } catch (e) {
          // Fallback: place at end
          editorRef.current.focus();
        }
      }
    });
  }, [isUpdating]);


  // Convert HTML back to markdown (preserve formatting)
  const htmlToMarkdown = useCallback((html: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }
      
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        const children = Array.from(node.childNodes).map(walk).join('');
        
        switch (tag) {
          case 'strong':
          case 'b':
            if (isWhitespaceOnly(children)) return '';
            return `**${children}**`;
          case 'em':
          case 'i':
            if (isWhitespaceOnly(children)) return '';
            return `*${children}*`;
          case 's':
          case 'strike':
          case 'del':
            if (isWhitespaceOnly(children)) return '';
            return `~~${children}~~`;
          case 'code':
            if (isWhitespaceOnly(children)) return '';
            return `\`${children}\``;
          case 'pre':
            const codeContent = el.querySelector('code')?.textContent || children;
            return `\`\`\`\n${codeContent}\n\`\`\``;
          case 'blockquote':
            return children.split('\n').filter(l => l.trim()).map(line => `> ${line.trim()}`).join('\n');
          case 'a':
            const href = el.getAttribute('href') || '';
            return `[${children}](${href})`;
          case 'img': {
            const src = el.getAttribute('src') || '';
            const alt = el.getAttribute('alt') || '';
            return `![${alt}](${src})`;
          }
          case 'br':
            return '\n';
          case 'p':
            return children ? `${children}\n\n` : '\n\n';
          case 'ul':
            return children;
          case 'ol':
            return children;
          case 'li':
            return `- ${children.trim()}\n`;
          case 'sup':
            if (isWhitespaceOnly(children)) return '';
            return `^${children}^`;
          default:
            return children;
        }
      }
      
      return '';
    };
    
    try {
      let markdown = walk(tempDiv).trim();
      markdown = markdown.replace(/(?:~~\s*~~)+/g, '');
      markdown = markdown.replace(/\n{3,}/g, '\n\n');
      return markdown.trim();
    } catch {
      // Fallback to plain text
      return getTextFromHtml(html);
    }
  }, [getTextFromHtml]);

  const normalizeEmptyEditorDom = useCallback((el: HTMLDivElement) => {
    if (el.innerHTML === '<br>') return;
    setIsUpdating(true);
    el.innerHTML = '<br>';
    setIsUpdating(false);
  }, []);

  // Handle input - convert HTML back to markdown
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    if (isUpdating || composingRef.current) return;

    const el = e.currentTarget;
    const html = el.innerHTML;

    if (isEffectivelyEmptyContent(html)) {
      normalizeEmptyEditorDom(el);
      saveCursor();
      if (value !== '') {
        onChange('');
      }
      return;
    }

    removeEmptyInlineFormatElements(el);
    fixCaretIfOrphaned(el);
    const markdown = htmlToMarkdown(el.innerHTML);
    saveCursor();

    if (markdown !== value) {
      onChange(markdown);
    }
  }, [isUpdating, onChange, saveCursor, value, htmlToMarkdown, normalizeEmptyEditorDom]);

  const flushFromDom = useCallback(() => {
    if (!editorRef.current || isUpdating) return;
    const el = editorRef.current;
    const html = el.innerHTML;

    if (isEffectivelyEmptyContent(html)) {
      normalizeEmptyEditorDom(el);
      saveCursor();
      if (value !== '') {
        onChange('');
      }
      return;
    }

    removeEmptyInlineFormatElements(el);
    fixCaretIfOrphaned(el);
    const markdown = htmlToMarkdown(el.innerHTML);
    saveCursor();
    if (markdown !== value) {
      onChange(markdown);
    }
  }, [isUpdating, onChange, saveCursor, value, htmlToMarkdown, normalizeEmptyEditorDom]);

  const flushAfterDelete = useCallback(() => {
    if (!editorRef.current || isUpdating || composingRef.current) return;
    const el = editorRef.current;
    if (isEffectivelyEmptyContent(el.innerHTML)) {
      normalizeEmptyEditorDom(el);
      saveCursor();
      if (value !== '') {
        onChange('');
      }
      return;
    }
    removeEmptyInlineFormatElements(el);
    fixCaretIfOrphaned(el);
    const markdown = htmlToMarkdown(el.innerHTML);
    saveCursor();
    if (markdown !== value) {
      onChange(markdown);
    }
  }, [isUpdating, onChange, saveCursor, value, htmlToMarkdown, normalizeEmptyEditorDom]);

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      requestAnimationFrame(flushAfterDelete);
    },
    [flushAfterDelete]
  );

  // Handle paste - get plain text
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const selection = window.getSelection();
    
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Update value
    if (editorRef.current) {
      const newText = getTextFromHtml(editorRef.current.innerHTML);
      onChange(newText);
    }
  }, [onChange]);

  const insertMarkdown = useCallback((before: string, after: string, placeholder: string) => {
    if (!editorRef.current || isUpdating) return;

    const root = editorRef.current;
    root.focus();
    let sel = window.getSelection();

    const ensureRangeInsideEditor = (): Range | null => {
      if (!sel || sel.rangeCount === 0) {
        const r = document.createRange();
        r.selectNodeContents(root);
        r.collapse(false);
        sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
        return sel?.rangeCount ? sel.getRangeAt(0) : null;
      }
      const r0 = sel.getRangeAt(0);
      if (!root.contains(r0.commonAncestorContainer)) {
        const r = document.createRange();
        r.selectNodeContents(root);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
        return sel.getRangeAt(0);
      }
      return r0;
    };

    const range = ensureRangeInsideEditor();
    if (!range) return;

    const selectedText = range.toString();
    const text = selectedText || placeholder;
    range.deleteContents();

    let node: Node;

    if (before === '**' && after === '**') {
      const el = document.createElement('strong');
      el.textContent = text;
      node = el;
    } else if (before === '~~' && after === '~~') {
      const el = document.createElement('s');
      el.textContent = text;
      node = el;
    } else if (before === '*' && after === '*') {
      const el = document.createElement('em');
      el.textContent = text;
      node = el;
    } else if (before === '^' && after === '^') {
      const el = document.createElement('sup');
      el.textContent = text;
      node = el;
    } else if (before === '`' && after === '`') {
      const el = document.createElement('code');
      el.textContent = text;
      node = el;
    } else if (before === '```\n' && after === '\n```') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = text;
      pre.appendChild(code);
      node = pre;
    } else if (before === '[' && after === '](url)') {
      const a = document.createElement('a');
      a.href = 'https://';
      a.textContent = text;
      a.rel = 'noopener noreferrer';
      node = a;
    } else if (before === '![' && (after === '](image-url)' || after === '](video-url)')) {
      const img = document.createElement('img');
      img.src = 'https://';
      img.alt = text;
      img.setAttribute('draggable', 'false');
      node = img;
    } else if (before === '- ' && after === '') {
      node = document.createTextNode(`- ${text}\n`);
    } else if (before === '1. ' && after === '') {
      node = document.createTextNode(`1. ${text}\n`);
    } else if (before === '> ' && after === '') {
      node = document.createTextNode(`> ${text}\n`);
    } else {
      node = document.createTextNode(`${before}${text}${after}`);
    }

    range.insertNode(node);

    const endRange = document.createRange();
    endRange.setStartAfter(node);
    endRange.collapse(true);
    sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(endRange);

    removeEmptyInlineFormatElements(root);
    const markdown = htmlToMarkdown(root.innerHTML);
    onChange(markdown);
  }, [isUpdating, onChange, htmlToMarkdown]);

  // Expose insertMarkdown via ref
  useImperativeHandle(ref, () => ({
    insertMarkdown,
  }), [insertMarkdown]);

  // Update HTML when markdown changes externally (formatting buttons / programmatic).
  // Do NOT reset the DOM when the editor already represents the same markdown — that breaks typing (esp. mobile).
  useEffect(() => {
    if (!editorRef.current || isUpdating || composingRef.current) return;

    const currentHtml = editorRef.current.innerHTML;
    const v = value || '';

    // Visually empty but stale wrappers (e.g. <s><br></s>) — sync to empty markdown + clean DOM
    if (isEffectivelyEmptyContent(currentHtml) && v.trim() === '') {
      if (currentHtml !== '<br>') {
        setIsUpdating(true);
        editorRef.current.innerHTML = '<br>';
        setIsUpdating(false);
      }
      return;
    }

    if (markdownMatchesDom(currentHtml, v, htmlToMarkdown)) {
      return;
    }

    const currentRendered = markdownToHtml(v);

    // Clear editor when value cleared from outside
    if (!v.trim()) {
      setIsUpdating(true);
      editorRef.current.innerHTML = '<br>';
      setIsUpdating(false);
      return;
    }

    if (!currentRendered.trim()) return;

    setIsUpdating(true);
    const wasFocused = document.activeElement === editorRef.current;
    const savedPos = cursorPosRef.current;

    editorRef.current.innerHTML = currentRendered;

    if (wasFocused) {
      editorRef.current.focus();
      setTimeout(() => {
        restoreCursor(savedPos);
        setIsUpdating(false);
      }, 0);
    } else {
      setIsUpdating(false);
    }
  }, [value, markdownToHtml, restoreCursor, isUpdating, htmlToMarkdown]);

  return (
    <>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          onKeyDown?.(e);
        }}
        onKeyUp={handleKeyUp}
        onBlur={saveCursor}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          flushFromDom();
        }}
        className={`${className} px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
        style={{
          minHeight: `${rows * 1.5}rem`,
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          WebkitUserSelect: 'text',
          userSelect: 'text',
          touchAction: 'manipulation',
        }}
        data-placeholder={!value ? placeholder : ''}
      />
      <style>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        [contenteditable] strong, [contenteditable] b {
          font-weight: 700;
        }
        [contenteditable] em, [contenteditable] i {
          font-style: italic;
        }
        [contenteditable] s, [contenteditable] strike, [contenteditable] del {
          text-decoration: line-through;
          text-decoration-thickness: max(1px, 0.07em);
          text-decoration-skip-ink: none;
          color: inherit;
          background: transparent;
          opacity: 0.95;
        }
        [contenteditable] code {
          background-color: #f3f4f6;
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-family: 'Courier New', monospace;
          font-size: 0.875em;
        }
        [contenteditable] pre {
          background-color: #f3f4f6;
          padding: 0.75rem;
          border-radius: 0.25rem;
          overflow-x: auto;
          margin: 0.5rem 0;
        }
        [contenteditable] pre code {
          background-color: transparent;
          padding: 0;
        }
        [contenteditable] blockquote {
          border-left: 4px solid #e5e7eb;
          padding-left: 1rem;
          margin: 0.5rem 0;
          color: #6b7280;
          font-style: italic;
        }
        [contenteditable] a {
          color: #2563eb;
          text-decoration: underline;
        }
        [contenteditable] ul, [contenteditable] ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        [contenteditable] li {
          margin: 0.25rem 0;
        }
        [contenteditable] sup {
          vertical-align: super;
          font-size: 0.75em;
        }
      `}</style>
    </>
  );
});

MarkdownEditor.displayName = 'MarkdownEditor';

export default MarkdownEditor;

