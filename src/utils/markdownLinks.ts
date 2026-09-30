/** Accept only web links, and encode characters that would break Markdown. */
export function safeWebUrl(value: unknown): string | null {
  if (typeof value !== 'string' || /[\s<>"'\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href.replace(/\(/g, '%28').replace(/\)/g, '%29');
  } catch {
    return null;
  }
}

export interface InlineToken {
  type: 'text' | 'code' | 'link';
  raw: string;
  text: string;
  url?: string;
}

/** Read links before escaping HTML so query strings and code stay intact. */
export function tokenizeInline(value: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\') { i++; continue; }
    let token: InlineToken | undefined;
    let end = i;
    if (value[i] === '`') {
      const close = value.indexOf('`', i + 1);
      if (close >= 0) {
        end = close + 1;
        token = { type: 'code', raw: value.slice(i, end), text: value.slice(i + 1, close) };
      }
    } else if (value[i] === '[' && value[i - 1] !== '!') {
      const labelEnd = value.indexOf('](', i + 1);
      if (labelEnd >= 0 && !/[\[\]\n]/.test(value.slice(i + 1, labelEnd))) {
        let depth = 1;
        let cursor = labelEnd + 2;
        for (; cursor < value.length && depth; cursor++) {
          if (value[cursor] === '(') depth++;
          if (value[cursor] === ')') depth--;
        }
        if (depth === 0) {
          end = cursor;
          const destination = value.slice(labelEnd + 2, end - 1);
          const url = safeWebUrl(destination.startsWith('<') && destination.endsWith('>')
            ? destination.slice(1, -1) : destination);
          token = { type: 'link', raw: value.slice(i, end), text: value.slice(i + 1, labelEnd), url: url || undefined };
        }
      }
    }
    if (token) {
      if (i > start) tokens.push({ type: 'text', raw: value.slice(start, i), text: value.slice(start, i) });
      tokens.push(token);
      start = end;
      i = end - 1;
    }
  }
  if (start < value.length) tokens.push({ type: 'text', raw: value.slice(start), text: value.slice(start) });
  return tokens;
}
