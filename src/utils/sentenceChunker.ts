export interface TextChunk {
  chunkIndex: number;
  totalChunks: number;
  rawSpoken: string;
  sentences: string[];
}

export interface DiffToken {
  type: 'same' | 'added' | 'removed';
  word: string;
}

/**
 * Splits input text into discrete sentences while safely preserving abbreviations,
 * honorifics (Mr., Dr., etc.), decimals, bullet points, and dialog quotes.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return [];
  const clean = text.trim();

  // Protect common abbreviations and honorifics
  const abbrevProtected = clean.replace(
    /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\./gi,
    '$1__DOT__'
  );

  // Split on paragraph boundaries first
  const paragraphs = abbrevProtected.split(/\n\s*\n/);
  const sentences: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Split on sentence boundary (. ! ? followed by whitespace and capital letter or end of string)
    const rawParts = trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9"'“‘]|$)/);
    for (const part of rawParts) {
      const restored = part.replace(/__DOT__/g, '.').trim();
      if (restored) {
        sentences.push(restored);
      }
    }
  }

  // Fallback if no sentence punctuation exists (e.g. stream of consciousness voice transcript)
  if (sentences.length <= 1 && clean.length > 90) {
    const commaParts = clean.split(/(?<=[,;])\s+(?=[a-zA-Z0-9])/);
    if (commaParts.length >= 2) {
      return commaParts.map((s) => s.trim()).filter(Boolean);
    }
    const words = clean.split(/\s+/);
    if (words.length > 20) {
      const synthetic: string[] = [];
      const wordsPerChunk = 14;
      for (let i = 0; i < words.length; i += wordsPerChunk) {
        synthetic.push(words.slice(i, i + wordsPerChunk).join(' '));
      }
      return synthetic;
    }
  }

  return sentences.length > 0 ? sentences : [clean];
}

/**
 * Groups sentences into digestible chunks (defaults to 3 sentences at a time).
 */
export function chunkTextBySentences(text: string, chunkSize = 3): TextChunk[] {
  const safeChunkSize = Math.max(1, Math.min(10, chunkSize || 3));
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];

  const totalChunks = Math.ceil(sentences.length / safeChunkSize);
  const chunks: TextChunk[] = [];

  for (let i = 0; i < sentences.length; i += safeChunkSize) {
    const slice = sentences.slice(i, i + safeChunkSize);
    chunks.push({
      chunkIndex: Math.floor(i / safeChunkSize),
      totalChunks,
      rawSpoken: slice.join(' '),
      sentences: slice,
    });
  }

  return chunks;
}

/**
 * Word-by-word diff comparing draft vs user rewrite using dynamic programming LCS.
 */
export function computeWordDiff(draft: string, rewrite: string): DiffToken[] {
  const wordsDraft = draft.trim().split(/\s+/).filter(Boolean);
  const wordsRewrite = rewrite.trim().split(/\s+/).filter(Boolean);

  if (wordsDraft.length === 0) {
    return wordsRewrite.map((w) => ({ type: 'added', word: w }));
  }
  if (wordsRewrite.length === 0) {
    return wordsDraft.map((w) => ({ type: 'removed', word: w }));
  }

  const m = wordsDraft.length;
  const n = wordsRewrite.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (wordsDraft[i - 1].toLowerCase() === wordsRewrite[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = m;
  let j = n;
  const tokens: DiffToken[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsDraft[i - 1].toLowerCase() === wordsRewrite[j - 1].toLowerCase()) {
      tokens.unshift({ type: 'same', word: wordsRewrite[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tokens.unshift({ type: 'added', word: wordsRewrite[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      tokens.unshift({ type: 'removed', word: wordsDraft[i - 1] });
      i--;
    }
  }

  return tokens;
}
