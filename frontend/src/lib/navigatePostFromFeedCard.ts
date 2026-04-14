import type { MouseEvent } from 'react';
import type { NavigateFunction } from 'react-router-dom';

const INTERACTIVE_SELECTOR =
  'a, button, [role="button"], input, textarea, select, label, summary, video, audio, iframe, [contenteditable="true"]';

export function navigateToPostFromFeedCardBackground(
  e: MouseEvent<Element>,
  navigate: NavigateFunction,
  postId: string
): void {
  if (!(e.target instanceof Element)) return;
  if (e.defaultPrevented) return;
  if (e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (e.target.closest(INTERACTIVE_SELECTOR)) return;
  navigate(`/post/${postId}`);
}
