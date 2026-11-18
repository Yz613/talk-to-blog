import type {
  ArticleDraftSnapshot,
  ArticleLength,
  ArticleTone,
  MediumArticle,
  VoiceDilemma,
  VoiceProfile,
  VoiceRewritePair,
} from '../types';
import { localResearch } from './articleResearch';

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
    research: { ...localResearch, sources: [], unresolvedClaims: [] },
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

export interface CorpusPair {
  original: ArticleDraftSnapshot;
  published: ArticleDraftSnapshot;
  title?: string;
}

/**
 * Learn and adapt a Voice Profile across multiple published articles
 * compared against their initial AI drafts.
 */
export function adaptVoiceFromCorpusLocally(
  pairs: CorpusPair[],
  currentProfile?: VoiceProfile | null,
): { profile: VoiceProfile; adaptationSummary: string } {
  if (!pairs || pairs.length === 0) {
    return {
      profile: currentProfile || {
        name: 'My Voice',
        summary: 'Default voice profile.',
        traits: ['Authentic', 'Clear'],
        sentenceStyle: 'Balanced, conversational cadence.',
        vocabulary: [],
        signatureMoves: [],
        avoidances: [],
        writingInstructions: 'Write naturally and clearly.',
        interviewAnswers: [],
        updatedAt: new Date().toISOString(),
      },
      adaptationSummary: 'No published story pairs provided.',
    };
  }

  const traits = new Set<string>(currentProfile?.traits || []);
  const vocabulary = new Set<string>(currentProfile?.vocabulary || []);
  const signatureMoves = new Set<string>(currentProfile?.signatureMoves || []);
  const avoidances = new Set<string>(currentProfile?.avoidances || []);
  const bannedWords = new Set<string>(currentProfile?.bannedWordsAndPhrases || []);

  const removedFrequency = new Map<string, number>();
  const addedFrequency = new Map<string, number>();
  let totalOrigWords = 0;
  let totalPublishedWords = 0;
  let totalOrigSentences = 0;
  let totalPublishedSentences = 0;

  const AI_CLICHES = new Set([
    'delve', 'testament', 'tapestry', 'game-changer', 'revolutionize',
    'pivotal', 'landscape', 'realm', 'beacon', 'unleash', 'leverage',
    'moreover', 'furthermore', 'crucial', 'foster', 'underscore',
    'in conclusion', 'in today\'s fast-paced world', 'it is worth noting',
    'it is important to remember', 'dive deep', 'demystify',
  ]);

  for (const pair of pairs) {
    const origText = pair.original.contentMarkdown || '';
    const pubText = pair.published.contentMarkdown || '';

    const origWords = origText.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
    const pubWords = pubText.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
    const origSentences = sentencesFrom(origText);
    const pubSentences = sentencesFrom(pubText);

    totalOrigWords += origWords.length;
    totalPublishedWords += pubWords.length;
    totalOrigSentences += origSentences.length;
    totalPublishedSentences += pubSentences.length;

    const pubWordSet = new Set(pubWords);
    const origWordSet = new Set(origWords);

    for (const w of origWords) {
      if (!pubWordSet.has(w) && (AI_CLICHES.has(w) || w.length > 5)) {
        removedFrequency.set(w, (removedFrequency.get(w) || 0) + 1);
      }
    }

    for (const w of pubWords) {
      if (!origWordSet.has(w) && w.length > 4 && !STOP_WORDS.has(w)) {
        addedFrequency.set(w, (addedFrequency.get(w) || 0) + 1);
      }
    }
  }

  // Sentence length analysis across all articles
  const avgOrigLen = totalOrigSentences > 0 ? totalOrigWords / totalOrigSentences : 15;
  const avgPubLen = totalPublishedSentences > 0 ? totalPublishedWords / totalPublishedSentences : 15;
  let sentenceStyle = currentProfile?.sentenceStyle || 'Direct, authentic conversational flow.';

  if (avgPubLen < avgOrigLen * 0.85) {
    sentenceStyle = 'Punchy, staccato cadence with short, impactful sentences and zero corporate fluff.';
    traits.add('Punchy');
    traits.add('Direct');
    traits.add('No-Fluff');
  } else if (avgPubLen > avgOrigLen * 1.15) {
    sentenceStyle = 'Storyteller cadence with rich context, vivid anecdotes, and flowing narrative paragraphs.';
    traits.add('Narrative');
    traits.add('Thoughtful');
  } else {
    traits.add('Authentic');
    traits.add('Clear');
  }

  // Identify systematically removed words
  const sortedRemoved = [...removedFrequency.entries()].sort((a, b) => b[1] - a[1]);
  for (const [w, count] of sortedRemoved.slice(0, 10)) {
    if (count >= 1 || AI_CLICHES.has(w)) {
      bannedWords.add(w);
      avoidances.add(`Never use "${w}"`);
    }
  }

  // Identify systematically added words/phrases
  const sortedAdded = [...addedFrequency.entries()].sort((a, b) => b[1] - a[1]);
  for (const [w] of sortedAdded.slice(0, 10)) {
    vocabulary.add(w);
  }

  signatureMoves.add('Cut formulaic corporate transitions in favor of direct statements');
  signatureMoves.add('Prioritize personal conviction and honest reflection over generic AI summaries');

  const summary = `Corpus voice calibrated from ${pairs.length} published story ${pairs.length === 1 ? 'comparison' : 'comparisons'}. Identified ${bannedWords.size} banned clichés and adopted ${vocabulary.size} signature vocabulary patterns.`;

  const updatedNotes = [
    ...(currentProfile?.adaptationNotes || []),
    `${new Date().toLocaleDateString()}: ${summary}`,
  ].slice(-10);

  const updatedProfile: VoiceProfile = {
    name: currentProfile?.name || 'My Authentic Voice',
    summary: `Voice calibrated across ${pairs.length} published articles. Characterized by ${Array.from(traits).slice(0, 3).join(', ')} style.`,
    traits: Array.from(traits).slice(0, 12),
    sentenceStyle,
    vocabulary: Array.from(vocabulary).slice(0, 25),
    signatureMoves: Array.from(signatureMoves).slice(0, 10),
    avoidances: Array.from(avoidances).slice(0, 10),
    bannedWordsAndPhrases: Array.from(bannedWords).slice(0, 25),
    writingInstructions: `Strict Voice Directives: ${sentenceStyle} Absolutely avoid: ${Array.from(bannedWords).slice(0, 8).join(', ')}. Use natural phrasing like: ${Array.from(vocabulary).slice(0, 6).join(', ')}.`,
    interviewAnswers: currentProfile?.interviewAnswers || [],
    updatedAt: new Date().toISOString(),
    adaptationNotes: updatedNotes,
    corpusArticleCount: pairs.length,
  };

  return {
    profile: updatedProfile,
    adaptationSummary: summary,
  };
}

