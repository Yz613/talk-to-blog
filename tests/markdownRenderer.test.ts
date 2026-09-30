import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMediumClipboardHtml, parseMarkdownToHtml } from '../src/utils/markdownRenderer';
import { safeWebUrl } from '../src/utils/markdownLinks';

test('renders ordered lists as one semantic list', () => {
  const html = parseMarkdownToHtml('1. First\n2. Second');
  assert.match(html, /<ol[\s\S]*<li[\s\S]*First[\s\S]*Second[\s\S]*<\/ol>/);
  assert.equal((html.match(/<ol/g) || []).length, 1);
});

test('renders source links and preserves query strings in preview and Medium HTML', () => {
  const markdown = 'See **[DOE report](https://energy.gov/report?year=2026&sort=asc)**.';
  for (const html of [parseMarkdownToHtml(markdown), generateMediumClipboardHtml('Title', 'Subtitle', markdown)]) {
    assert.match(html, /href="https:\/\/energy.gov\/report\?year=2026&amp;sort=asc"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /<strong[^>]*><a[^>]*>DOE report<\/a><\/strong>/);
  }
});

test('renders links in headings, quotes and lists and handles parentheses in URLs', () => {
  const html = parseMarkdownToHtml('## [Background](https://example.org/topic_(oil))\n\n> [Report](https://energy.gov/report)\n\n- [Data](https://energy.gov/data)');
  assert.equal((html.match(/<a /g) || []).length, 3);
  assert.match(html, /topic_%28oil%29/);
});

test('rejects unsafe links, escapes labels and leaves links inside code alone', () => {
  const html = parseMarkdownToHtml('[Click](javascript:alert(1)) [Bad](data:text/html,<script>) [<img src=x>](https://example.org) `[Code](https://example.org)`');
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('href="data:'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img src=x&gt;/);
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.match(html, /<code[^>]*>\[Code\]\(https:\/\/example.org\)<\/code>/);
  for (const url of ['//evil.example', 'javascript:alert(1)', 'https://a.example/"onmouseover="x', 'https://user:secret@example.org', 'https://example.org/\npath']) {
    assert.equal(safeWebUrl(url), null);
  }
});

test('escapes article content and clipboard headings', () => {
  const preview = parseMarkdownToHtml('<script>alert("x")</script>');
  const clipboard = generateMediumClipboardHtml('<img src=x>', 'Safe & sound', preview);

  assert.ok(!preview.includes('<script>'));
  assert.ok(preview.includes('&lt;script&gt;'));
  assert.ok(!clipboard.includes('<img src=x>'));
  assert.ok(clipboard.includes('&lt;img src=x&gt;'));
});
