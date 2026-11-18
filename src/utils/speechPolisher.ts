/**
 * Formats spoken enumerations into markdown lists:
 * - Spoken numbers/steps: "number one ... number two ..." or "step 1 ... step 2 ..."
 * - Spoken ordinals: "First(ly), ... Second(ly), ... Third(ly), ..."
 * - Colon lead-ins: "Tasks to do: A, B, and C"
 * - Spoken bullets: "bullet: ...", "bullet point: ..."
 */
export function formatListsLocally(text: string): string {
  if (!text || !text.trim()) return text;

  // 1. Spoken numbers: "number one: ... number two: ..." or "step 1: ... step 2: ..."
  const numWords = '(?:one|two|three|four|five|six|seven|eight|nine|ten|\\d+)';
  const numRegex = new RegExp(`(?:^|[.!?\\n]\\s*)(?:number\\s+${numWords}|step\\s+${numWords})[,\\s:]+`, 'gi');
  const numMatches = [...text.matchAll(numRegex)];
  if (numMatches.length >= 2) {
    const preamble = text.slice(0, numMatches[0].index).trim();
    const items: string[] = [];
    for (let i = 0; i < numMatches.length; i++) {
      const start = (numMatches[i].index ?? 0) + numMatches[i][0].length;
      const end = i < numMatches.length - 1 ? (numMatches[i + 1].index ?? text.length) : text.length;
      let item = text.slice(start, end).trim().replace(/[.,;]+$/, '');
      if (item) items.push(item.charAt(0).toUpperCase() + item.slice(1));
    }
    const listLines = items.map((it, idx) => `${idx + 1}. ${it}`).join('\n');
    return preamble ? `${preamble}\n\n${listLines}` : listLines;
  }

  // 2. Ordinals: "First(ly)( of all)?, ... Second(ly)?, ... Third(ly)?..."
  const hasFirst = /\b(?:first(?: of all)?|firstly)\b/i.test(text);
  const hasSecond = /\b(?:second|secondly)\b/i.test(text);
  if (hasFirst && hasSecond) {
    const ordRegex = /(?:^|[.!?\n]\s*)(?:first(?: of all)?|firstly|second|secondly|third|thirdly|fourth|fourthly|fifth|fifthly|finally|lastly)[,\s:]+/gi;
    const ordMatches = [...text.matchAll(ordRegex)];
    if (ordMatches.length >= 2) {
      const preamble = text.slice(0, ordMatches[0].index).trim();
      const items: string[] = [];
      for (let i = 0; i < ordMatches.length; i++) {
        const start = (ordMatches[i].index ?? 0) + ordMatches[i][0].length;
        const end = i < ordMatches.length - 1 ? (ordMatches[i + 1].index ?? text.length) : text.length;
        let item = text.slice(start, end).trim().replace(/[.,;]+$/, '');
        if (item) items.push(item.charAt(0).toUpperCase() + item.slice(1));
      }
      const listLines = items.map((it, idx) => `${idx + 1}. ${it}`).join('\n');
      return preamble ? `${preamble}\n\n${listLines}` : listLines;
    }
  }

  // 3. Colon list lead-ins: "Tasks to do: A, B, and C" / "Do the following: X, Y, and Z"
  const colonMatch = text.match(/^(.*?(?:list|following|things to do|tasks to do|tasks|todo|to-do|checklist|we need to))(?:\s+(?:of|with))?\s*:\s*(.+)$/i);
  if (colonMatch) {
    const preamble = colonMatch[1].trim() + ':';
    const rest = colonMatch[2].trim();
    const rawItems = rest
      .split(/(?:,\s*(?:and\s+)?|\s+and\s+)/i)
      .map((s) => s.trim().replace(/[.,;]+$/, ''))
      .filter(Boolean);
    if (rawItems.length >= 2) {
      const listLines = rawItems.map((item) => `- ${item.charAt(0).toUpperCase() + item.slice(1)}`).join('\n');
      return `${preamble}\n\n${listLines}`;
    }
  }

  // 4. Ensure bullet items are properly capitalized
  if (text.includes('\n- ') || text.startsWith('- ')) {
    text = text.replace(/(^|\n)(-\s+)([a-z])/g, (_m, p1, p2, l) => p1 + p2 + l.toUpperCase());
  }

  return text;
}