/**
 * Adapt a Voice Profile from explicit sentence-by-sentence rewrites,
 * where the user was presented with what they said vs what AI wrote,
 * and typed their exact personal rewrite (keyboard only).
 * Can be combined with the published corpus.
 */
export function adaptVoiceFromRewritesLocally(
  rewritePairs: VoiceRewritePair[],
  currentProfile?: VoiceProfile | null,
  publishedPairs?: CorpusPair[]
): { profile: VoiceProfile; adaptationSummary: string } {
  let baseResult: { profile: VoiceProfile; adaptationSummary: string };
  if (publishedPairs && publishedPairs.length > 0) {
    baseResult = adaptVoiceFromCorpusLocally(publishedPairs, currentProfile);
  } else {
    baseResult = {
      profile: currentProfile || {
        name: 'My Voice',
        summary: 'Authentic personal voice profile.',
        traits: ['Authentic', 'Clear', 'Human'],
        sentenceStyle: 'Balanced, conversational cadence.',
        vocabulary: [],
        signatureMoves: [],
        avoidances: [],
        writingInstructions: 'Write naturally and clearly.',
        interviewAnswers: [],
        updatedAt: new Date().toISOString(),
      },
      adaptationSummary: 'Calibrated from rewrites.',
    };
  }

  if (!rewritePairs || rewritePairs.length === 0) {
    return baseResult;
  }

  const profile = baseResult.profile;
  const traits = new Set<string>(profile.traits || []);
  const vocabulary = new Set<string>(profile.vocabulary || []);
  const signatureMoves = new Set<string>(profile.signatureMoves || []);
  const avoidances = new Set<string>(profile.avoidances || []);
  const bannedWords = new Set<string>(profile.bannedWordsAndPhrases || []);

  let totalSpokenWords = 0;
  let totalDraftWords = 0;
  let totalRewriteWords = 0;
  let emDashCount = 0;
  let semicolonCount = 0;

  for (const pair of rewritePairs) {
    const spoken = (pair.sourceTranscriptChunk || '').toLowerCase();
    const draft = (pair.aiDraftChunk || '').toLowerCase();
    const rewrite = pair.userRewriteChunk || '';
    const rewriteLower = rewrite.toLowerCase();

    const spokenWords = spoken.split(/\s+/).filter(Boolean);
    const draftWords = draft.split(/\s+/).filter(Boolean);
    const rewriteWords = rewriteLower.split(/\s+/).filter(Boolean);

    totalSpokenWords += spokenWords.length;
    totalDraftWords += draftWords.length;
    totalRewriteWords += rewriteWords.length;

    if (rewrite.includes('—') || rewrite.includes('--')) {
      emDashCount++;
    }
    if (rewrite.includes(';')) {
      semicolonCount++;
    }

    const AI_CLICHES = [
      'delve', 'testament', 'tapestry', 'moreover', 'in conclusion',
      'synergy', 'leverage', 'crucial', 'foster', 'landscape', 'pivotal'
    ];
    for (const c of AI_CLICHES) {
      if (draft.includes(c) && !rewriteLower.includes(c)) {
        bannedWords.add(c);
        avoidances.add(`Deleted AI cliché: "${c}"`);
      }
    }

    for (const w of rewriteWords) {
      const cleanW = w.replace(/[^a-z0-9-]/g, '');
      if (cleanW.length > 4 && !draft.includes(cleanW) && !spoken.includes(cleanW)) {
        vocabulary.add(cleanW);
      }
    }
  }

  if (emDashCount >= 2) {
    signatureMoves.add('Uses em-dashes (—) for sharp parenthetical observations');
  }
  if (semicolonCount === 0) {
    avoidances.add('Avoids formal semicolons; prefers clean sentence breaks');
  }

  let sentenceStyle = profile.sentenceStyle;
  if (totalRewriteWords < totalDraftWords * 0.85) {
    traits.add('Punchy');
    traits.add('Concise');
    traits.add('Direct');
    sentenceStyle = 'Punchy, direct cadence. Cuts run-on sentences down into sharp, declarative points.';
  } else if (totalRewriteWords > totalDraftWords * 1.15) {
    traits.add('Detailed');
    traits.add('Expressive');
    sentenceStyle = 'Detailed narrative cadence. Adds nuance and authentic depth to brief statements.';
  }

  const summary = `Calibrated from ${rewritePairs.length} exact sentence-by-sentence rewrites${publishedPairs?.length ? ` and ${publishedPairs.length} published stories` : ''}.`;

  const updatedNotes = [
    ...(profile.adaptationNotes || []),
    `${new Date().toLocaleDateString()}: ${summary}`,
  ].slice(-10);

  const newInstructions = [
    sentenceStyle ? `- Cadence: ${sentenceStyle}` : '',
    bannedWords.size > 0 ? `- Strict Avoidances: Never use ${Array.from(bannedWords).slice(0, 10).join(', ')}.` : '',
    signatureMoves.size > 0 ? `- Signature Moves: ${Array.from(signatureMoves).slice(0, 5).join('; ')}.` : '',
    profile.writingInstructions ? profile.writingInstructions : '',
  ].filter(Boolean).join('\n');

  return {
    profile: {
      ...profile,
      summary: profile.summary || summary,
      traits: Array.from(traits).slice(0, 12),
      sentenceStyle,
      vocabulary: Array.from(vocabulary).slice(0, 30),
      signatureMoves: Array.from(signatureMoves).slice(0, 10),
      avoidances: Array.from(avoidances).slice(0, 12),
      bannedWordsAndPhrases: Array.from(bannedWords).slice(0, 20),
      writingInstructions: newInstructions,
      updatedAt: new Date().toISOString(),
      adaptationNotes: updatedNotes,
      rewritePairsCount: rewritePairs.length,
      recentRewritePairs: rewritePairs.slice(0, 20),
    },
    adaptationSummary: summary,
  };
}

