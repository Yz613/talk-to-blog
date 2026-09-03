import { useState } from 'react';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Globe,
  ExternalLink,
  Tag,
  BarChart3,
  Lightbulb,
} from 'lucide-react';
import { ArticleSeo } from '../types';

interface SeoDashboardProps {
  seo: ArticleSeo;
  onUpdateSeo?: (updated: Partial<ArticleSeo>) => void;
}

export default function SeoDashboard({ seo, onUpdateSeo }: SeoDashboardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Score color helper
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30';
    if (score >= 70) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
  };

  const getScoreBar = (score: number) => {
    if (score >= 85) return 'bg-indigo-500';
    if (score >= 70) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  // Copy full SEO bundle for Medium story settings
  const copySeoBundle = () => {
    const bundle = `=== MEDIUM & GOOGLE SEO SETTINGS ===
SEO Title: ${seo.seoTitle}
Meta Description: ${seo.metaDescription}
Custom URL Slug: ${seo.slug}
Focus Keyword: ${seo.primaryKeyword}
Secondary Keywords: ${seo.secondaryKeywords.join(', ')}
Search Intent: ${seo.searchIntent}
`;
    copyToClipboard(bundle, 'bundle');
  };

  const titleLength = seo.seoTitle.length;
  const metaLength = seo.metaDescription.length;

  return (
    <div className="bg-[#0D0D10] border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-8">
      {/* Header with SEO Score */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/5">
        <div>
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-400" />
            <h3 className="text-xl font-serif font-light italic text-white tracking-tight">
              Automated SEO Optimization
            </h3>
          </div>
          <p className="text-xs text-white/40 mt-1">
            Real-time search engine &amp; Medium internal algorithm readiness
          </p>
        </div>

        {/* SEO Score Badge */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-white/70">SEO Health Score</div>
            <div className="text-[11px] text-white/40 font-mono">
              {seo.seoScore >= 85 ? 'High Visibility' : seo.seoScore >= 70 ? 'Good' : 'Needs Polish'}
            </div>
          </div>
          <div
            className={`flex items-center justify-center px-5 py-2 rounded-full border text-xl font-bold font-mono tracking-tight ${getScoreColor(
              seo.seoScore
            )}`}
          >
            {seo.seoScore}
            <span className="text-xs font-normal opacity-70 ml-0.5">/100</span>
          </div>
        </div>
      </div>

      {/* Google SERP Preview Simulator */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            Google Search Preview (SERP Snippet)
          </div>
          <span className="text-[11px] text-white/30">Live search engine simulation</span>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-[#0A0A0C] border border-white/5 text-left">
          {/* URL slug */}
          <div className="flex items-center gap-1.5 text-xs text-white/40 mb-1 font-mono">
            <span>https://medium.com</span>
            <span>›</span>
            <span className="text-indigo-400 font-medium">@{seo.slug || 'story'}</span>
          </div>

          {/* Clickable Title */}
          <div className="text-lg sm:text-xl font-serif font-medium text-indigo-300 hover:underline cursor-pointer leading-snug tracking-tight">
            {seo.seoTitle}
          </div>

          {/* Meta Description */}
          <p className="text-xs sm:text-sm text-white/60 mt-1.5 leading-relaxed line-clamp-2">
            {seo.metaDescription}
          </p>
        </div>
      </div>

      {/* SEO Metadata Form & Character Validation */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* SEO Title Input */}
        <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase font-bold tracking-wider text-white/50">
              SEO Title (Search Engines)
            </label>
            <span
              className={`text-[11px] font-mono ${
                titleLength >= 40 && titleLength <= 60
                  ? 'text-indigo-400 font-medium'
                  : 'text-amber-400'
              }`}
            >
              {titleLength}/60 chars
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="text"
              value={seo.seoTitle}
              onChange={(e) => onUpdateSeo?.({ seoTitle: e.target.value })}
              className="w-full text-xs font-medium p-2.5 bg-[#0D0D10] rounded-lg border border-white/10 text-white focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(seo.seoTitle, 'seoTitle')}
              className="p-2.5 text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors cursor-pointer"
              title="Copy SEO title"
            >
              {copiedField === 'seoTitle' ? (
                <Check className="w-3.5 h-3.5 text-indigo-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-white/30 mt-1.5">
            Optimized for maximum Click-Through-Rate on Google &amp; Medium topic feeds.
          </p>
        </div>

        {/* Slug Input */}
        <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase font-bold tracking-wider text-white/50">
              URL Custom Slug
            </label>
            <span className="text-[11px] text-indigo-400 font-medium font-mono">Clean &amp; Keyword Rich</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="text"
              value={seo.slug}
              onChange={(e) => onUpdateSeo?.({ slug: e.target.value })}
              className="w-full text-xs font-mono p-2.5 bg-[#0D0D10] rounded-lg border border-white/10 text-white focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(seo.slug, 'slug')}
              className="p-2.5 text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors cursor-pointer"
              title="Copy slug"
            >
              {copiedField === 'slug' ? (
                <Check className="w-3.5 h-3.5 text-indigo-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-white/30 mt-1.5">
            Can be pasted into Medium's Advanced Settings › Story URL.
          </p>
        </div>

        {/* Meta Description */}
        <div className="p-4 rounded-xl bg-[#0A0A0C] border border-white/5 md:col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase font-bold tracking-wider text-white/50">
              Meta Description
            </label>
            <span
              className={`text-[11px] font-mono ${
                metaLength >= 130 && metaLength <= 165
                  ? 'text-indigo-400 font-medium'
                  : 'text-amber-400'
              }`}
            >
              {metaLength}/160 chars
            </span>
          </div>
          <div className="flex items-start gap-1.5 mt-1">
            <textarea
              rows={2}
              value={seo.metaDescription}
              onChange={(e) => onUpdateSeo?.({ metaDescription: e.target.value })}
              className="w-full text-xs p-2.5 bg-[#0D0D10] rounded-lg border border-white/10 text-white focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(seo.metaDescription, 'metaDesc')}
              className="p-2.5 text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors cursor-pointer flex-shrink-0"
              title="Copy meta description"
            >
              {copiedField === 'metaDesc' ? (
                <Check className="w-3.5 h-3.5 text-indigo-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Target Keywords & Intent Cloud */}
      <div className="mt-6 p-4 sm:p-5 rounded-xl bg-[#0A0A0C] border border-white/5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-indigo-400" />
            Target Keywords &amp; Search Intent
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/40">Intent:</span>
            <span className="px-3 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              {seo.searchIntent}
            </span>
          </div>
        </div>

        <div className="space-y-2.5">
          {/* Primary Keyword */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/50 font-medium">Primary Target:</span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-600 text-white shadow-sm">
              {seo.primaryKeyword}
            </span>
          </div>

          {/* Secondary Keywords */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs text-white/50 font-medium mr-1">Secondary LSI:</span>
            {seo.secondaryKeywords.map((kw, i) => (
              <span
                key={i}
                className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium bg-white/5 text-white/80 border border-white/10"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* SEO Health Checks & Tips */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Checklist */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#0A0A0C] border border-white/5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-3.5 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
            Automated SEO Audit Checklist
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white">Heading Hierarchy:</span>{' '}
                <span className="text-white/60">
                  {seo.seoHealthBreakdown?.contentDepth || 'Balanced H2 & H3 subheadings for skimmability'}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white">Title Optimization:</span>{' '}
                <span className="text-white/60">
                  {seo.seoHealthBreakdown?.titleOptimization || 'High CTR formula with primary keyword'}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white">Readability &amp; Flow:</span>{' '}
                <span className="text-white/60">
                  {seo.seoHealthBreakdown?.readability || 'Short punchy paragraphs with pull quotes'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actionable Tips */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#0A0A0C] border border-white/5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-3.5 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
            Rank Booster Recommendations
          </div>
          <ul className="space-y-2 text-xs text-white/70">
            {seo.seoTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span className="leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Copy SEO Bundle */}
      <div className="mt-6 pt-5 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-white/40">
          Ready to paste into Medium's Story Settings &gt; SEO Description
        </p>
        <button
          type="button"
          onClick={copySeoBundle}
          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-white text-black hover:bg-gray-200 text-xs font-semibold transition-colors cursor-pointer"
        >
          {copiedField === 'bundle' ? (
            <>
              <Check className="w-3.5 h-3.5 text-indigo-600" />
              SEO Bundle Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy SEO Bundle for Medium
            </>
          )}
        </button>
      </div>
    </div>
  );
}
