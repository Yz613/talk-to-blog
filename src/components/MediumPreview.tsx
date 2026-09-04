import { useState, FormEvent } from 'react';
import {
  Copy,
  Check,
  Download,
  Edit3,
  Eye,
  Tag,
  Plus,
  X,
  Sparkles,
  BookOpen,
  Share2,
  Clock,
  ThumbsUp,
  Bookmark,
  Layers,
  CheckCircle2,
  Wand2,
} from 'lucide-react';
import { MediumArticle, TagItem } from '../types';
import {
  parseMarkdownToHtml,
  copyFormattedTextToClipboard,
} from '../utils/markdownRenderer';

interface MediumPreviewProps {
  article: MediumArticle;
  onUpdateArticle: (updated: Partial<MediumArticle>) => void;
  onRefineSection: (instruction: string) => Promise<void>;
  isRefining: boolean;
}

export default function MediumPreview({
  article,
  onUpdateArticle,
  onRefineSection,
  isRefining,
}: MediumPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [customRefineText, setCustomRefineText] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [claps, setClaps] = useState(48);
  const [isSaved, setIsSaved] = useState(false);

  // Copy rich HTML for pasting into Medium editor
  const handleCopyForMedium = async () => {
    const success = await copyFormattedTextToClipboard(
      article.title,
      article.subtitle,
      article.contentMarkdown
    );
    if (success) {
      setCopiedFormat('medium');
      setTimeout(() => setCopiedFormat(null), 2500);
    } else {
      alert('Failed to copy to clipboard.');
    }
  };

  // Copy pure Markdown
  const handleCopyMarkdown = () => {
    const fullMd = `# ${article.title}\n\n*${article.subtitle}*\n\n${article.contentMarkdown}`;
    navigator.clipboard.writeText(fullMd);
    setCopiedFormat('markdown');
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  // Download Markdown file with frontmatter
  const handleDownloadMarkdown = () => {
    const frontmatter = `---
title: "${article.title.replace(/"/g, '\\"')}"
subtitle: "${article.subtitle.replace(/"/g, '\\"')}"
slug: "${article.seo.slug}"
seoTitle: "${article.seo.seoTitle.replace(/"/g, '\\"')}"
metaDescription: "${article.seo.metaDescription.replace(/"/g, '\\"')}"
tags: [${article.tags.primaryMediumTags.map((t) => `"${t.tag}"`).join(', ')}]
date: "${new Date().toISOString().split('T')[0]}"
readTime: "${article.readTimeMinutes} min read"
---

${article.contentMarkdown}
`;

    const blob = new Blob([frontmatter], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${article.seo.slug || 'medium-article'}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Swap title with one of the AI alternatives
  const handleSwapTitle = (altTitle: string) => {
    const currentTitle = article.title;
    const newAlternatives = article.alternativeTitles
      .filter((t) => t !== altTitle)
      .concat(currentTitle);
    onUpdateArticle({
      title: altTitle,
      alternativeTitles: newAlternatives,
    });
  };

  // Remove a tag from the primary 5
  const handleRemoveTag = (indexToRemove: number) => {
    const updatedTags = article.tags.primaryMediumTags.filter((_, i) => i !== indexToRemove);
    onUpdateArticle({
      tags: {
        ...article.tags,
        primaryMediumTags: updatedTags,
      },
    });
  };

  // Add tag from alternative suggestions
  const handleAddAlternativeTag = (altTag: string) => {
    if (article.tags.primaryMediumTags.length >= 5) {
      alert("Medium only allows up to 5 tags per story. Remove one tag first to add another.");
      return;
    }

    const newTagItem: TagItem = {
      tag: altTag,
      popularity: 'High',
      relevanceReason: 'Suggested alternative topic',
    };

    const updatedPrimary = [...article.tags.primaryMediumTags, newTagItem];
    const updatedAlt = article.tags.alternativeTags.filter((t) => t !== altTag);

    onUpdateArticle({
      tags: {
        primaryMediumTags: updatedPrimary,
        alternativeTags: updatedAlt,
      },
    });
  };

  // Add custom tag
  const handleAddCustomTag = (e: FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim()) return;
    if (article.tags.primaryMediumTags.length >= 5) {
      alert("Medium only allows up to 5 tags per story. Remove one first.");
      return;
    }

    const newTagItem: TagItem = {
      tag: newTagInput.trim(),
      popularity: 'Custom',
      relevanceReason: 'User specified',
    };

    onUpdateArticle({
      tags: {
        ...article.tags,
        primaryMediumTags: [...article.tags.primaryMediumTags, newTagItem],
      },
    });
    setNewTagInput('');
  };

  // Refine action presets
  const REFINE_PRESETS = [
    'Make the opening hook more dramatic and magnetic',
    'Add a concrete real-world framework or case example',
    'Strengthen the closing takeaway and call-to-discussion',
    'Increase punchiness and shorten longer sentences',
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Top Action Toolbar */}
      <div className="bg-[#0D0D10] border border-white/10 rounded-2xl shadow-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {article.generationMode === 'local' ? 'Local Draft Ready' : 'Medium Publication Ready'}
          </span>
          <span className="text-xs text-white/40 font-mono">
            {article.readTimeMinutes} min read • {article.wordCount} words
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Edit View */}
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors cursor-pointer"
          >
            {isEditing ? (
              <>
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                Reading View
              </>
            ) : (
              <>
                <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                Edit Markdown
              </>
            )}
          </button>

          {/* Copy Markdown */}
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors cursor-pointer"
          >
            {copiedFormat === 'markdown' ? (
              <>
                <Check className="w-3.5 h-3.5 text-indigo-400" />
                Copied .md
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-white/50" />
                Copy Markdown
              </>
            )}
          </button>

          {/* Download Markdown */}
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors cursor-pointer"
            title="Download .md file with frontmatter"
          >
            <Download className="w-3.5 h-3.5 text-white/50" />
            Download .md
          </button>

          {/* Prominent One-Click Copy for Medium */}
          <button
            type="button"
            id="copy-for-medium-btn"
            onClick={handleCopyForMedium}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-black bg-white hover:bg-gray-200 rounded-full transition-all shadow-md cursor-pointer"
          >
            {copiedFormat === 'medium' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                Formatted &amp; Ready to Paste in Medium!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-indigo-600" />
                Copy for Medium Editor
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alternative Headlines Picker */}
      {article.alternativeTitles && article.alternativeTitles.length > 0 && (
        <div className="bg-[#0D0D10] border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400 mb-2.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Alternative Medium Headlines (Click to swap)
          </div>
          <div className="flex flex-wrap gap-2">
            {article.alternativeTitles.map((altTitle, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSwapTitle(altTitle)}
                className="text-left text-xs bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 hover:border-indigo-500/30 rounded-full px-3.5 py-1.5 transition-colors cursor-pointer"
              >
                "{altTitle}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Article Container */}
      <div className="bg-[#0D0D10] border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-12 transition-all">
        {isEditing ? (
          /* Editable Mode */
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1.5">
                Story Title
              </label>
              <input
                type="text"
                value={article.title}
                onChange={(e) => onUpdateArticle({ title: e.target.value })}
                className="w-full text-2xl font-light italic p-3.5 bg-[#0A0A0C] border border-white/10 rounded-xl font-serif text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1.5">
                Story Subtitle
              </label>
              <input
                type="text"
                value={article.subtitle}
                onChange={(e) => onUpdateArticle({ subtitle: e.target.value })}
                className="w-full text-lg text-white/80 p-3.5 bg-[#0A0A0C] border border-white/10 rounded-xl font-serif focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1.5">
                Article Markdown Body
              </label>
              <textarea
                rows={18}
                value={article.contentMarkdown}
                onChange={(e) => onUpdateArticle({ contentMarkdown: e.target.value })}
                className="w-full p-4 bg-[#0A0A0C] border border-white/10 rounded-xl font-mono text-xs leading-relaxed text-indigo-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        ) : (
          /* Authentic Medium Reading Preview */
          <div>
            <div className="text-indigo-400 font-mono text-xs uppercase tracking-widest mb-3">
              MEDIUM STORY DRAFT
            </div>
            {/* Story Title & Subtitle */}
            <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-serif font-light text-white tracking-tight leading-[1.2] italic mb-3">
              {article.title}
            </h1>
            <p className="text-xl sm:text-2xl text-white/60 leading-relaxed font-serif font-normal mb-8 italic">
              {article.subtitle}
            </p>

            {/* Medium Author / Publication Bar */}
            <div className="flex items-center justify-between pb-8 mb-8 border-b border-white/5">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-lg shadow-indigo-600/25">
                  M
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      Author Draft
                    </span>
                    <span className="text-xs text-white/30">•</span>
                    <span className="text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer">
                      Follow
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5 font-mono">
                    <span>{article.readTimeMinutes} min read</span>
                    <span>•</span>
                    <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              {/* Medium Interactions Mockup */}
              <div className="flex items-center gap-4 text-white/50">
                <button
                  type="button"
                  onClick={() => setClaps((c) => c + 1)}
                  className="flex items-center gap-1.5 text-xs hover:text-white transition-colors cursor-pointer"
                  title="Applause"
                >
                  <ThumbsUp className="w-4 h-4 text-white/60 hover:scale-110 transition-transform" />
                  <span>{claps}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSaved(!isSaved)}
                  className={`transition-colors cursor-pointer ${
                    isSaved ? 'text-indigo-400' : 'hover:text-white'
                  }`}
                  title="Bookmark"
                >
                  <Bookmark className="w-4 h-4 fill-current" />
                </button>
              </div>
            </div>

            {/* Executive Summary Callout */}
            {article.executiveSummary && (
              <div className="p-6 border-l-2 border-indigo-500 bg-indigo-500/5 my-8 italic text-lg text-white/90 font-serif leading-relaxed rounded-r-xl">
                <span className="text-indigo-400 font-mono text-xs uppercase tracking-widest block not-italic mb-1 font-bold">
                  Core Thesis:
                </span>
                {article.executiveSummary}
              </div>
            )}

            {/* Formatted HTML Article Content */}
            <div
              className="medium-article-content max-w-none font-serif"
              dangerouslySetInnerHTML={{
                __html: parseMarkdownToHtml(article.contentMarkdown),
              }}
            />
          </div>
        )}

        {/* Medium Tags Bar */}
        <div className="mt-12 pt-8 border-t border-white/5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-indigo-400" />
              Medium Story Tags ({article.tags.primaryMediumTags.length}/5 Limit)
            </div>
            <span className="text-[11px] text-white/30">
              Medium accepts maximum 5 tags per story
            </span>
          </div>

          {/* Active 5 Tags */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {article.tags.primaryMediumTags.map((tagItem, i) => (
              <div
                key={i}
                className="group inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-white/5 hover:bg-white/10 text-white/80 transition-colors border border-white/10"
                title={`${tagItem.relevanceReason} (Popularity: ${tagItem.popularity})`}
              >
                <span>{tagItem.tag}</span>
                <span className="text-[10px] text-white/40 font-mono">
                  ({tagItem.popularity})
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(i)}
                  className="text-white/40 hover:text-rose-400 ml-0.5 cursor-pointer"
                  title="Remove tag"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Add Custom Tag Form */}
            {article.tags.primaryMediumTags.length < 5 && (
              <form onSubmit={handleAddCustomTag} className="inline-flex items-center">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="+ Add tag"
                  className="px-3.5 py-1.5 text-xs bg-transparent border border-dashed border-white/20 rounded-full focus:outline-none focus:border-indigo-500 w-28 text-white placeholder-white/30"
                />
              </form>
            )}
          </div>

          {/* Suggested Alternative Tags (Click to add) */}
          {article.tags.alternativeTags && article.tags.alternativeTags.length > 0 && (
            <div className="p-3 bg-[#0A0A0C] rounded-xl border border-white/5">
              <span className="text-[11px] font-semibold text-white/40 mr-2">
                Suggested Alternatives:
              </span>
              <div className="inline-flex flex-wrap gap-1.5 mt-1 sm:mt-0">
                {article.tags.alternativeTags.map((altTag, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleAddAlternativeTag(altTag)}
                    disabled={article.tags.primaryMediumTags.length >= 5}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-white/5 text-white/70 border border-white/10 hover:border-indigo-500/40 hover:text-indigo-300 transition-colors cursor-pointer disabled:opacity-40"
                    title="Click to add tag"
                  >
                    <Plus className="w-3 h-3 text-indigo-400" />
                    {altTag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Publication Recommendations */}
        {article.suggestedPublications && article.suggestedPublications.length > 0 && (
          <div className="mt-6 pt-6 border-t border-white/5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-white/40 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              Recommended Medium Publications to Submit:
            </span>
            {article.suggestedPublications.map((pub, i) => (
              <span
                key={i}
                className="px-3 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
              >
                {pub}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* AI Section Refiner Bar */}
      <div className="bg-[#0A0A0C] text-white rounded-2xl border border-indigo-500/20 shadow-2xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <Wand2 className="w-4 h-4 text-indigo-400" />
          <h4 className="text-sm font-bold tracking-tight text-white">
            AI Section Refiner &amp; Polish Assistant
          </h4>
        </div>
        <p className="text-xs text-white/40 mb-4">
          Want to tweak the story tone, punch up a section, or add extra depth? Click a preset or type an instruction.
        </p>

        {/* Presets */}
        <div className="flex flex-wrap gap-2 mb-4">
          {REFINE_PRESETS.map((preset, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onRefineSection(preset)}
              disabled={isRefining}
              className="text-left text-xs bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/30 text-white/70 hover:text-white rounded-full px-3.5 py-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Custom refinement input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (customRefineText.trim()) {
              onRefineSection(customRefineText.trim());
              setCustomRefineText('');
            }
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={customRefineText}
            onChange={(e) => setCustomRefineText(e.target.value)}
            placeholder="e.g. Expand on the third point with a tangible coding example..."
            disabled={isRefining}
            className="w-full text-xs bg-[#0D0D10] border border-white/10 rounded-full px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!customRefineText.trim() || isRefining}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            {isRefining ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Refine'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