/**
 * Re-voice and de-slop an article draft locally by purging AI tropes,
 * trimming corporate padding, and enforcing human cadence.
 */
export function revoiceArticleLocally(
  article: MediumArticle,
  profile?: VoiceProfile | null,
): { title: string; subtitle: string; contentMarkdown: string; revisionSummary: string } {
  let content = article.contentMarkdown || '';
  let title = article.title || '';
  let subtitle = article.subtitle || '';

  // 1. Purge standard AI clichés & filler
  const cliches = [
    /\bIn today['’]s (?:fast-paced|rapidly changing|digital) world,?\s*/gi,
    /\bIt is (?:crucial|essential|paramount|worth noting) (?:that|to remember that)\s*/gi,
    /\b(?:Furthermore|Moreover|In addition),\s*/gi,
    /\bIn conclusion,?\s*/gi,
    /\bdelve into\b/gi,
    /\ba testament to\b/gi,
    /\ba tapestry of\b/gi,
    /\bgame-changer\b/gi,
    /\bleverage\b/gi,
    /\brevolutionize\b/gi,
    /\bpivotal\b/gi,
    /\bbeacon of\b/gi,
  ];

  for (const regex of cliches) {
    content = content.replace(regex, (match) => {
      if (/delve into/i.test(match)) return 'examine';
      if (/testament to/i.test(match)) return 'proof of';
      if (/game-changer/i.test(match)) return 'major shift';
      if (/leverage/i.test(match)) return 'use';
      return '';
    });
  }

  // 2. Remove user-banned words from profile if provided
  if (profile?.bannedWordsAndPhrases) {
    for (const banned of profile.bannedWordsAndPhrases) {
      if (!banned.trim()) continue;
      const bRegex = new RegExp(`\\b${banned.trim()}\\b`, 'gi');
      content = content.replace(bRegex, '');
    }
  }

  // Clean double spaces or broken punctuation
  content = content.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?;:])/g, '$1');

  // De-slop title if it has buzzwords
  title = title
    .replace(/\bHow to Delve into\b/gi, 'How to Master')
    .replace(/\bA Comprehensive Guide to\b/gi, 'A Honest Guide to')
    .replace(/\bGame-Changing\b/gi, 'Effective')
    .replace(/\s{2,}/g, ' ')
    .trim();

  subtitle = subtitle
    .replace(/\bIn today's fast-paced world,?\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    title,
    subtitle,
    contentMarkdown: content.trim(),
    revisionSummary: 'De-slopped draft: pruned generic AI clichés, removed filler, and applied authentic voice cadence.',
  };
}

