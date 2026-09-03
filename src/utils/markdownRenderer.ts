/**
 * Markdown to HTML and Medium-friendly formatting utility.
 */

export function parseMarkdownToHtml(markdown: string): string {
  if (!markdown) return '';

  let html = markdown
    // Normalize newlines
    .replace(/\r\n/g, '\n')
    // Escape standard HTML tags for security
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Re-enable blockquotes that were escaped
  html = html.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');

  // Code blocks (```language ... ```)
  html = html.replace(/```([\s\S]*?)```/gm, (_match, code) => {
    return `<pre class="bg-[#0D0D10] text-indigo-200 border border-white/10 p-5 rounded-xl my-6 overflow-x-auto text-sm font-mono leading-relaxed"><code>${code.trim()}</code></pre>`;
  });

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code class="bg-white/5 text-indigo-300 px-2 py-0.5 rounded font-mono text-xs border border-white/10">$1</code>');

  // Headers (## and ###)
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-xl font-serif font-light italic text-white tracking-tight mt-8 mb-3">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-2xl sm:text-3xl font-serif font-light italic text-white tracking-tight mt-10 mb-4">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-3xl sm:text-4xl font-serif font-light italic text-white tracking-tight mt-12 mb-6">$1</h1>');

  // Bold & Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong class="text-white font-semibold"><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em class="text-white/90">$1</em>');

  // Unordered list items
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li class="ml-4 list-disc text-white/80 leading-relaxed my-1.5 font-serif">$1</li>');

  // Group consecutive <li> items into <ul>
  html = html.replace(/(<li.*<\/li>\n?)+/g, (match) => {
    return `<ul class="my-5 pl-4 space-y-1">${match}</ul>`;
  });

  // Ordered list items
  html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<li class="ml-4 list-decimal text-white/80 leading-relaxed my-1.5 font-serif">$1</li>');

  // Group consecutive <blockquote> items
  html = html.replace(/(<blockquote>[\s\S]*?<\/blockquote>\n?)+/g, (match) => {
    const cleaned = match.replace(/<\/?blockquote>/g, ' ').trim();
    return `<blockquote class="p-6 border-l-2 border-indigo-500 bg-indigo-500/5 my-10 italic text-xl text-white font-serif rounded-r-xl">${cleaned}</blockquote>`;
  });

  // Paragraphs (double newlines)
  const blocks = html.split(/\n\n+/);
  html = blocks
    .map((block) => {
      block = block.trim();
      if (!block) return '';
      if (
        block.startsWith('<h') ||
        block.startsWith('<ul') ||
        block.startsWith('<ol') ||
        block.startsWith('<pre') ||
        block.startsWith('<blockquote')
      ) {
        return block;
      }
      return `<p class="my-6 text-lg sm:text-[19px] leading-[1.8] text-white/80 font-serif">${block.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  return html;
}

/**
 * Generates clean rich HTML specifically structured to paste directly into Medium's editor,
 * preserving Medium headings, blockquotes, and lists.
 */
export function generateMediumClipboardHtml(
  title: string,
  subtitle: string,
  contentMarkdown: string
): string {
  const bodyHtml = parseMarkdownToHtml(contentMarkdown);
  return `
    <div style="font-family: Georgia, serif; line-height: 1.8; color: #242424;">
      <h1 style="font-size: 38px; font-weight: 700; line-height: 1.25; margin-bottom: 8px;">${title}</h1>
      <h2 style="font-size: 22px; font-weight: 400; color: #6b6b6b; margin-top: 0; margin-bottom: 24px;">${subtitle}</h2>
      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
      ${bodyHtml}
    </div>
  `.trim();
}

/**
 * Copies rich HTML and plain text to the clipboard so it pastes formatted into Medium.
 */
export async function copyFormattedTextToClipboard(
  title: string,
  subtitle: string,
  contentMarkdown: string
): Promise<boolean> {
  const html = generateMediumClipboardHtml(title, subtitle, contentMarkdown);
  const plainText = `# ${title}\n\n*${subtitle}*\n\n${contentMarkdown}`;

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const item = new ClipboardItem({
        'text/plain': textBlob,
        'text/html': htmlBlob,
      });
      await navigator.clipboard.write([item]);
      return true;
    } else {
      await navigator.clipboard.writeText(plainText);
      return true;
    }
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    return false;
  }
}
