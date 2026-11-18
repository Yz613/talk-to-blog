import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateArticleLocally,
  refineArticleLocally,
  adaptVoiceLocally,
  adaptVoiceFromCorpusLocally,
  revoiceArticleLocally,
  generateDilemmasLocally,
  submitDilemmaLocally,
  adaptVoiceFromRewritesLocally,
} from '../src/server/localArticle';
import {
  splitIntoSentences,
  chunkTextBySentences,
  computeWordDiff,
} from '../src/utils/sentenceChunker';

const transcript = 'We underpriced our first product because we feared rejection. The low price attracted demanding customers who did not value the work. When we raised the price, churn dropped and better customers took us seriously.';

test('local mode creates a complete, deterministic article package', () => {
  const article = generateArticleLocally(transcript, {
    tone: 'personal-narrative',
    targetAudience: 'startup founders',
    readingLength: 'medium',
  });

  assert.equal(article.generationMode, 'local');
  assert.ok(article.title.length > 10);
  assert.ok(article.contentMarkdown.includes('## A practical way to act on it'));
  assert.equal(article.tags.primaryMediumTags.length, 5);
  assert.match(article.seo.slug, /^[a-z0-9-]+$/);
  assert.equal(article.wordCount, article.contentMarkdown.trim().split(/\s+/).length);
});

test('local refinement responds to framework requests', () => {
  const article = generateArticleLocally(transcript, {
    tone: 'pragmatic-guide',
    targetAudience: 'founders',
    readingLength: 'short',
  });
  const refined = refineArticleLocally(article, 'Add a concrete three-step framework');

  assert.ok(refined.contentMarkdown.includes('## A simple field test'));
  assert.equal(refined.updatedSeoScore, article.seo.seoScore + 2);
});

test('punchiness refinement preserves Markdown structure', () => {
  const article = generateArticleLocally(transcript, {
    tone: 'opinionated',
    targetAudience: 'founders',
    readingLength: 'short',
  });
  const refined = refineArticleLocally(article, 'Make it punchier and more concise');

  assert.ok(refined.contentMarkdown.includes('\n\n## '));
});

test('voice adapts from user edits: shortens cadence and prunes clichés', () => {
  const original = {
    title: 'How to Delve into Pricing and Leverage Strategic Synergies',
    subtitle: 'A comprehensive game-changer exploration of product pricing in the modern landscape.',
    contentMarkdown: 'In today’s fast-paced world, it is crucial that organizations delve into pricing strategies. We must leverage every advantage to empower our teams. This will revolutionize the market testament.',
  };

  const edited = {
    title: 'Stop Underpricing Your Work',
    subtitle: 'Charge what it is worth. Your best customers will thank you.',
    contentMarkdown: 'Charge more. Most founders underprice out of fear. When you raise prices, demanding clients leave and great clients stay.\n\n- Know your floor\n- Double the price\n- Watch churn vanish',
  };

  const result = adaptVoiceLocally(original, edited, null);

  assert.ok(result.profile);
  assert.ok(result.adaptationSummary.length > 0);
  // Should detect punchy / short cadence
  assert.ok(result.profile.traits.includes('Punchy') || result.profile.traits.includes('Concise'));
  assert.match(result.profile.sentenceStyle, /punchy|concise/i);
  // Should detect removed cliches
  assert.ok(
    result.profile.avoidances.some((a) => /delve|game-changer|leverage/i.test(a)) ||
    result.adaptationSummary.includes('Avoids') ||
    result.adaptationSummary.includes('Pruned'),
  );
  // Should detect added vocabulary
  assert.ok(result.profile.vocabulary.length > 0);
  // Should include adaptation notes
  assert.ok(result.profile.adaptationNotes && result.profile.adaptationNotes.length > 0);
});

test('adaptVoiceFromCorpusLocally synthesizes voice from multiple published articles', () => {
  const pairs = [
    {
      title: 'Pricing Strategy',
      original: {
        title: 'How to Delve into Pricing',
        subtitle: 'In today’s fast-paced world...',
        contentMarkdown: 'Furthermore, it is crucial that we delve into pricing. This is a testament to our game-changer journey.',
      },
      published: {
        title: 'Stop Underpricing',
        subtitle: 'Charge what it is worth.',
        contentMarkdown: 'Charge more. Stop being afraid. High prices attract serious clients.',
      },
    },
    {
      title: 'Hiring Lessons',
      original: {
        title: 'The Pivotal Talent Landscape',
        subtitle: 'A tapestry of recruiting paradigms...',
        contentMarkdown: 'Moreover, organizations must leverage top talent to revolutionize their industry and delve deep.',
      },
      published: {
        title: 'How We Hire',
        subtitle: 'Skip the buzzwords.',
        contentMarkdown: 'Hire slowly. Give candidates a paid real-world project. Watch how they communicate.',
      },
    },
  ];

  const result = adaptVoiceFromCorpusLocally(pairs, null);
  assert.ok(result.profile);
  assert.equal(result.profile.corpusArticleCount, 2);
  assert.ok(result.profile.traits.includes('Punchy') || result.profile.traits.includes('Direct'));
  assert.ok(result.profile.bannedWordsAndPhrases && result.profile.bannedWordsAndPhrases.length > 0);
  assert.match(result.adaptationSummary, /2 published stor/);
});

