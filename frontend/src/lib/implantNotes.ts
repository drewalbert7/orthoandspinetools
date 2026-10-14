/** Placeholder IFU boilerplate used in early seeds — treat as empty for UI. */
const IFU_PLACEHOLDER =
  /^see current manufacturer labeling\s*\/\s*ifu/i;

export function isMeaningfulDirectoryNote(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 12) return false;
  if (IFU_PLACEHOLDER.test(t)) return false;
  return true;
}
