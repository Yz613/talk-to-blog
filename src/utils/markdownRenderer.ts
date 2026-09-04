/** A deliberately small, escaped Markdown renderer for article previews and Medium copy. */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code class="bg-white/5 text-indigo-300 px-2 py-0.5 rounded font-mono text-xs border border-white/10">$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="text-white font-semibold"><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-white/90">$1</em>');
}

export function parseMarkdownToHtml(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let paragraph: string[] = [];
  let unordered: string[] = [];
  let ordered: string[] = [];
  let quotes: string[] = [];
  let code: string[] = [];
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(`<p class="my-6 text-lg sm:text-[19px] leading-[1.8] text-white/80 font-serif">${paragraph.map(renderInline).join(' ')}</p>`);
      paragraph = [];
    }
  };
  const flushUnordered = () => {
    if (unordered.length) {
      output.push(`<ul class="my-5 pl-4 space-y-1">${unordered.map((item) => `<li class="ml-4 list-disc text-white/80 leading-relaxed my-1.5 font-serif">${renderInline(item)}</li>`).join('')}</ul>`);
      unordered = [];
    }
  };
  const flushOrdered = () => {
    if (ordered.length) {
      output.push(`<ol class="my-5 pl-4 space-y-1">${ordered.map((item) => `<li class="ml-4 list-decimal text-white/80 leading-relaxed my-1.5 font-serif">${renderInline(item)}</li>`).join('')}</ol>`);
      ordered = [];
    }
  };
  const flushQuotes = () => {
    if (quotes.length) {
      output.push(`<blockquote class="p-6 border-l-2 border-indigo-500 bg-indigo-500/5 my-10 italic text-xl text-white font-serif rounded-r-xl">${quotes.map(renderInline).join(' ')}</blockquote>`);
      quotes = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushUnordered();
    flushOrdered();
    flushQuotes();
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        output.push(`<pre class="bg-[#0D0D10] text-indigo-200 border border-white/10 p-5 rounded-xl my-6 overflow-x-auto text-sm font-mono leading-relaxed"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        flushAll();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const classes = level === 1
        ? 'text-3xl sm:text-4xl font-serif font-light italic text-white tracking-tight mt-12 mb-6'
        : level === 2
          ? 'text-2xl sm:text-3xl font-serif font-light italic text-white tracking-tight mt-10 mb-4'
          : 'text-xl font-serif font-light italic text-white tracking-tight mt-8 mb-3';
      output.push(`<h${level} class="${classes}">${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const unorderedItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (unorderedItem) {
      flushParagraph();
      flushOrdered();
      flushQuotes();
      unordered.push(unorderedItem[1]);
      continue;
    }

    const orderedItem = line.match(/^\s*\d+\.\s+(.+)$/);
    if (orderedItem) {
      flushParagraph();
      flushUnordered();
      flushQuotes();
      ordered.push(orderedItem[1]);
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushUnordered();
      flushOrdered();
      quotes.push(quote[1]);
      continue;
    }

    flushUnordered();
    flushOrdered();
    flushQuotes();
    paragraph.push(line.trim());
  }

  if (inCode && code.length) {
    output.push(`<pre class="bg-[#0D0D10] text-indigo-200 border border-white/10 p-5 rounded-xl my-6 overflow-x-auto text-sm font-mono leading-relaxed"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  }
  flushAll();
  return output.join('\n');
}

export function generateMediumClipboardHtml(
  title: string,
  subtitle: string,
  contentMarkdown: string,
): string {
  return `
    <div style="font-family: Georgia, serif; line-height: 1.8; color: #242424;">
      <h1 style="font-size: 38px; font-weight: 700; line-height: 1.25; margin-bottom: 8px;">${escapeHtml(title)}</h1>
      <h2 style="font-size: 22px; font-weight: 400; color: #6b6b6b; margin-top: 0; margin-bottom: 24px;">${escapeHtml(subtitle)}</h2>
      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
      ${parseMarkdownToHtml(contentMarkdown)}
    </div>
  `.trim();
}

export async function copyFormattedTextToClipboard(
  title: string,
  subtitle: string,
  contentMarkdown: string,
): Promise<boolean> {
  const html = generateMediumClipboardHtml(title, subtitle, contentMarkdown);
  const plainText = `# ${title}\n\n*${subtitle}*\n\n${contentMarkdown}`;

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(plainText);
    }
    return true;
  } catch (error) {
    console.error('Clipboard copy failed:', error);
    return false;
  }
}