test('revoiceArticleLocally strips AI slop and banned phrases', () => {
  const article = {
    ...generateArticleLocally(transcript, { tone: 'thought-leadership', targetAudience: 'readers', readingLength: 'short' }),
    id: 'test-1',
    createdAt: new Date().toISOString(),
    sourceTranscript: transcript,
    tone: 'thought-leadership',
    title: 'How to Delve into Game-Changing Pricing',
    subtitle: 'In today’s fast-paced world, pricing matters.',
    contentMarkdown: 'In today’s fast-paced world, it is crucial to understand pricing. Furthermore, we must delve into the market. It is a testament to our dedication.',
  };

  const revoiced = revoiceArticleLocally(article, {
    name: 'Test Profile',
    summary: '',
    traits: [],
    sentenceStyle: 'Punchy',
    vocabulary: [],
    signatureMoves: [],
    avoidances: [],
    bannedWordsAndPhrases: ['dedication'],
    writingInstructions: '',
    interviewAnswers: [],
    updatedAt: new Date().toISOString(),
  });

  assert.ok(!revoiced.contentMarkdown.includes('In today’s fast-paced world'));
  assert.ok(!revoiced.contentMarkdown.includes('Furthermore'));
  assert.ok(!revoiced.contentMarkdown.includes('delve into'));
  assert.ok(!revoiced.title.includes('Delve'));
});

test('generateDilemmasLocally and submitDilemmaLocally update profile preferences', () => {
  const dilemmas = generateDilemmasLocally(null, null);
  assert.ok(dilemmas.length >= 3);
  const first = dilemmas[0];

  const submission = submitDilemmaLocally(first, 'B', undefined, null);
  assert.ok(submission.profile.traits.includes('Direct') || submission.profile.traits.includes('Punchy'));
  assert.equal(submission.profile.dilemmasAnsweredCount, 1);

  const customSubmission = submitDilemmaLocally(first, 'custom', 'Cut the nonsense and ship working code', submission.profile);
  assert.equal(customSubmission.profile.dilemmasAnsweredCount, 2);
  assert.ok(customSubmission.profile.signatureMoves.some((m) => m.includes('Cut the nonsense')));
});

test('splitIntoSentences safely preserves abbreviations and breaks on sentence boundaries', () => {
  const text = 'Dr. Smith met with Mr. Jones at 3 p.m. to discuss e.g. the roadmap! Then they agreed? Yes, absolutely.';
  const sentences = splitIntoSentences(text);

  assert.equal(sentences.length, 3);
  assert.equal(sentences[0], 'Dr. Smith met with Mr. Jones at 3 p.m. to discuss e.g. the roadmap!');
  assert.equal(sentences[1], 'Then they agreed?');
  assert.equal(sentences[2], 'Yes, absolutely.');
});

test('chunkTextBySentences chunks text into 3-sentence segments by default', () => {
  const paragraphs = [
    'First sentence here.',
    'Second sentence arrives.',
    'Third sentence concludes chunk one.',
    'Fourth sentence begins next chunk.',
    'Fifth sentence follows.',
  ].join(' ');

  const chunks = chunkTextBySentences(paragraphs, 3);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].chunkIndex, 0);
  assert.equal(chunks[0].totalChunks, 2);
  assert.equal(chunks[0].sentences.length, 3);
  assert.equal(chunks[1].sentences.length, 2);
});

test('computeWordDiff highlights word additions, deletions, and retentions', () => {
  const draft = 'In today’s fast-paced world we delve into pricing.';
  const rewrite = 'We priced our product properly.';
  const diff = computeWordDiff(draft, rewrite);

  assert.ok(diff.some((t) => t.type === 'removed' && /delve|fast-paced|today’s/i.test(t.word)));
  assert.ok(diff.some((t) => t.type === 'added' && /properly|priced/i.test(t.word)));
});

test('adaptVoiceFromRewritesLocally learns voice metrics and exemplars from keyboard rewrites', () => {
  const rewrites = [
    {
      id: 'test-rewrite-1',
      chunkIndex: 0,
      totalChunks: 1,
      sourceTranscriptChunk: 'We thought our product was worth fifty dollars but people told us it was too expensive so we dropped it.',
      aiDraftChunk: 'In today’s fast-paced world, one must delve into extensive pricing paradigms in order to empower comprehensive stakeholder synergy across the enterprise landscape.',
      userRewriteChunk: 'We cut our price out of fear. Big mistake.',
      timestamp: new Date().toISOString(),
    },
  ];

  const result = adaptVoiceFromRewritesLocally(rewrites, null);
  assert.ok(result.profile);
  assert.equal(result.profile.rewritePairsCount, 1);
  assert.ok(result.profile.recentRewritePairs && result.profile.recentRewritePairs.length === 1);
  assert.ok(result.profile.traits.includes('Punchy') || result.profile.traits.includes('Direct'));
  assert.ok(
    result.profile.avoidances.some((a) => /delve|fast-paced|synergy/i.test(a)) ||
    (result.profile.bannedWordsAndPhrases && result.profile.bannedWordsAndPhrases.length > 0)
  );
  assert.ok(result.adaptationSummary.includes('1 exact sentence-by-sentence rewrites') || result.adaptationSummary.includes('1'));
});

