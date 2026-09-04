import type {
  ArticleDraftSnapshot,
  ArticleLength,
  ArticleTone,
  MediumArticle,
  VoiceProfile,
} from '../types';

export interface GeneratedArticle
  extends Omit<MediumArticle, 'id' | 'createdAt' | 'sourceTranscript' | 'tone'> {
  generationMode: 'local';
}

interface LocalGenerationOptions {
  tone: ArticleTone;
  targetAudience: string;
  readingLength: ArticleLength;
  customInstructions?: string;
}

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'been', 'being', 'but', 'could',
  'does', 'from', 'have', 'here', 'into', 'just', 'more', 'most', 'our', 'should',
  'some', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'very', 'want', 'were', 'what', 'when', 'where', 'which',
  'while', 'with', 'would', 'your', 'you', 'and', 'for', 'the', 'are', 'was', 'why',
]);

const TONE_LABELS: Record<ArticleTone, string> = {
  'thought-leadership': 'a forward-looking point of view',
  'technical-deepdive': 'a practical technical breakdown',
  'personal-narrative': 'an honest personal lesson',
  'pragmatic-guide': 'an actionable field guide',
  opinionated: 'a clear, contrarian argument',
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sentencesFrom(value: string): string[] {
  return normalizeText(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function trimTo(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, maxLength - 1).replace(/\s+\S*$/, '');
  return `${shortened || value.slice(0, maxLength - 1)}…`;
}

function extractKeywords(transcript: string): string[] {
  const counts = new Map<string, number>();
  const words = normalizeText(transcript)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));

  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 8)
    .map(([word]) => word);
}

function topicFrom(transcript: string, keywords: string[]): string {
  if (keywords.length) {
    const primary = keywords[0];
    const words = transcript.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
    const index = words.indexOf(primary);
    const next = words[index + 1];
    if (next?.length > 3 && !STOP_WORDS.has(next)) return `${primary} ${next}`;
    const previous = words[index - 1];
    if (previous?.length > 3 && !STOP_WORDS.has(previous)) return `${previous} ${primary}`;
    return primary;
  }
  const firstSentence = sentencesFrom(transcript)[0] || 'a better way forward';
  return trimTo(firstSentence.replace(/^(i\s+(want|think|believe)\s+(to\s+)?)/i, ''), 42);
}

function createTitle(topic: string, tone: ArticleTone): string {
  const titled = titleCase(topic);
  const variants: Record<ArticleTone, string> = {
    'thought-leadership': `Why ${titled} Changes the Way We Work`,
    'technical-deepdive': `${titled}: A Practical Deep Dive`,
    'personal-narrative': `What ${titled} Taught Me`,
    'pragmatic-guide': `A Practical Guide to ${titled}`,
    opinionated: `${titled} Is Broken. Here’s What Works`,
  };
  return trimTo(variants[tone], 72);
}

function chunkSentences(sentences: string[], targetChunks: number): string[] {
  const chunks: string[] = [];
  const size = Math.max(1, Math.ceil(sentences.length / targetChunks));
  for (let index = 0; index < sentences.length; index += size) {
    chunks.push(sentences.slice(index, index + size).join(' '));
  }
  return chunks;
}

function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

function uniqueTags(keywords: string[]): string[] {
  const candidates = [...keywords.map(titleCase), 'Productivity', 'Creativity', 'Writing', 'Leadership'];
  return [...new Set(candidates)].slice(0, 10);
}

