import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanSpeechLocally, formatListsLocally } from '../src/utils/speechPolisher';
import {
  applyWordReplacements,
  applyCustomVocabularyCasing,
  formatWithPersonalDictionary,
} from '../src/utils/dictionary';

test('cleanSpeechLocally removes hesitation fillers and parenthetical disfluencies', () => {
  const input = 'um hello uh world er test, you know, this is great. I mean, it really works.';
  const cleaned = cleanSpeechLocally(input);

  assert.ok(!cleaned.includes('um'));
  assert.ok(!cleaned.includes('uh'));
  assert.ok(!cleaned.includes('er'));
  assert.ok(!cleaned.includes('you know'));
  assert.ok(!cleaned.includes('I mean'));
  assert.equal(cleaned, 'Hello world test this is great. It really works.');
});

test('cleanSpeechLocally strips stutters and clipped false starts while preserving compound words', () => {
  const input = 'it it will will work on-device with real-time speed. The twin- the pinned tweet.';
  const cleaned = cleanSpeechLocally(input);

  assert.ok(!cleaned.includes('it it'));
  assert.ok(!cleaned.includes('will will'));
  assert.ok(!cleaned.includes('twin-'));
  assert.ok(cleaned.includes('on-device'));
  assert.ok(cleaned.includes('real-time'));
  assert.ok(cleaned.includes('pinned tweet'));
});

test('formatListsLocally transforms spoken ordinals into numbered lists', () => {
  const input = 'First, buy milk. Second, walk the dog. Third, call mom.';
  const formatted = cleanSpeechLocally(input);

  assert.equal(formatted, '1. Buy milk\n2. Walk the dog\n3. Call mom');
});

test('formatListsLocally transforms spoken bullet points and colon lists', () => {
  const bullets = cleanSpeechLocally('Bullet: check server status. Bullet: restart cluster.');
  assert.equal(bullets, '- Check server status\n- Restart cluster.');

  const colon = cleanSpeechLocally('Tasks to do: buy groceries, clean kitchen, and walk dog.');
  assert.equal(colon, 'Tasks to do:\n\n- Buy groceries\n- Clean kitchen\n- Walk dog');
});

test('applyWordReplacements replaces exact words and multi-word phrases case-insensitively', () => {
  const replacements = [
    { id: '1', from: 'panoptic', to: 'Panoptyc' },
    { id: '2', from: 'pan optic', to: 'Panoptyc' },
    { id: '3', from: 'vox scribe', to: 'VoxScribe' },
  ];

  const res1 = applyWordReplacements('I love panoptic software', replacements);
  assert.equal(res1, 'I love Panoptyc software');

  const res2 = applyWordReplacements('Welcome to vox scribe today', replacements);
  assert.equal(res2, 'Welcome to VoxScribe today');

  const res3 = applyWordReplacements('Our product pan optic is live', replacements);
  assert.equal(res3, 'Our product Panoptyc is live');
});

test('applyCustomVocabularyCasing enforces exact casing of proper nouns', () => {
  const vocab = ['Panoptyc', 'Kubernetes', 'Next.js', 'Medium'];
  const text = 'We deploy panoptyc to kubernetes using next.js and publish to medium';

  const res = applyCustomVocabularyCasing(text, vocab);
  assert.equal(res, 'We deploy Panoptyc to Kubernetes using Next.js and publish to Medium');
});

test('formatWithPersonalDictionary integrates both replacements and custom casing', () => {
  const replacements = [{ id: '1', from: 'panoptic', to: 'Panoptyc' }];
  const vocab = ['Panoptyc', 'OpenHandy'];

  const formatted = formatWithPersonalDictionary(
    'I work at panoptic using openhandy',
    replacements,
    vocab
  );
  assert.equal(formatted, 'I work at Panoptyc using OpenHandy');
});
