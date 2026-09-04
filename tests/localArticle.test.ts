import assert from 'node:assert/strict';
import test from 'node:test';
import { generateArticleLocally, refineArticleLocally } from '../src/server/localArticle';

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