export function generateArticleLocally(
  transcript: string,
  options: LocalGenerationOptions,
): GeneratedArticle {
  const cleanTranscript = normalizeText(transcript);
  const sentences = sentencesFrom(cleanTranscript);
  const safeSentences = sentences.length ? sentences : [cleanTranscript];
  const keywords = extractKeywords(cleanTranscript);
  const topic = topicFrom(cleanTranscript, keywords);
  const title = createTitle(topic, options.tone);
  const primaryKeyword = keywords[0] || topic.toLowerCase();
  const chunks = chunkSentences(safeSentences, options.readingLength === 'in-depth' ? 4 : 3);
  const strongestSentence = [...safeSentences].sort((a, b) => b.length - a.length)[0];
  const audience = normalizeText(options.targetAudience) || 'curious readers';
  const customFocus = normalizeText(options.customInstructions || '');

  const sections = [
    `The strongest ideas rarely arrive as clean outlines. They arrive as observations, tensions, and moments that refuse to leave us alone. This one starts with a simple claim: **${trimTo(strongestSentence, 220)}**`,
    `## The idea in plain terms\n\n${chunks[0]}`,
    `> ${trimTo(strongestSentence, 240)}`,
    `## Why it matters now\n\n${chunks[1] || chunks[0]}\n\nFor ${audience}, the useful question is not whether this idea sounds compelling. It is what changes when we take it seriously. The gap between an observation and an outcome is usually a decision: what to stop, what to protect, and what to try next.`,
    `## A practical way to act on it\n\n1. **Name the real constraint.** Separate the visible symptom from the underlying problem.\n2. **Run one small test.** Choose an action that can produce evidence without demanding a full reinvention.\n3. **Keep what the evidence supports.** Turn the result into a repeatable habit, rule, or system.`,
    chunks[2]
      ? `## The deeper lesson\n\n${chunks.slice(2).join(' ')}\n\nThe broader lesson is that progress comes from making the implicit explicit. Once an idea is clear enough to explain, it becomes clear enough to test.`
      : `## The deeper lesson\n\nClarity does not flatten a nuanced idea. It gives the idea somewhere to go. The point is to preserve the original insight while making its consequence unmistakable.`,
    customFocus ? `## A note on the intended focus\n\n${customFocus}` : '',
    `## Start with the next honest step\n\nA useful idea should leave the reader with movement, not just agreement. Choose the smallest meaningful action this argument suggests, try it, and pay attention to what changes.\n\n**What is one assumption here that you are ready to test?**`,
  ].filter(Boolean);

  const contentMarkdown = sections.join('\n\n');
  const wordCount = countWords(contentMarkdown);
  const tags = uniqueTags(keywords);
  const subtitle = trimTo(
    `Turning a raw observation into ${TONE_LABELS[options.tone]} for ${audience}.`,
    150,
  );
  const metaDescription = trimTo(
    `Explore a practical perspective on ${topic}, with clear lessons, an actionable framework, and ideas you can apply immediately.`,
    158,
  );

  return {
    title,
    subtitle,
    alternativeTitles: [
      trimTo(`The Hidden Lesson Behind ${titleCase(topic)}`, 72),
      trimTo(`${titleCase(topic)}: From Insight to Action`, 72),
      trimTo(`What Most People Miss About ${titleCase(topic)}`, 72),
    ],
    readTimeMinutes: Math.max(2, Math.ceil(wordCount / 220)),
    wordCount,
    contentMarkdown,
    executiveSummary: `A structured exploration of ${topic} that preserves the source idea and turns it into a practical argument for ${audience}.`,
    seo: {
      seoTitle: trimTo(title, 60),
      metaDescription,
      slug: slugify(title),
      primaryKeyword,
      secondaryKeywords: keywords.slice(1, 7),
      searchIntent: options.tone === 'pragmatic-guide' ? 'How-to guide' : 'Informational',
      seoScore: 78,
      seoHealthBreakdown: {
        titleOptimization: 'Clear topic and benefit-led framing',
        contentDepth: 'Structured with scannable headings, a pull quote, and an action framework',
        readability: 'Short sections and varied formatting support quick reading',
      },
      seoTips: [
        `Use “${primaryKeyword}” naturally in one additional heading.`,
        'Add one first-hand example, result, or data point before publishing.',
        'Link to two authoritative sources that support the central claim.',
      ],
    },
    tags: {
      primaryMediumTags: tags.slice(0, 5).map((tag, index) => ({
        tag,
        popularity: index < 2 ? 'High' : 'Medium',
        relevanceReason: index < keywords.length ? 'Drawn from the central themes' : 'Relevant Medium discovery topic',
      })),
      alternativeTags: tags.slice(5, 10),
    },
    suggestedPublications: ['The Startup', 'Better Humans', 'Mind Cafe'],
    generationMode: 'local',
  };
}

