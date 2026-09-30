import { ExternalLink, Search, LoaderCircle } from 'lucide-react';
import type { MediumArticle } from '../types';
import { safeWebUrl, tokenizeInline } from '../utils/markdownLinks';

interface ArticleSourcesProps {
  article: MediumArticle;
  isRefining: boolean;
  canResearch: boolean;
  onResearch: (instruction: string) => Promise<void>;
}

export default function ArticleSources({ article, isRefining, canResearch, onResearch }: ArticleSourcesProps) {
  const research = article.research;
  const sources = (research?.sources || []).filter((source) => safeWebUrl(source.url));
  const linkedUrls = new Set(article.contentMarkdown.split(/(```[\s\S]*?(?:```|$))/g)
    .filter((_, index) => index % 2 === 0)
    .flatMap((block) => block.split('\n').flatMap(tokenizeInline))
    .filter((token) => token.type === 'link').map((token) => token.url));

  return (
    <section className="bg-[#0D0D10] border border-white/10 rounded-2xl p-6 sm:p-8" aria-label="Sources and fact review">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Search className="w-4 h-4 text-indigo-400" /> Sources &amp; Fact Review
        </h3>
        <button
          type="button"
          onClick={() => void onResearch('Find supporting sources and add natural hyperlinks. Preserve the current wording and voice wherever possible. Check factual claims, numbers and dates; correct only clearly established errors and flag uncertainty. Add relevant background reading for broad topics. Explain any corrections in the revision summary.')}
          disabled={isRefining || !canResearch}
          title={canResearch ? 'Research facts and find relevant background sources' : 'Connect Gemini to research sources'}
          className="inline-flex items-center gap-2 text-xs px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 cursor-pointer"
        >
          {isRefining ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          {isRefining ? 'Researching & refining…' : sources.length ? 'Refresh sources' : 'Find supporting sources'}
        </button>
      </div>
      <p className="text-xs text-white/50 leading-relaxed">
        Evidence for specific claims and background reading for your story. Linked phrases carry through to Medium copy and Markdown export.
      </p>
      {research?.notice && <p className="mt-3 text-sm text-amber-200">{research.notice}</p>}
      {!research && <p className="mt-3 text-sm text-white/60">This saved draft has not been researched yet. Find sources for your facts and broader themes.</p>}
      {sources.length > 0 && (
        <ul className="mt-4 space-y-3">
          {sources.map((source) => (
            <li key={source.id} className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
              <div className="flex flex-wrap gap-2 items-center">
                <a href={safeWebUrl(source.url)!} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-300 hover:text-indigo-200 underline underline-offset-4 inline-flex items-center gap-1.5">
                  {source.title} <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
                <span className="text-[10px] text-white/50 border border-white/10 rounded-full px-2 py-0.5">
                  {source.kind === 'claim' ? 'Claim evidence' : source.kind === 'background' ? 'Background reading' : 'Research source'}
                </span>
                {linkedUrls.has(safeWebUrl(source.url)!) && <span className="text-[10px] text-emerald-300">Linked in article</span>}
              </div>
              {source.relevance && <p className="text-xs text-white/60 mt-2 leading-relaxed">{source.relevance}</p>}
              {source.evidence.length > 0 && (
                <details className="mt-2 text-xs text-white/50">
                  <summary className="cursor-pointer hover:text-white/80">View research context</summary>
                  <p className="mt-2 text-white/40">Search-grounded summary; this is not a direct quotation from the source.</p>
                  {source.evidence.map((text, index) => <p key={index} className="mt-2 leading-relaxed">{text}</p>)}
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {Boolean(research?.unresolvedClaims.length) && (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h4 className="text-sm font-medium text-amber-200">Claims to review before publishing</h4>
          <ul className="mt-2 list-disc pl-5 space-y-2 text-xs text-amber-100/80 leading-relaxed">
            {research!.unresolvedClaims.map((claim, index) => <li key={index}>{claim}</li>)}
          </ul>
        </div>
      )}
      {research?.searchedAt && <p className="text-[11px] text-white/30 mt-4">Sources searched {new Date(research.searchedAt).toLocaleString()}. Refresh after changing facts or adding claims.</p>}
      {research?.searchSuggestionsHtml && (
        <iframe
          title="Google Search suggestions"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https:; base-uri 'none'; form-action 'none'"><base target="_blank">${research.searchSuggestionsHtml}`}
          className="mt-4 w-full border-0 rounded-lg bg-white"
          style={{ height: 180 }}
        />
      )}
    </section>
  );
}
