import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateArticleLocally,
  refineArticleLocally,
  adaptVoiceLocally,
} from '../src/server/localArticle';

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