export function refineArticleLocally(
  article: Pick<MediumArticle, 'title' | 'subtitle' | 'contentMarkdown' | 'seo'>,
  instruction: string,
) {
  const request = instruction.toLowerCase();
  let contentMarkdown = article.contentMarkdown;
  let summary = 'Applied a local editorial pass';

  if (/opening|hook|introduction/.test(request)) {
    contentMarkdown = `What if the assumption at the center of this story is exactly backward?\n\n${contentMarkdown}`;
    summary = 'Added a sharper opening hook';
  } else if (/framework|step|case|example/.test(request)) {
    contentMarkdown += `\n\n## A simple field test\n\n1. Write down the assumption you are making.\n2. Choose the smallest observable test of that assumption.\n3. Review the result and decide what you will change next.`;
    summary = 'Added a concrete three-step framework';
  } else if (/clos|conclusion|takeaway|discussion/.test(request)) {
    contentMarkdown += `\n\n## One question to carry forward\n\nThe value of an idea is revealed by the decision it changes. **What will you do differently after reading this?**`;
    summary = 'Strengthened the closing takeaway';
  } else if (/short|punch|concise/.test(request)) {
    contentMarkdown = contentMarkdown
      .replace(/\b(very|really|actually|basically|just)\b\s*/gi, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +\n/g, '\n');
    summary = 'Tightened filler words and phrasing';
  } else {
    contentMarkdown += `\n\n## Editorial focus\n\n${normalizeText(instruction)}`;
    summary = 'Added a section for the requested editorial focus';
  }

  return {
    title: article.title,
    subtitle: article.subtitle,
    contentMarkdown,
    revisionSummary: summary,
    updatedSeoScore: Math.min(100, (article.seo?.seoScore || 75) + 2),
    generationMode: 'local' as const,
  };
}

export interface AdaptedVoiceResult {
  profile: VoiceProfile;
  adaptationSummary: string;
}

