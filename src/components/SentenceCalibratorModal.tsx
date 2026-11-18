import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Mic,
  PenTool,
  Check,
  Copy,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Eye,
  FileText,
  AlertCircle,
  Wand2,
  Database,
  Sliders,
  BookOpen,
  Plus,
  Trash2,
  Tag,
  BookA,
} from 'lucide-react';
import { MediumArticle, VoiceProfile, VoiceRewritePair, PublishedWriting } from '../types';
import { chunkTextBySentences, computeWordDiff, TextChunk } from '../utils/sentenceChunker';

interface SentenceCalibratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentArticle?: MediumArticle | null;
  drafts?: MediumArticle[];
  voiceProfile?: VoiceProfile | null;
  onSaveVoiceProfile?: (profile: VoiceProfile) => void;
  onApplyRewritesToArticle?: (newContentMarkdown: string) => void;
  onOpenDictionary?: () => void;
  apiKey?: string;
}

const REWRITES_STORAGE_KEY = 'voxscribe_voice_rewrites_v1';
const EXTERNAL_CORPUS_STORAGE_KEY = 'voxscribe_external_corpus_v1';

export default function SentenceCalibratorModal({
  isOpen,
  onClose,
  currentArticle,
  drafts = [],
  voiceProfile,
  onSaveVoiceProfile,
  onApplyRewritesToArticle,
  onOpenDictionary,
  apiKey,
}: SentenceCalibratorModalProps) {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'trainer' | 'corpus' | 'rewrites'>('trainer');

  // Source Selection
  const [sourceMode, setSourceMode] = useState<'current' | 'drafts' | 'custom'>('current');
  const [selectedDraftId, setSelectedDraftId] = useState<string>(currentArticle?.id || '');
  const [customSpokenText, setCustomSpokenText] = useState<string>('');

  // Chunking
  const [chunkSize, setChunkSize] = useState<number>(3);
  const [spokenChunks, setSpokenChunks] = useState<TextChunk[]>([]);
  const [draftChunks, setDraftChunks] = useState<TextChunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);

  // Active Chunk Editing
  const [aiDraft, setAiDraft] = useState<string>('');
  const [userRewrite, setUserRewrite] = useState<string>('');
  const [showDiff, setShowDiff] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Stored Rewrites
  const [savedRewrites, setSavedRewrites] = useState<VoiceRewritePair[]>(() => {
    try {
      const saved = localStorage.getItem(REWRITES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // External Published Corpus
  const [externalCorpus, setExternalCorpus] = useState<PublishedWriting[]>(() => {
    try {
      const saved = localStorage.getItem(EXTERNAL_CORPUS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
      return voiceProfile?.externalCorpus || [];
    } catch {
      return voiceProfile?.externalCorpus || [];
    }
  });

  // Add Article Form State
  const [isAddingArticle, setIsAddingArticle] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newCategory, setNewCategory] = useState<'article' | 'post' | 'newsletter' | 'other'>('article');
  const [newContent, setNewContent] = useState<string>('');

  // Load chunks when modal opens or source changes
  useEffect(() => {
    if (!isOpen) return;

    let spoken = '';
    let draftProse = '';

    if (sourceMode === 'current' && currentArticle) {
      spoken = currentArticle.sourceTranscript || '';
      draftProse = currentArticle.contentMarkdown || '';
    } else if (sourceMode === 'drafts') {
      const d = drafts.find((x) => x.id === selectedDraftId) || drafts[0];
      if (d) {
        spoken = d.sourceTranscript || '';
        draftProse = d.contentMarkdown || '';
      }
    } else if (sourceMode === 'custom') {
      spoken = customSpokenText;
      draftProse = '';
    }

    if (spoken.trim()) {
      const sChunks = chunkTextBySentences(spoken.trim(), chunkSize);
      const dChunks = draftProse.trim() ? chunkTextBySentences(draftProse.trim(), chunkSize) : [];
      setSpokenChunks(sChunks);
      setDraftChunks(dChunks);
      setCurrentChunkIndex(0);

      if (sChunks.length > 0) {
        const initialDraft = dChunks[0]?.rawSpoken || sChunks[0]?.rawSpoken || '';
        setAiDraft(initialDraft);
        setUserRewrite(initialDraft);
      }
    } else {
      setSpokenChunks([]);
      setDraftChunks([]);
      setAiDraft('');
      setUserRewrite('');
    }
  }, [isOpen, sourceMode, selectedDraftId, chunkSize, currentArticle, drafts]);

  // When switching chunk index
  const handleSelectChunk = (idx: number) => {
    if (idx < 0 || idx >= spokenChunks.length) return;
    setCurrentChunkIndex(idx);
    setShowDiff(false);

    const draftText = draftChunks[idx]?.rawSpoken || spokenChunks[idx]?.rawSpoken || '';
    setAiDraft(draftText);
    setUserRewrite(draftText);
  };

  // Build combined published pairs (in-app + external)
  const getCombinedPublishedPairs = () => {
    const inAppPairs = drafts
      .filter((d) => d.isPublished && d.initialAiDraft && d.publishedSnapshot)
      .map((d) => ({
        original: d.initialAiDraft!,
        published: d.publishedSnapshot!,
        title: d.title,
      }));

    const externalPairs = externalCorpus.map((item) => ({
      original: { title: item.title, subtitle: '', contentMarkdown: item.content },
      published: { title: item.title, subtitle: '', contentMarkdown: item.content },
      title: item.title,
    }));

    return [...inAppPairs, ...externalPairs];
  };

  // Save current chunk rewrite
  const handleSaveChunk = async () => {
    if (!spokenChunks[currentChunkIndex] || !userRewrite.trim()) return;

    setIsSubmitting(true);
    setFeedback(null);

    const currentSpoken = spokenChunks[currentChunkIndex].rawSpoken;
    const newPair: VoiceRewritePair = {
      id: `rw_${Date.now()}`,
      timestamp: new Date().toISOString(),
      sourceTranscriptChunk: currentSpoken,
      aiDraftChunk: aiDraft,
      userRewriteChunk: userRewrite.trim(),
      articleId: currentArticle?.id,
      chunkIndex: currentChunkIndex + 1,
      totalChunks: spokenChunks.length,
    };

    const updatedRewrites = [newPair, ...savedRewrites.filter((p) => p.id !== newPair.id)].slice(0, 50);
    setSavedRewrites(updatedRewrites);
    try {
      localStorage.setItem(REWRITES_STORAGE_KEY, JSON.stringify(updatedRewrites));
    } catch {}

    const publishedPairs = getCombinedPublishedPairs();

    try {
      const response = await fetch('/api/adapt-voice-from-rewrites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-gemini-api-key': apiKey } : {}),
        },
        body: JSON.stringify({
          rewritePairs: updatedRewrites,
          currentProfile: voiceProfile,
          publishedPairs,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { profile?: VoiceProfile; adaptationSummary?: string };
        if (data.profile && onSaveVoiceProfile) {
          onSaveVoiceProfile(data.profile);
        }
        setFeedback(data.adaptationSummary || 'Saved rewrite and calibrated your Voice Profile!');
      }
    } catch (err) {
      console.warn('Failed to calibrate voice from rewrites:', err);
    } finally {
      setIsSubmitting(false);

      if (currentChunkIndex + 1 < spokenChunks.length) {
        handleSelectChunk(currentChunkIndex + 1);
      }
    }
  };

  // Apply all rewrites back to the current article markdown
  const handleApplyRewritesToArticle = () => {
    if (!currentArticle || !onApplyRewritesToArticle) return;
    const articleRewrites = savedRewrites.filter((rw) => rw.articleId === currentArticle.id);
    if (articleRewrites.length === 0) {
      alert('No rewrites saved for this story yet.');
      return;
    }

    const sorted = [...articleRewrites].sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
    const combinedRewrites = sorted.map((s) => s.userRewriteChunk).join('\n\n');
    onApplyRewritesToArticle(combinedRewrites);
    setFeedback('Applied your exact rewrites directly to the story draft!');
  };

  // Add external published writing
  const handleAddExternalArticle = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    const newArticle: PublishedWriting = {
      id: `pub_${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: newTitle.trim(),
      category: newCategory,
      content: newContent.trim(),
      wordCount: newContent.trim().split(/\s+/).length,
    };

    const updated = [newArticle, ...externalCorpus];
    setExternalCorpus(updated);
    try {
      localStorage.setItem(EXTERNAL_CORPUS_STORAGE_KEY, JSON.stringify(updated));
    } catch {}

    if (voiceProfile && onSaveVoiceProfile) {
      onSaveVoiceProfile({
        ...voiceProfile,
        externalCorpus: updated,
        updatedAt: new Date().toISOString(),
      });
    }

    setNewTitle('');
    setNewContent('');
    setIsAddingArticle(false);
  };

  const handleDeleteExternalArticle = (id: string) => {
    const updated = externalCorpus.filter((a) => a.id !== id);
    setExternalCorpus(updated);
    try {
      localStorage.setItem(EXTERNAL_CORPUS_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    if (voiceProfile && onSaveVoiceProfile) {
      onSaveVoiceProfile({
        ...voiceProfile,
        externalCorpus: updated,
      });
    }
  };

  const handleDeleteRewrite = (id: string) => {
    const updated = savedRewrites.filter((r) => r.id !== id);
    setSavedRewrites(updated);
    try {
      localStorage.setItem(REWRITES_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  };

  if (!isOpen) return null;

  const activeSpoken = spokenChunks[currentChunkIndex];
  const inAppPublishedCount = drafts.filter((d) => d.isPublished).length;
  const totalCorpusCount = inAppPublishedCount + externalCorpus.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#0D0D11] border border-indigo-500/30 rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col text-white">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-start justify-between gap-4 bg-[#0D0D11]/95 backdrop-blur-md">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Sparkles size={18} />
              </span>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Learn My Voice — 3 Sentences at a Time
              </h2>
            </div>
            <p className="text-xs text-white/60 leading-relaxed max-w-2xl">
              Compare speech to AI drafts, rewrite with your keyboard, and continuously ground in your published writing archive.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenDictionary && (
              <button
                type="button"
                onClick={onOpenDictionary}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 transition-colors cursor-pointer"
                title="Manage custom vocabulary & word replacements"
              >
                <BookA size={14} />
                Dictionary
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-white/40 hover:text-white rounded-full hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-white/10 bg-[#0A0A0C]">
          <button
            type="button"
            onClick={() => setActiveTab('trainer')}
            className={`px-4 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'trainer'
                ? 'border-indigo-500 text-white bg-indigo-500/10'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <PenTool size={14} className="text-indigo-400" />
            3-Sentence Calibrator
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('corpus')}
            className={`px-4 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'corpus'
                ? 'border-emerald-500 text-white bg-emerald-500/10'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <BookOpen size={14} className="text-emerald-400" />
            Published Writing Corpus ({totalCorpusCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rewrites')}
            className={`px-4 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'rewrites'
                ? 'border-amber-500 text-white bg-amber-500/10'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <FileText size={14} className="text-amber-400" />
            Saved Rewrites ({savedRewrites.length})
          </button>
        </div>

        {/* Scrollable Tab Body */}
        <div className="flex-1 overflow-y-auto">
          {/* TAB 1: 3-SENTENCE TRAINER */}
          {activeTab === 'trainer' && (
            <div className="p-4 sm:p-6 space-y-4">
              {/* Source & Pacing Controls */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white/60 flex items-center gap-1.5">
                    <Sliders size={13} className="text-indigo-400" /> Source:
                  </span>
                  <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                    {currentArticle && (
                      <button
                        onClick={() => setSourceMode('current')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          sourceMode === 'current'
                            ? 'bg-indigo-600 text-white'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Current Story
                      </button>
                    )}
                    {drafts.length > 0 && (
                      <button
                        onClick={() => setSourceMode('drafts')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          sourceMode === 'drafts'
                            ? 'bg-indigo-600 text-white'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Past Stories ({drafts.length})
                      </button>
                    )}
                    <button
                      onClick={() => setSourceMode('custom')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        sourceMode === 'custom'
                          ? 'bg-indigo-600 text-white'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      Custom Notes
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-white/60">
                  <span>Pacing:</span>
                  <select
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                    className="bg-black/40 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value={1}>1 sentence at a time</option>
                    <option value={2}>2 sentences at a time</option>
                    <option value={3}>3 sentences at a time (Recommended)</option>
                    <option value={5}>5 sentences at a time</option>
                  </select>
                </div>
              </div>

              {sourceMode === 'custom' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/70">Paste Raw Spoken Notes or Transcript:</label>
                  <textarea
                    rows={3}
                    value={customSpokenText}
                    onChange={(e) => setCustomSpokenText(e.target.value)}
                    placeholder="Paste spoken notes here to slice into 3-sentence chunks..."
                    className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              {spokenChunks.length > 0 ? (
                <div className="space-y-4">
                  {/* Stepper Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span className="font-semibold text-indigo-300">
                        Chunk {currentChunkIndex + 1} of {spokenChunks.length}
                      </span>
                      <span className="text-[11px] text-white/40">
                        {spokenChunks[currentChunkIndex]?.sentences.length} sentences in this chunk
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {spokenChunks.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSelectChunk(idx)}
                          className={`h-2 flex-1 rounded-full transition-all cursor-pointer ${
                            idx === currentChunkIndex
                              ? 'bg-indigo-500 ring-2 ring-indigo-400/40'
                              : idx < currentChunkIndex
                              ? 'bg-emerald-500/70'
                              : 'bg-white/10 hover:bg-white/20'
                          }`}
                          title={`Jump to chunk ${idx + 1}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Step 1: What You Said */}
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                        <Mic size={14} /> 1. What You Said (Raw Audio Transcript)
                      </span>
                      <span className="text-[10px] uppercase font-mono text-white/30 tracking-wider">Spoken Input</span>
                    </div>
                    <p className="text-sm text-white/90 leading-relaxed font-sans bg-white/[0.02] p-3 rounded-xl border border-white/5">
                      {activeSpoken?.rawSpoken}
                    </p>
                  </div>

                  {/* Step 2: How AI Wrote It */}
                  <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                        <Wand2 size={14} className="text-indigo-400" /> 2. How the AI Drafted It
                      </span>
                      <button
                        type="button"
                        onClick={() => setUserRewrite(aiDraft)}
                        className="text-[11px] text-indigo-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                        title="Copy AI draft to your rewrite box below"
                      >
                        <Copy size={12} /> Copy to Rewrite
                      </button>
                    </div>
                    <p className="text-sm text-white/80 leading-relaxed font-serif bg-black/30 p-3 rounded-xl border border-white/5">
                      {aiDraft || <span className="italic text-white/30">No draft available.</span>}
                    </p>
                  </div>

                  {/* Step 3: How You Actually Write It */}
                  <div className="p-4 rounded-2xl bg-emerald-950/15 border border-emerald-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <PenTool size={14} /> 3. How YOU Write It (Keyboard Only)
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-emerald-300/60 hidden sm:inline">No mic allowed — typing captures your exact voice</span>
                        <button
                          type="button"
                          onClick={() => setShowDiff(!showDiff)}
                          className={`text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-colors cursor-pointer ${
                            showDiff
                              ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200'
                              : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                          }`}
                        >
                          <Eye size={12} /> {showDiff ? 'Hide Diff' : 'View Diff'}
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={3}
                      value={userRewrite}
                      onChange={(e) => setUserRewrite(e.target.value)}
                      placeholder="Type exactly how you would write these 3 sentences. Fix cadence, strip AI words, use your own vocabulary..."
                      className="w-full p-3.5 bg-black/60 border border-emerald-500/40 rounded-xl text-sm text-white placeholder-white/20 font-serif leading-relaxed focus:outline-none focus:border-emerald-400"
                    />

                    {/* Word-by-Word Diff View */}
                    {showDiff && aiDraft && (
                      <div className="p-3 bg-black/50 border border-white/10 rounded-xl space-y-1.5 text-xs">
                        <div className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">
                          Diff vs AI Draft (<span className="text-rose-400 line-through">AI Removed</span> / <span className="text-emerald-400 font-semibold underline">Your Words</span>)
                        </div>
                        <div className="flex flex-wrap gap-1 leading-relaxed">
                          {computeWordDiff(aiDraft, userRewrite).map((token, i) => {
                            if (token.type === 'removed') {
                              return (
                                <span key={i} className="text-rose-400 line-through bg-rose-500/10 px-1 rounded">
                                  {token.word}
                                </span>
                              );
                            }
                            if (token.type === 'added') {
                              return (
                                <span key={i} className="text-emerald-300 font-semibold bg-emerald-500/15 px-1 rounded underline">
                                  {token.word}
                                </span>
                              );
                            }
                            return <span key={i} className="text-white/70">{token.word}</span>;
                          })}
                        </div>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-1.5 text-xs text-white/50">
                        <Database size={13} className="text-emerald-400" />
                        Grounded in <strong className="text-white">{totalCorpusCount}</strong> published reference stories
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {onApplyRewritesToArticle && currentArticle && (
                          <button
                            type="button"
                            onClick={handleApplyRewritesToArticle}
                            className="px-3 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 text-white/80 transition-colors cursor-pointer"
                            title="Update the active story markdown with your approved rewrites"
                          >
                            Apply to Story
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleSaveChunk}
                          disabled={!userRewrite.trim() || isSubmitting}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
                        >
                          {isSubmitting ? (
                            <>
                              <RefreshCw size={13} className="animate-spin" />
                              Calibrating...
                            </>
                          ) : (
                            <>
                              <Check size={14} />
                              Save &amp; Teach Voice (Next Chunk →)
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {feedback && (
                      <div className="text-xs text-emerald-400 font-medium pt-1 flex items-center gap-1.5">
                        <Check size={13} /> {feedback}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-white/40 space-y-2 border border-dashed border-white/10 rounded-2xl">
                  <FileText size={32} className="mx-auto opacity-30" />
                  <p className="text-xs font-medium text-white/60">No speech chunks loaded</p>
                  <p className="text-[11px]">Choose a story above or paste spoken notes to start calibrating your voice.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PUBLISHED WRITING CORPUS */}
          {activeTab === 'corpus' && (
            <div className="p-4 sm:p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <BookOpen size={16} className="text-emerald-400" />
                    My Published Writing Corpus
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Your real-world published writing (articles, blog posts, newsletters) that the AI continuously studies as ground truth.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddingArticle(!isAddingArticle)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-200 border border-emerald-500/30 text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <Plus size={14} /> {isAddingArticle ? 'Cancel' : 'Add Published Article'}
                </button>
              </div>

              {/* Add Article Form */}
              {isAddingArticle && (
                <form onSubmit={handleAddExternalArticle} className="p-4 rounded-2xl bg-black/40 border border-emerald-500/30 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-xs text-white/60 block mb-1">Article / Post Title:</label>
                      <input
                        type="text"
                        placeholder="e.g. Stop Underpricing Your Work"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/60 block mb-1">Category:</label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as any)}
                        className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="article">Medium / Blog Article</option>
                        <option value="post">Social / LinkedIn Post</option>
                        <option value="newsletter">Email / Newsletter</option>
                        <option value="other">Other Prose</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-white/60 block mb-1">Published Content:</label>
                    <textarea
                      rows={5}
                      placeholder="Paste your authentic finalized prose here..."
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      className="w-full p-3 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-white/20 font-serif leading-relaxed focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingArticle(false)}
                      className="px-3 py-1.5 rounded-xl text-xs text-white/50 hover:text-white transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newTitle.trim() || !newContent.trim()}
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer shadow-md"
                    >
                      Save to Corpus
                    </button>
                  </div>
                </form>
              )}

              {/* Corpus List */}
              <div className="space-y-4">
                {/* External Published Writings */}
                {externalCorpus.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                      Imported External Articles ({externalCorpus.length})
                    </div>
                    <div className="divide-y divide-white/5 rounded-2xl bg-black/30 border border-white/5 overflow-hidden">
                      {externalCorpus.map((item) => (
                        <div key={item.id} className="p-3.5 flex items-start justify-between gap-3 text-xs">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white truncate">{item.title}</span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 uppercase">
                                {item.category || 'article'}
                              </span>
                              <span className="text-[10px] text-white/40">{item.wordCount} words</span>
                            </div>
                            <p className="text-white/50 line-clamp-2 font-serif text-[11px] leading-relaxed">
                              {item.content}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteExternalArticle(item.id)}
                            className="text-white/30 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer flex-shrink-0"
                            title="Delete from corpus"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* In-App Published Drafts */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                    In-App Finalized &amp; Published Stories ({inAppPublishedCount})
                  </div>
                  <div className="divide-y divide-white/5 rounded-2xl bg-black/30 border border-white/5 overflow-hidden">
                    {inAppPublishedCount === 0 ? (
                      <div className="p-4 text-xs text-white/30 italic text-center">
                        No in-app stories marked as published yet. Click "Mark as Published" in the Medium editor to add finished stories here!
                      </div>
                    ) : (
                      drafts
                        .filter((d) => d.isPublished)
                        .map((draft) => (
                          <div key={draft.id} className="p-3.5 flex items-start justify-between gap-3 text-xs">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white truncate">{draft.title}</span>
                                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-300">
                                  In-App Story
                                </span>
                                <span className="text-[10px] text-white/40">{draft.wordCount} words</span>
                              </div>
                              <p className="text-white/50 line-clamp-1 font-serif text-[11px]">
                                {draft.subtitle || draft.contentMarkdown.slice(0, 100)}
                              </p>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SAVED REWRITES */}
          {activeTab === 'rewrites' && (
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText size={16} className="text-amber-400" />
                    Saved Sentence Rewrite Pairs
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Exact ground-truth pairs of raw speech vs your manual keyboard rewrites.
                  </p>
                </div>
                <span className="text-xs text-white/40 font-mono px-2 py-0.5 rounded bg-white/5">
                  {savedRewrites.length} pairs saved
                </span>
              </div>

              {savedRewrites.length === 0 ? (
                <div className="py-12 text-center text-white/30 text-xs italic">
                  No sentence rewrites saved yet. Complete 3-sentence chunks in the calibrator to build your library!
                </div>
              ) : (
                <div className="space-y-3">
                  {savedRewrites.map((pair, idx) => (
                    <div key={pair.id} className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-white/40 pb-1 border-b border-white/5">
                        <span className="font-semibold text-indigo-300">Rewrite #{savedRewrites.length - idx}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px]">{new Date(pair.timestamp).toLocaleDateString()}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteRewrite(pair.id)}
                            className="text-white/30 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete rewrite pair"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">What You Spoke:</span>
                          <p className="text-white/70 bg-white/[0.02] p-2.5 rounded-lg border border-white/5 leading-relaxed">
                            {pair.sourceTranscriptChunk}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">How You Wrote It:</span>
                          <p className="text-emerald-200 bg-emerald-500/5 p-2.5 rounded-lg border border-emerald-500/15 leading-relaxed font-serif">
                            {pair.userRewriteChunk}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
