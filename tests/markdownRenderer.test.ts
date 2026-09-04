import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMediumClipboardHtml, parseMarkdownToHtml } from '../src/utils/markdownRenderer';

test('renders ordered lists as one semantic list', () => {
  const html = parseMarkdownToHtml('1. First\n2. Second');
  assert.match(html, /<ol[\s\S]*<li[\s\S]*First[\s\S]*Second[\s\S]*<\/ol>/);
  assert.equal((html.match(/<ol/g) || []).length, 1);
});

test('escapes article content and clipboard headings', () => {
  const preview = parseMarkdownToHtml('<script>alert("x")</script>');
  const clipboard = generateMediumClipboardHtml('<img src=x>', 'Safe & sound', preview);

  assert.ok(!preview.includes('<script>'));
  assert.ok(preview.includes('&lt;script&gt;'));
  assert.ok(!clipboard.includes('<img src=x>'));
  assert.ok(clipboard.includes('&lt;img src=x&gt;'));
});