export const BUILTIN_VOICE_DILEMMAS: VoiceDilemma[] = [
  {
    id: 'dilemma-opening-hook',
    category: 'opening',
    scenario: 'Opening your story: Hooking the reader into the central problem',
    optionA: 'In today’s fast-moving environment, many organizations struggle with prioritizing what truly moves the needle.',
    optionB: 'Most teams waste 80% of their time on things that don’t matter. Here is how we stopped doing that.',
    labelA: 'Formal / Conventional',
    labelB: 'Punchy & Candid',
  },
  {
    id: 'dilemma-hard-truth',
    category: 'opinion',
    scenario: 'Introducing a contrarian insight or uncomfortable truth',
    optionA: 'While conventional wisdom advocates for broad consensus, iterative paradigms often benefit from centralized decision-making.',
    optionB: 'Committees kill great ideas. If you need 10 people to approve a decision, you’re just hiding from accountability.',
    labelA: 'Diplomatic / Corporate',
    labelB: 'Direct & Bold',
  },
  {
    id: 'dilemma-transition',
    category: 'transition',
    scenario: 'Transitioning between two major points in your article',
    optionA: 'Furthermore, it is worth examining the second critical pillar that underscores this phenomenon.',
    optionB: 'That brings us to the real problem:',
    labelA: 'Textbook Academic',
    labelB: 'Conversational Staccato',
  },
  {
    id: 'dilemma-failure',
    category: 'humor',
    scenario: 'Describing an unexpected mistake or engineering bug',
    optionA: 'We observed an unfortunate degradation in system throughput due to unforeseen edge cases.',
    optionB: 'We completely broke production on a Friday afternoon. It was messy, embarrassing, and totally our fault.',
    labelA: 'Sanitized Report',
    labelB: 'Self-Deprecating & Human',
  },
  {
    id: 'dilemma-conclusion',
    category: 'conclusion',
    scenario: 'Wrapping up the story with a call-to-action',
    optionA: 'In conclusion, by taking a holistic approach and leveraging these strategic frameworks, you can empower your future growth.',
    optionB: 'Don’t overcomplicate this. Pick the one bottleneck keeping you up at night, delete the rest of your to-do list, and fix it today.',
    labelA: 'Consultant Wrap-up',
    labelB: 'Clear Action Directive',
  },
];

