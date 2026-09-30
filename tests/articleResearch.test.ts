import assert from 'node:assert/strict';
import test from 'node:test';
import type { GenerateContentResponse, GoogleGenAI } from '@google/genai';
import { applyResearch, extractResearch, researchArticle } from '../src/server/articleResearch';
import { generateArticleLocally } from '../src/server/localArticle';

export function groundedResponse(): GenerateContentResponse {
  return {
    text: 'DOE announced an oil reserve sale. Oil reserves can buffer disruptions.',
    candidates: [{ groundingMetadata: {
      groundingChunks: [
        { web: { title: 'Department of Energy', uri: 'https://energy.gov/oil-sale' } },
        { web: { title: 'DOE duplicate', uri: 'https://energy.gov/oil-sale' } },
        { web: { title: 'Bad link', uri: 'javascript:alert(1)' } },
        { web: { title: 'Reserve background', uri: 'https://energy.gov/reserves' } },
      ],
      groundingSupports: [
        { segment: { text: 'DOE announced an oil reserve sale.' }, groundingChunkIndices: [0, 1, 2, 99] },
      ],
      searchEntryPoint: { renderedContent: '<div>Search suggestions</div>' },
    } }],
  } as unknown as GenerateContentResponse;
}

test('extracts only web sources, deduplicates and attributes evidence through chunk indices', () => {
  const { research } = extractResearch(groundedResponse());
  assert.equal(research.sources.length, 2);
  assert.deepEqual(research.sources[0].evidence, ['DOE announced an oil reserve sale.']);
  assert.deepEqual(research.sources[1].evidence, []);
  assert.equal(research.status, 'complete');
  assert.match(research.searchSuggestionsHtml!, /Search suggestions/);
});

test('adds factual and background hyperlinks using only retrieved URLs', () => {
  const result = applyResearch({
    contentMarkdown: '**DOE announced an oil reserve sale.** Learn about oil reserves. [Made up](https://fake.example/).',
    sourceSuggestions: [
      { sourceId: 'invented', anchorText: 'Made up', kind: 'claim', evidenceIndex: 0 },
      { sourceId: 'source-1', anchorText: 'DOE announced an oil reserve sale.', kind: 'claim', evidenceIndex: 0, relevance: 'An announcement, not evidence of completed sales.' },
      { sourceId: 'source-2', anchorText: 'oil reserves', kind: 'background', evidenceIndex: -1, relevance: 'Background about reserves.' },
    ],
    unresolvedClaims: ['Sale volume needs a date.', 'Sale volume needs a date.'],
  }, extractResearch(groundedResponse()));
  assert.match(result.contentMarkdown, /\*\*\[DOE announced an oil reserve sale\.\]\(https:\/\/energy.gov\/oil-sale\)\*\*/);
  assert.match(result.contentMarkdown, /\[oil reserves\]\(https:\/\/energy.gov\/reserves\)/);
  assert.ok(!result.contentMarkdown.includes('fake.example'));
  assert.deepEqual(result.research.unresolvedClaims, ['Sale volume needs a date.']);
  assert.ok(result.research.sources.every((source) => source.linked));
  assert.ok(!('sourceSuggestions' in result));
});

test('rejects claim links without attributed evidence and missing anchors', () => {
  const result = applyResearch({
    contentMarkdown: 'The US sold 100 million barrels.',
    sourceSuggestions: [
      { sourceId: 'source-2', anchorText: '100 million barrels', kind: 'claim', evidenceIndex: 0 },
      { sourceId: 'source-1', anchorText: 'not in this article', kind: 'claim', evidenceIndex: 0 },
    ],
  }, extractResearch(groundedResponse()));
  assert.equal(result.contentMarkdown, 'The US sold 100 million barrels.');
  assert.equal(result.research.unresolvedClaims.length, 1);
  assert.ok(result.research.sources.every((source) => !source.linked));
});

test('does not insert links into code examples, nested links or parts of words', () => {
  const result = applyResearch({
    contentMarkdown: '```text\noil reserves\n```\n\n`oil reserves`\n\nOilier things. oil reserves.',
    sourceSuggestions: [
      { sourceId: 'source-2', anchorText: 'Oil', kind: 'background' },
      { sourceId: 'source-2', anchorText: 'oil reserves', kind: 'background' },
      { sourceId: 'source-1', anchorText: 'oil reserves', kind: 'background' },
    ],
  }, extractResearch(groundedResponse()));
  assert.match(result.contentMarkdown, /```text\noil reserves\n```/);
  assert.match(result.contentMarkdown, /`oil reserves`/);
  assert.match(result.contentMarkdown, /Oilier things\. \[oil reserves\]/);
  assert.equal((result.contentMarkdown.match(/\]\(https:/g) || []).length, 1);
});

test('empty grounding cannot produce invented sources', () => {
  const context = extractResearch({ text: 'Claims without evidence.' } as GenerateContentResponse);
  assert.equal(context.research.status, 'no-sources');
  const result = applyResearch({ contentMarkdown: '[A claim](https://fake.example)', sourceSuggestions: [{ sourceId: 'source-1', anchorText: 'A claim', kind: 'claim' }] }, context);
  assert.equal(result.contentMarkdown, 'A claim');
  assert.deepEqual(result.research.sources, []);
});

test('research enables Google Search separately from JSON formatting and fails gracefully', async () => {
  let requested = false;
  const ai = { models: { generateContent: async (request: any) => {
    requested = true;
    assert.deepEqual(request.config.tools, [{ googleSearch: {} }]);
    assert.equal(request.config.responseMimeType, undefined);
    assert.match(request.contents, /quantities, units, dates/);
    throw new Error('Search unavailable');
  } } } as unknown as GoogleGenAI;
  const context = await researchArticle(ai, 'test-model', 'The US sold oil.');
  assert.ok(requested);
  assert.equal(context.research.status, 'unavailable');
  assert.match(context.research.notice!, /temporarily unavailable/);
});

test('failed refresh preserves existing safe links without accepting new invented links', async () => {
  const previous = applyResearch({
    contentMarkdown: 'Learn about oil reserves.',
    sourceSuggestions: [{ sourceId: 'source-2', anchorText: 'oil reserves', kind: 'background' }],
  }, extractResearch(groundedResponse()));
  const result = applyResearch({ contentMarkdown: `${previous.contentMarkdown} [New](https://fake.example).` }, {
    report: '', research: { status: 'unavailable', sources: [], unresolvedClaims: [], notice: 'Search unavailable.' },
  }, previous);
  assert.match(result.contentMarkdown, /\[oil reserves\]\(https:\/\/energy.gov\/reserves\)/);
  assert.ok(!result.contentMarkdown.includes('fake.example'));
  assert.equal(result.research.sources.length, 1);
  assert.match(result.research.sources[0].relevance!, /not rechecked/);
});

test('local generation honestly indicates that no source research took place', () => {
  const article = generateArticleLocally('The US sold 100 million barrels of oil.', {
    tone: 'thought-leadership', targetAudience: 'Readers', readingLength: 'short',
  });
  assert.equal(article.research?.status, 'local');
  assert.deepEqual(article.research.sources, []);
});
