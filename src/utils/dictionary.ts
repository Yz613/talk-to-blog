import { WordReplacement } from '../types';

/**
 * Deterministically replaces misheard words or phrases according to user-defined rules.
 * Supports multi-word phrases and word-boundary matching. Case-insensitive search,
 * exact replacement casing.
 */
export function applyWordReplacements(text: string, replacements?: WordReplacement[]): string {
  if (!text || !replacements || replacements.length === 0) return text;

  let result = text;
  for (const rep of replacements) {
    const from = (rep.from || '').trim();
    const to = (rep.to || '').trim();
    if (!from || !to) continue;

    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped.replace(/\s+/g, '\\s+');
    const hasWordStart = /^\w/.test(from);
    const hasWordEnd = /\w$/.test(from);

    const regex = new RegExp(`${hasWordStart ? '\\b' : ''}${pattern}${hasWordEnd ? '\\b' : ''}`, 'gi');
    result = result.replace(regex, to);
  }
  return result;
}

/**
 * Ensures words in the user's custom vocabulary retain their exact casing
 * (e.g., lowercase "panoptyc" -> "Panoptyc", "nextjs" -> "Next.js").
 */
export function applyCustomVocabularyCasing(text: string, vocab?: string[]): string {
  if (!text || !vocab || vocab.length === 0) return text;

  let result = text;
  for (const word of vocab) {
    const trimmed = (word || '').trim();
    if (!trimmed) continue;

    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped.replace(/\s+/g, '\\s+');
    const hasWordStart = /^\w/.test(trimmed);
    const hasWordEnd = /\w$/.test(trimmed);

    const regex = new RegExp(`${hasWordStart ? '\\b' : ''}${pattern}${hasWordEnd ? '\\b' : ''}`, 'gi');
    result = result.replace(regex, trimmed);
  }
  return result;
}

/**
 * Applies both word replacements and custom vocabulary casing to text.
 */
export function formatWithPersonalDictionary(
  text: string,
  replacements?: WordReplacement[],
  vocab?: string[]
): string {
  if (!text) return text;
  let formatted = applyWordReplacements(text, replacements);
  formatted = applyCustomVocabularyCasing(formatted, vocab);
  return formatted;
}
