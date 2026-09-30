import assert from 'node:assert/strict';
import test from 'node:test';
import type { GenerateContentResponse } from '@google/genai';
import { generateArticleLocally } from '../src/server/localArticle';
import type { MediumArticle } from '../src/types';

test('article APIs research generation and revisions, while retaining offline and failed-search drafts', async (t) => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const { app } = await import('../server');
  if (originalEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnv;
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const queue: Array<GenerateContentResponse | Error> = [];
  const requests: any[] = [];
  const fetchLocal = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push({ config: { ...body.generationConfig, tools: body.tools }, contents: body.contents.flatMap((content: any) => content.parts.map((part: any) => part.text)).join('\n') });
    const next = queue.shift();
    assert.ok(next, 'Every Gemini request must have an explicit test response');
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify({ candidates: [{
      ...next.candidates?.[0], content: { role: 'model', parts: [{ text: next.text }] },
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const post = async (route: string, body: unknown, key = 'test-key-for-mocked-gemini') => {
    const response = await fetchLocal(`${base}${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gemini-api-key': key }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return await response.json() as MediumArticle;
  };
  const grounding = {
    text: 'Oil reserves help buffer supply disruptions.',
    candidates: [{ groundingMetadata: {
      groundingChunks: [{ web: { title: 'DOE reserve overview', uri: 'https://energy.gov/reserves' } }],
      groundingSupports: [{ segment: { text: 'Oil reserves help buffer supply disruptions.' }, groundingChunkIndices: [0] }],
    } }],
  } as unknown as GenerateContentResponse;
  const drafted = {
    ...generateArticleLocally('Oil reserves help buffer supply disruptions.', { tone: 'thought-leadership', targetAudience: 'Readers', readingLength: 'short' }),
    contentMarkdown: 'Oil reserves help buffer supply disruptions.',
    sourceSuggestions: [{ sourceId: 'source-1', anchorText: 'Oil reserves', kind: 'background', evidenceIndex: -1, relevance: 'An overview of reserves.' }],
    unresolvedClaims: [],
  };
  queue.push(grounding, { text: JSON.stringify(drafted) } as GenerateContentResponse);
  const generated = await post('/api/generate-article', { transcript: 'I want to write about oil reserves.' });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].config.tools, [{ googleSearch: {} }]);
  assert.equal(requests[1].config.responseMimeType, 'application/json');
  assert.match(requests[1].contents, /source-1/);
  assert.match(generated.contentMarkdown, /\[Oil reserves\]\(https:\/\/energy.gov\/reserves\)/);
  assert.equal(generated.research.status, 'complete');
  assert.equal(generated.generationMode, 'ai');

  queue.push(grounding, { text: JSON.stringify({ ...drafted, revisionSummary: 'Added sources.' }) } as GenerateContentResponse);
  const refined = await post('/api/refine-article', { article: generated, instruction: 'Find supporting sources.' });
  assert.match(refined.contentMarkdown, /\[Oil reserves\]/);
  assert.equal(refined.research.status, 'complete');

  queue.push(new Error('Google Search temporarily unavailable'), {
    text: JSON.stringify({ ...drafted, sourceSuggestions: [], unresolvedClaims: ['Research is unavailable; review this claim.'] }),
  } as GenerateContentResponse);
  const unavailable = await post('/api/generate-article', { transcript: 'Oil reserves matter.' });
  assert.equal(unavailable.research.status, 'unavailable');
  assert.equal(unavailable.contentMarkdown, drafted.contentMarkdown);
  assert.equal(unavailable.research.unresolvedClaims.length, 1);

  const beforeLocal = requests.length;
  const local = await post('/api/generate-article', { transcript: 'Oil reserves matter.' }, 'no');
  assert.equal(local.generationMode, 'local');
  assert.equal(local.research.status, 'local');
  assert.equal(requests.length, beforeLocal);
  assert.equal(queue.length, 0);
});
