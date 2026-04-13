/** Line-based markdown transforms for post body (used with rich editor DOM sync). */

function stripListOrQuotePrefix(line: string): string {
  return line
    .replace(/^> \s?/, '')
    .replace(/^[-*] \s?/, '')
    .replace(/^\d+\.\s+/, '')
    .trimStart();
}

export function toggleBulletMarkdown(md: string): string {
  const lines = md.split('\n');
  const hasContent = lines.some((l) => l.trim());
  const allBulleted =
    hasContent &&
    lines.every((line) => {
      const t = line.trim();
      if (!t) return true;
      return /^[-*]\s+/.test(t);
    });

  if (allBulleted) {
    return lines
      .map((line) => {
        const lead = line.match(/^\s*/)?.[0] ?? '';
        const rest = line.slice(lead.length);
        if (!rest.trim()) return line;
        const stripped = rest.replace(/^[-*]\s+/, '');
        return `${lead}${stripped}`;
      })
      .join('\n');
  }

  return lines
    .map((line) => {
      const lead = line.match(/^\s*/)?.[0] ?? '';
      const rest = line.slice(lead.length);
      if (!rest.trim()) return line;
      const body = stripListOrQuotePrefix(rest);
      return `${lead}- ${body}`;
    })
    .join('\n');
}

export function toggleNumberedMarkdown(md: string): string {
  const lines = md.split('\n');
  const hasContent = lines.some((l) => l.trim());
  const allNumbered =
    hasContent &&
    lines.every((line) => {
      const t = line.trim();
      if (!t) return true;
      return /^\d+\.\s+/.test(t);
    });

  if (allNumbered) {
    return lines
      .map((line) => {
        const lead = line.match(/^\s*/)?.[0] ?? '';
        const rest = line.slice(lead.length);
        if (!rest.trim()) return line;
        const stripped = rest.replace(/^\d+\.\s+/, '');
        return `${lead}${stripped}`;
      })
      .join('\n');
  }

  let n = 1;
  return lines
    .map((line) => {
      const lead = line.match(/^\s*/)?.[0] ?? '';
      const rest = line.slice(lead.length);
      if (!rest.trim()) return line;
      const body = stripListOrQuotePrefix(rest);
      return `${lead}${n++}. ${body}`;
    })
    .join('\n');
}

export function toggleQuoteMarkdown(md: string): string {
  const lines = md.split('\n');
  const hasContent = lines.some((l) => l.trim());
  const allQuoted =
    hasContent &&
    lines.every((line) => {
      const t = line.trim();
      if (!t) return true;
      return /^>\s?/.test(t);
    });

  if (allQuoted) {
    return lines
      .map((line) => {
        const lead = line.match(/^\s*/)?.[0] ?? '';
        const rest = line.slice(lead.length);
        if (!rest.trim()) return line;
        const stripped = rest.replace(/^>\s?/, '');
        return `${lead}${stripped}`;
      })
      .join('\n');
  }

  return lines
    .map((line) => {
      const lead = line.match(/^\s*/)?.[0] ?? '';
      const rest = line.slice(lead.length);
      if (!rest.trim()) return line;
      const body = stripListOrQuotePrefix(rest);
      return `${lead}> ${body}`;
    })
    .join('\n');
}