/**
 * Fast, deterministic on-device speech cleanup and polisher:
 * - Strips filler words (um, uh, uhh, er, ah, hmm, you know, etc.)
 * - Strips immediate stutters & clipped speech false starts ("the the" -> "the", "twin- the-" -> "the")
 * - Preserves compound words like "on-device", "real-time", "fast-paced"
 * - Automatically formats spoken enumerations and list sequences into markdown lists
 * - Cleans commas, pauses, spaces, and punctuation artifacts
 * - Ensures proper capitalization after sentence boundaries
 */
export function cleanSpeechLocally(text: string): string {
  if (!text || !text.trim()) return text;

  let cleaned = text;

  // 1. Spoken bullet points & dashes: "bullet: ...", "bullet point: ...", "dash: ..."
  cleaned = cleaned.replace(/(?:^|[.!?\n]\s*)(?:bullet(?:\s+point)?|dash)\s*[,:\-]?\s+/gi, '\n- ');

  // 2. Remove standalone hesitation / filler words: um, uh, uhh, er, ah, hmm
  cleaned = cleaned.replace(/\b(um|uh|uhh|ummm|er|err|ah|ahh|hmm|hm)\b[,\s]*/gi, '');

  // 3. Remove filler "you know" when used parenthetically or as a hesitation pause
  cleaned = cleaned.replace(/(?<!\b(?:as|do|did|if|don't|does|let|should|to)\s+)\b,\s*you know\b,?\s*/gi, ' ');
  cleaned = cleaned.replace(/(?<!\b(?:as|do|did|if|don't|does|let|should|to)\s+)\byou know,\s*/gi, '');

  // 4. Remove parenthetical filler "I mean"
  cleaned = cleaned.replace(/(^|[.,!?\n]\s*|,\s*)\bI mean\b,?\s*/gi, '$1');

  // 5. Remove filler "like" when isolated by pauses/commas (e.g. ", like," or "it was, like, 5")
  cleaned = cleaned.replace(/,\s*like\b,?\s*/gi, ', ');
  cleaned = cleaned.replace(/\s+like,\s*/gi, ' ');

  // 6. Clipped false-start words with trailing hyphens (e.g., "twin- the- the")
  // Using lookahead \s+ ensures compound words like "on-device" or "real-time" are NOT stripped.
  cleaned = cleaned.replace(/\b\w+-(?=\s+)/g, '');

  // 7. Remove immediate duplicate words (stutters): "the the" -> "the", "it it" -> "it"
  cleaned = cleaned.replace(/\b([a-zA-Z]+)\s+\1\b/gi, '$1');
  cleaned = cleaned.replace(/\b([a-zA-Z]+),\s+\1\b/gi, '$1');

  // 8. Remove immediate 2-word phrase stutters: "it will, it will" -> "it will"
  cleaned = cleaned.replace(/\b([a-zA-Z]+\s+[a-zA-Z]+)[,\s]+\1\b/gi, '$1');

  // 9. Clean up awkward spaces and punctuation artifacts
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.replace(/\s+([.,!?;:])/g, '$1');
  cleaned = cleaned.replace(/,\s*,/g, ',');
  cleaned = cleaned.replace(/,\s*\./g, '.');
  cleaned = cleaned.replace(/^[,.\s]+/, '');
  cleaned = cleaned.replace(/[,;\s]+$/, '');

  // 10. Ensure capitalization after sentence boundaries (. ! ?) and newlines
  cleaned = cleaned.replace(/(^|[.!?\n]\s+)([a-z])/g, (_m, prefix, letter) => prefix + letter.toUpperCase());

  // 11. Format lists (ordinals, numbers, colon lead-ins, spoken bullets)
  cleaned = formatListsLocally(cleaned);

  // 12. Final capitalization pass for the entire text
  if (cleaned.length > 0 && !cleaned.startsWith('-') && !cleaned.match(/^\d+\./)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned.trim();
}