/**
 * Generate a set of Voice Dilemmas for calibration.
 */
export function generateDilemmasLocally(
  article?: MediumArticle | null,
  _profile?: VoiceProfile | null,
): VoiceDilemma[] {
  if (!article || !article.title) {
    return BUILTIN_VOICE_DILEMMAS;
  }

  // Tailor scenarios slightly to the current article title
  return [
    {
      id: `dilemma-hook-${Date.now()}`,
      category: 'opening',
      scenario: `Opening Hook: How would you start an article on "${article.title.slice(0, 50)}"?`,
      optionA: `Many professionals find themselves pondering the complexities of this subject in today's fast-paced environment.`,
      optionB: `Let's cut the noise: most people approach this completely backwards.`,
      labelA: 'Polite / Theoretical',
      labelB: 'Direct / Provocative',
    },
    ...BUILTIN_VOICE_DILEMMAS.slice(1),
  ];
}

/**
 * Update a Voice Profile based on a user's dilemma choice.
 */
export function submitDilemmaLocally(
  dilemma: VoiceDilemma,
  choice: 'A' | 'B' | 'custom',
  customText?: string,
  profile?: VoiceProfile | null,
): { profile: VoiceProfile; feedback: string } {
  const current = profile || {
    name: 'My Voice',
    summary: 'Voice profile in training.',
    traits: [],
    sentenceStyle: 'Balanced',
    vocabulary: [],
    signatureMoves: [],
    avoidances: [],
    writingInstructions: '',
    interviewAnswers: [],
    updatedAt: new Date().toISOString(),
    dilemmasAnsweredCount: 0,
  };

  const traits = new Set<string>(current.traits);
  const signatureMoves = new Set<string>(current.signatureMoves);
  const avoidances = new Set<string>(current.avoidances);
  const vocabulary = new Set<string>(current.vocabulary);
  let feedback = '';

  if (choice === 'B') {
    traits.add('Direct');
    traits.add('Punchy');
    signatureMoves.add(`Prefers candid phrasing like "${dilemma.optionB.slice(0, 45)}..."`);
    avoidances.add(`Avoids generic phrasing like "${dilemma.optionA.slice(0, 45)}..."`);
    feedback = 'Tuned for direct, punchy, and conversational cadence.';
  } else if (choice === 'A') {
    traits.add('Thoughtful');
    traits.add('Measured');
    signatureMoves.add(`Prefers measured phrasing like "${dilemma.optionA.slice(0, 45)}..."`);
    feedback = 'Tuned for measured and structured tone.';
  } else if (choice === 'custom' && customText && customText.trim()) {
    traits.add('Distinctive');
    const snippet = customText.trim().slice(0, 60);
    signatureMoves.add(`Author signature phrasing: "${snippet}"`);
    const words = customText.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 4 && !STOP_WORDS.has(w));
    words.slice(0, 4).forEach((w) => vocabulary.add(w));
    feedback = `Adopted your exact signature words: "${snippet}"`;
  }

  const count = (current.dilemmasAnsweredCount || 0) + 1;
  const updatedNotes = [
    ...(current.adaptationNotes || []),
    `${new Date().toLocaleDateString()}: Calibrated via question on ${dilemma.category} (${feedback})`,
  ].slice(-10);

  const updatedProfile: VoiceProfile = {
    ...current,
    traits: Array.from(traits).slice(0, 12),
    signatureMoves: Array.from(signatureMoves).slice(0, 10),
    avoidances: Array.from(avoidances).slice(0, 10),
    vocabulary: Array.from(vocabulary).slice(0, 25),
    updatedAt: new Date().toISOString(),
    adaptationNotes: updatedNotes,
    dilemmasAnsweredCount: count,
  };

  return {
    profile: updatedProfile,
    feedback,
  };
}
