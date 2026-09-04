import { useState, useRef, FormEvent } from 'react';
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
  CheckCircle2,
  Wand2,
  Columns,
  Bold,
  Italic,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
  Code,
  LoaderCircle,
} from 'lucide-react';
import { MediumArticle, TagItem, VoiceProfile } from '../types';
import {
  parseMarkdownToHtml,
  copyFormattedTextToClipboard,
} from '../utils/markdownRenderer';

export type EditorViewMode = 'edit' | 'split' | 'preview';

interface MediumPreviewProps {
  article: MediumArticle;
  voiceProfile?: VoiceProfile | null;
  onUpdateArticle: (updated: Partial<MediumArticle>) => void;
  onRefineSection: (instruction: string) => Promise<void>;
  onSyncVoiceFromEdits?: () => Promise<void>;
  isRefining: boolean;
  isSyncingVoice?: boolean;
}

export default function MediumPreview({
  article,
  voiceProfile,
  onUpdateArticle,
  onRefineSection,
  onSyncVoiceFromEdits,
  isRefining,
  isSyncingVoice = false,
}: MediumPreviewProps) {
  const [viewMode, setViewMode] = useState<EditorViewMode>('edit');
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [customRefineText, setCustomRefineText] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [claps, setClaps] = useState(48);
  const [isSaved, setIsSaved] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const initialDraft = article.initialAiDraft;
  const hasEditsSinceAi = Boolean(
    initialDraft &&
      (article.title.trim() !== initialDraft.title.trim() ||
        article.subtitle.trim() !== initialDraft.subtitle.trim() ||
        article.contentMarkdown.trim() !== initialDraft.contentMarkdown.trim())
  );

  const handleFormat = (prefix: string, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = article.contentMarkdown;
    const selectedText = text.slice(start, end) || defaultText;

    const replacement = `${prefix}${selectedText}${suffix}`;
    const newContent = text.slice(0, start) + replacement + text.slice(end);

    onUpdateArticle({ contentMarkdown: newContent });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length
      );
    }, 0);
  };

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

  // Render the story editor form
  const renderEditorForm = () => (
    <div className="space-y-5">
      <div>
        <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5 font-mono">
          Story Title
        </label>
        <textarea
          rows={2}
          value={article.title}
          onChange={(e) => onUpdateArticle({ title: e.target.value })}
          placeholder="Story Title..."
          className="w-full text-2xl sm:text-3xl lg:text-[34px] font-serif font-light italic p-4 bg-[#070709] border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 leading-snug resize-none transition-colors"
        />
      </div>

      <div>
        <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5 font-mono">
          Story Subtitle / Kicker
        </label>
        <input
          type="text"
          value={article.subtitle}
          onChange={(e) => onUpdateArticle({ subtitle: e.target.value })}
          placeholder="Write a compelling subtitle or kicker..."
          className="w-full text-lg sm:text-xl font-serif text-white/80 italic p-3.5 bg-[#070709] border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest font-mono">
            Article Markdown Content
          </label>
          <div className="flex items-center gap-3 text-xs text-white/40 font-mono">
            <span>{article.readTimeMinutes} min read</span>
            <span>•</span>
            <span>{article.wordCount} words</span>
          </div>
        </div>

        {/* Formatting Toolbar */}
        <div className="flex flex-wrap items-center gap-1 p-2 bg-[#0A0A0C] border border-white/10 border-b-0 rounded-t-xl">
          <button
            type="button"
            onClick={() => handleFormat('## ', '', 'Section Heading')}
            className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Heading 2 (##)"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleFormat('### ', '', 'Subheading')}
            className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Heading 3 (###)"
          >
            <Heading3 className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button
            type="button"
            onClick={() => handleFormat('**', '**', 'bold text')}
            className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Bold (**)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleFormat('*', '*', 'italic text')}
            className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Italic (*)"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleFormat('> ', '', 'Quoted thought')}
            className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Blockquote (>)"
          >
            <Quote className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button
            type="button"
            onClick={() => handleFormat('- ', '', 'Bullet point')}
            className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Bullet list (-)"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleFormat('1. ', '', 'Numbered point')}
            className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Numbered list (1.)"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleFormat('`', '`', 'code')}
            className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Inline Code (`)"
          >
            <Code className="w-4 h-4" />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          rows={22}
          value={article.contentMarkdown}
          onChange={(e) => onUpdateArticle({ contentMarkdown: e.target.value })}
          placeholder="Write or edit your story in Markdown..."
          className="w-full p-5 bg-[#070709] border border-white/10 rounded-b-xl font-serif text-[16px] sm:text-[17px] leading-[1.8] text-white/90 placeholder-white/20 focus:outline-none focus:border-indigo-500 resize-y"
        />
      </div>
    </div>
  );

  // Render the Medium reading preview
  const renderReadingPreview = () => (
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
              <span className="text-sm font-semibold text-white">Author Draft</span>
              <span className="text-xs text-white/30">•</span>
              <span className="text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer">
                Follow
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5 font-mono">
              <span>{article.readTimeMinutes} min read</span>
              <span>•</span>
              <span>
                {new Date().toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
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
  );

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Top Action Toolbar */}
      <div className="bg-[#0D0D10] border border-white/10 rounded-2xl shadow-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: View Mode Switcher */}
        <div className="flex items-center gap-1 p-1 bg-black/40 border border-white/10 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode('edit')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              viewMode === 'edit'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Story Editor</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              viewMode === 'split'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Split View</span>
            <span className="sm:hidden">Split</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              viewMode === 'preview'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Medium Preview</span>
            <span className="sm:hidden">Preview</span>
          </button>
        </div>

        {/* Right: Export & Copy Actions */}
        <div className="flex flex-wrap items-center gap-2">
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
            className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 text-xs font-semibold text-black bg-white hover:bg-gray-200 rounded-full transition-all shadow-md cursor-pointer"
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

      {/* Voice Learning & Adaptation Bar */}
      {hasEditsSinceAi && (
        <div className="bg-indigo-950/35 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl transition-all">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
              <Sparkles className="w-4.5 h-4.5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">Voice Learning Active</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Manual edits detected
                </span>
                {article.lastVoiceSyncAt && (
                  <span className="text-[10px] text-emerald-400 font-mono hidden sm:inline">
                    ✓ Last tuned {new Date(article.lastVoiceSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/60 mt-0.5">
                VoxScribe studies your edits to tune your personal voice profile so future AI writing naturally reflects your authentic vocabulary and rhythm.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
            {onSyncVoiceFromEdits && (
              <button
                type="button"
                onClick={onSyncVoiceFromEdits}
                disabled={isSyncingVoice}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/25 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSyncingVoice ? (
                  <>
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                    Adjusting Voice...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Factor into My Voice
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

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

      {/* Main Article Container according to View Mode */}
      {viewMode === 'edit' && (
        <div className="bg-[#0D0D10] border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-10 transition-all">
          {renderEditorForm()}
        </div>
      )}

      {viewMode === 'split' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Editor Column */}
          <div className="bg-[#0D0D10] border border-white/10 rounded-2xl shadow-2xl p-5 sm:p-7">
            <div className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 mb-4 font-bold flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5" /> Story Editor
            </div>
            {renderEditorForm()}
          </div>

          {/* Live Preview Column */}
          <div className="bg-[#0D0D10] border border-white/10 rounded-2xl shadow-2xl p-5 sm:p-7 lg:sticky lg:top-20 max-h-[85vh] overflow-y-auto">
            <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 mb-4 font-bold flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Live Medium Preview
            </div>
            {renderReadingPreview()}
          </div>
        </div>
      )}

      {viewMode === 'preview' && (
        <div className="bg-[#0D0D10] border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-12 transition-all">
          {renderReadingPreview()}
        </div>
      )}

      {/* Medium Tags & Publications Section */}
      <div className="bg-[#0D0D10] border border-white/10 rounded-2xl p-6 sm:p-8">
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
