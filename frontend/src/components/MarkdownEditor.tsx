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

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(({
  value,
  onChange,
  placeholder = '',
  rows = 12,
  className = '',
  onKeyDown,
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);

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

  // Get text content from HTML (for cursor position)
  const getTextFromHtml = (html: string): string => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

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
    setCursorPos(Math.min(preRange.toString().length, text.length));
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
            return `**${children}**`;
          case 'em':
          case 'i':
            return `*${children}*`;
          case 's':
          case 'strike':
          case 'del':
            return `~~${children}~~`;
          case 'code':
            return `\`${children}\``;
          case 'pre':
            const codeContent = el.querySelector('code')?.textContent || children;
            return `\`\`\`\n${codeContent}\n\`\`\``;
          case 'blockquote':
            return children.split('\n').filter(l => l.trim()).map(line => `> ${line.trim()}`).join('\n');
          case 'a':
            const href = el.getAttribute('href') || '';
            return `[${children}](${href})`;
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
            return `^${children}^`;
          default:
            return children;
        }
      }
      
      return '';
    };
    
    try {
      let markdown = walk(tempDiv).trim();
      // Clean up extra newlines
      markdown = markdown.replace(/\n{3,}/g, '\n\n');
      return markdown;
    } catch {
      // Fallback to plain text
      return getTextFromHtml(html);
    }
  }, [getTextFromHtml]);

  // Handle input - convert HTML back to markdown
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    if (isUpdating) return;
    
    const html = e.currentTarget.innerHTML;
    const markdown = htmlToMarkdown(html);
    saveCursor();
    
    // Only update if markdown actually changed
    if (markdown !== value) {
      onChange(markdown);
    }
  }, [isUpdating, onChange, saveCursor, value, htmlToMarkdown]);

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

  // Insert markdown at cursor position
  const insertMarkdown = useCallback((before: string, after: string, placeholder: string) => {
    if (!editorRef.current || isUpdating) return;
    
    editorRef.current.focus();
    const selection = window.getSelection();
    
    // Get current text content to find cursor position
    const currentText = getTextFromHtml(editorRef.current.innerHTML);
    let insertPos = currentText.length;
    
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const preRange = range.cloneRange();
      preRange.selectNodeContents(editorRef.current);
      preRange.setEnd(range.endContainer, range.endOffset);
      insertPos = preRange.toString().length;
    }
    
    // Get selected text
    const selectedText = selection?.toString() || '';
    const textToInsert = selectedText || placeholder;
    
    // Insert markdown syntax at position
    const newMarkdown = 
      value.substring(0, insertPos - selectedText.length) + 
      before + textToInsert + after + 
      value.substring(insertPos);
    
    onChange(newMarkdown);
    
    // Focus will be restored after HTML update
  }, [value, onChange, isUpdating, getTextFromHtml]);

  // Expose insertMarkdown via ref
  useImperativeHandle(ref, () => ({
    insertMarkdown,
  }), [insertMarkdown]);

  // Update HTML when markdown changes externally (from formatting buttons)
  useEffect(() => {
    if (!editorRef.current || isUpdating) return;
    
    // Get current rendered markdown
    const currentRendered = markdownToHtml(value || '');
    const currentHtml = editorRef.current.innerHTML;
    
    // Only update if markdown actually changed
    // Compare by checking if the rendered HTML would be different
    if (currentHtml !== currentRendered && currentRendered !== '') {
      setIsUpdating(true);
      const wasFocused = document.activeElement === editorRef.current;
      const savedPos = cursorPos;
      
      editorRef.current.innerHTML = currentRendered || '<br>';
      
      if (wasFocused) {
        editorRef.current.focus();
        // Try to restore cursor, but if it fails, place at end
        setTimeout(() => {
          restoreCursor(savedPos);
          setIsUpdating(false);
        }, 0);
      } else {
        setIsUpdating(false);
      }
    }
  }, [value, markdownToHtml, cursorPos, restoreCursor, isUpdating]);

  return (
    <>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={onKeyDown}
        onBlur={saveCursor}
        className={`${className} px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
        style={{
          minHeight: `${rows * 1.5}rem`,
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
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