export function adaptVoiceLocally(
  original: ArticleDraftSnapshot,
  edited: ArticleDraftSnapshot,
  currentProfile?: VoiceProfile | null,
): AdaptedVoiceResult {
  const origText = `${original.title} ${original.subtitle} ${original.contentMarkdown}`;
  const editText = `${edited.title} ${edited.subtitle} ${edited.contentMarkdown}`;

  const origSentences = sentencesFrom(origText);
  const editSentences = sentencesFrom(editText);

  const origAvgLength = origSentences.length
    ? countWords(origText) / origSentences.length
    : 15;
  const editAvgLength = editSentences.length
    ? countWords(editText) / editSentences.length
    : 15;

  const getWordSet = (text: string) => {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    );
  };

  const origWords = getWordSet(origText);
  const editWords = getWordSet(editText);

  const addedWords = Array.from(editWords).filter((w) => !origWords.has(w) && w.length > 3);
  const removedWords = Array.from(origWords).filter((w) => !editWords.has(w) && w.length > 3);

  let sentenceStyle = currentProfile?.sentenceStyle || 'Balanced and conversational flow.';
  const traits = new Set(currentProfile?.traits || ['Direct', 'Conversational']);
  const signatureMoves = new Set(currentProfile?.signatureMoves || []);
  const avoidances = new Set(currentProfile?.avoidances || []);
  const vocabulary = new Set(currentProfile?.vocabulary || []);

  const summaries: string[] = [];

  if (editAvgLength < origAvgLength * 0.85) {
    sentenceStyle = 'Punchy, concise cadence with short, impactful sentences and minimal fluff.';
    traits.add('Punchy');
    traits.add('Concise');
    traits.add('Direct');
    summaries.push('Tuned for shorter, punchier sentences');
  } else if (editAvgLength > origAvgLength * 1.15) {
    sentenceStyle = 'Nuanced, flowing cadence that develops ideas with thorough context and storytelling.';
    traits.add('Nuanced');
    traits.add('Story-driven');
    summaries.push('Tuned for flowing, narrative rhythm');
  }

  if (addedWords.length > 0) {
    const newVocab = addedWords.slice(0, 5);
    newVocab.forEach((w) => vocabulary.add(w));
    summaries.push(`Adopted signature phrasing: "${newVocab.slice(0, 3).join(', ')}"`);
  }

  const AI_CLICHES = new Set([
    'delve', 'testament', 'tapestry', 'game-changer', 'revolutionize',
    'pivotal', 'landscape', 'realm', 'beacon', 'unleash', 'leverage',
    'moreover', 'furthermore', 'crucial', 'foster', 'underscore',
  ]);
  const removedCliches = removedWords.filter((w) => AI_CLICHES.has(w));
  if (removedCliches.length > 0) {
    removedCliches.forEach((w) => avoidances.add(`Words like "${w}"`));
    summaries.push(`Avoids corporate clichés like "${removedCliches.join(', ')}"`);
  } else if (removedWords.length > 3) {
    avoidances.add(`Unnecessary padding or filler around "${removedWords.slice(0, 2).join(', ')}"`);
    summaries.push(`Pruned filler and tightened phrasing`);
  }

  const origH2Count = (original.contentMarkdown.match(/^##\s/gm) || []).length;
  const editH2Count = (edited.contentMarkdown.match(/^##\s/gm) || []).length;
  if (editH2Count > origH2Count) {
    signatureMoves.add('Frequent subheadings to chunk ideas into digestible sections');
  }

  const origBullets = (original.contentMarkdown.match(/^\s*[-*]\s/gm) || []).length;
  const editBullets = (edited.contentMarkdown.match(/^\s*[-*]\s/gm) || []).length;
  if (editBullets > origBullets) {
    signatureMoves.add('Actionable bulleted blueprints and skimmable lists');
    summaries.push('Prefers bulleted takeaways');
  }

  const summary = summaries.length > 0
    ? `Adjusted voice: ${summaries.join('; ')}.`
    : 'Adjusted voice: refined tone and stylistic choices from your manual edits.';

  const baseInstructions = currentProfile?.writingInstructions
    ? currentProfile.writingInstructions.replace(/\s*\[Adjusted from edits:.*$/, '')
    : 'Write with natural authority and clarity, preserving the author\'s unique perspective.';

  const newInstructions = `${baseInstructions.trim()} [Adjusted from edits: ${sentenceStyle} Incorporate vocabulary: ${Array.from(vocabulary).slice(-6).join(', ')}. Avoid: ${Array.from(avoidances).slice(-5).join(', ')}.]`;

  const updatedNotes = [
    ...(currentProfile?.adaptationNotes || []),
    `${new Date().toLocaleDateString()}: ${summary}`,
  ].slice(-10);

  const updatedProfile: VoiceProfile = {
    name: currentProfile?.name || 'My Voice (Tuned from Edits)',
    summary: currentProfile?.summary || 'A custom voice profile tuned directly from your manual story edits.',
    traits: Array.from(traits).slice(0, 10),
    sentenceStyle,
    vocabulary: Array.from(vocabulary).slice(0, 20),
    signatureMoves: Array.from(signatureMoves).slice(0, 8),
    avoidances: Array.from(avoidances).slice(0, 8),
    writingInstructions: newInstructions,
    interviewAnswers: currentProfile?.interviewAnswers || [],
    updatedAt: new Date().toISOString(),
    adaptationNotes: updatedNotes,
  };

  return {
    profile: updatedProfile,
    adaptationSummary: summary,
  };
}

