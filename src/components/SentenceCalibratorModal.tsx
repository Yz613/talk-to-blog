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
} from 'lucide-react';
import { MediumArticle, VoiceProfile, VoiceRewritePair } from '../types';
import { chunkTextBySentences, computeWordDiff, TextChunk } from '../utils/sentenceChunker';

interface SentenceCalibratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentArticle?: MediumArticle | null;
  drafts?: MediumArticle[];
  voiceProfile?: VoiceProfile | null;
  onSaveVoiceProfile?: (profile: VoiceProfile) => void;
  onApplyRewritesToArticle?: (newContentMarkdown: string) => void;
  apiKey?: string;
}

const REWRITES_STORAGE_KEY = 'voxscribe_voice_rewrites_v1';

export default function SentenceCalibratorModal({
  isOpen,
  onClose,
  currentArticle,
  drafts = [],
  voiceProfile,
  onSaveVoiceProfile,
  onApplyRewritesToArticle,
  apiKey,
}: SentenceCalibratorModalProps) {
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

    // Published stories pairs for corpus grounding
    const publishedPairs = drafts
      .filter((d) => d.isPublished && d.initialAiDraft && d.publishedSnapshot)
      .map((d) => ({
        original: d.initialAiDraft!,
        published: d.publishedSnapshot!,
        title: d.title,
      }));

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

      // Advance to next chunk if available
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

    // Sort by chunk index
    const sorted = [...articleRewrites].sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
    const combinedRewrites = sorted.map((s) => s.userRewriteChunk).join('\n\n');
    onApplyRewritesToArticle(combinedRewrites);
    setFeedback('Applied your exact rewrites directly to the story draft!');
  };

  if (!isOpen) return null;

  const activeSpoken = spokenChunks[currentChunkIndex];
  const publishedStoriesCount = drafts.filter((d) => d.isPublished).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#0D0D11] border border-indigo-500/30 rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col text-white">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-start justify-between gap-4 sticky top-0 bg-[#0D0D11]/95 backdrop-blur-md z-10">
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
              Look at what you said in your voice note, see how the AI drafted it, then rewrite it with your keyboard (no mic!). By comparing your exact typing to raw speech, the AI learns your true cadence, sentence lengths, and vocabulary.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-white/40 hover:text-white rounded-full hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Source & Pacing Controls */}
        <div className="p-4 sm:p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Source Mode */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white/60 flex items-center gap-1.5">
                <Sliders size={13} className="text-indigo-400" /> Source:
              </span>
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                {currentArticle && (
                  <button
                    onClick={() => setSourceMode('current')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
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
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    sourceMode === 'custom'
                      ? 'bg-indigo-600 text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Custom Notes
                </button>
              </div>
            </div>

            {/* Pacing Selector */}
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

          {/* Past Draft Picker or Custom Text Input */}
          {sourceMode === 'drafts' && drafts.length > 0 && (
            <div className="flex items-center gap-3">
              <select
                value={selectedDraftId}
                onChange={(e) => setSelectedDraftId(e.target.value)}
                className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {drafts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.wordCount} words) — {new Date(d.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sourceMode === 'custom' && (
            <div className="space-y-2">
              <textarea
                rows={3}
                value={customSpokenText}
                onChange={(e) => setCustomSpokenText(e.target.value)}
                placeholder="Paste spoken voice transcript or audio notes to chunk..."
                className="w-full bg-black/40 border border-white/15 rounded-xl p-3 text-xs text-white placeholder-white/40 focus:outline-none focus:border-indigo-500 leading-relaxed"
              />
            </div>
          )}

          {/* Stepper Progress Bar */}
          {spokenChunks.length > 0 && (
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleSelectChunk(currentChunkIndex - 1)}
                  disabled={currentChunkIndex === 0}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white transition-colors cursor-pointer"
                  title="Previous Chunk"
                >
                  <ArrowLeft size={14} />
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">
                    Chunk {currentChunkIndex + 1} of {spokenChunks.length}
                  </span>
                  <span className="text-[11px] text-white/40">
                    ({activeSpoken?.sentences?.length || 0} sentences)
                  </span>
                </div>

                <button
                  onClick={() => handleSelectChunk(currentChunkIndex + 1)}
                  disabled={currentChunkIndex >= spokenChunks.length - 1}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white transition-colors cursor-pointer"
                  title="Next Chunk"
                >
                  <ArrowRight size={14} />
                </button>
              </div>

              {/* Progress dots */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                {spokenChunks.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectChunk(i)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      i === currentChunkIndex
                        ? 'w-6 bg-indigo-500'
                        : 'w-2 bg-white/20 hover:bg-white/40'
                    }`}
                    title={`Jump to Chunk ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 3-Step Comparison Cards */}
          {activeSpoken ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. What You Said (Spoken Input) */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs pb-1 border-b border-white/10">
                      <span className="font-semibold text-white/80 flex items-center gap-1.5">
                        <Mic size={13} className="text-amber-400" />
                        1. What You Said (Spoken Note)
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-mono">
                        Raw Transcript
                      </span>
                    </div>

                    <div className="text-xs text-white/80 leading-relaxed font-mono bg-black/40 p-3 rounded-xl border border-white/5 min-h-[90px] select-text">
                      {activeSpoken.rawSpoken}
                    </div>
                  </div>

                  <div className="text-[11px] text-white/40">
                    Exact spoken words transcribed from your voice memo.
                  </div>
                </div>

                {/* 2. How AI Wrote It */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs pb-1 border-b border-white/10">
                      <span className="font-semibold text-white/80 flex items-center gap-1.5">
                        <Wand2 size={13} className="text-purple-400" />
                        2. How AI Wrote It
                      </span>
                      <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[10px] font-mono">
                        AI Draft
                      </span>
                    </div>

                    <div className="text-xs text-white/90 leading-relaxed bg-black/40 p-3 rounded-xl border border-white/5 min-h-[90px] select-text">
                      {aiDraft || activeSpoken.rawSpoken}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-white/40">
                      AI's proposal based on your draft.
                    </span>
                    <button
                      onClick={() => setUserRewrite(aiDraft)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors font-medium cursor-pointer"
                    >
                      <Copy size={11} />
                      Copy to My Rewrite
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Your Exact Rewrite (Keyboard Only!) */}
              <div className="p-5 rounded-2xl bg-[#111118] border-2 border-indigo-500/40 shadow-xl space-y-3">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <PenTool size={14} className="text-emerald-400" />
                      3. Your Exact Rewrite (Type with Keyboard)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                      Keyboard Only
                    </span>
                  </div>

                  {/* Diff View Toggle */}
                  <button
                    onClick={() => setShowDiff(!showDiff)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                      showDiff
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/15'
                    }`}
                  >
                    <Eye size={12} />
                    {showDiff ? 'Back to Editor' : 'Compare Diff'}
                  </button>
                </div>

                {/* Important Reminder Banner */}
                <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-[11px] text-indigo-200 flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5 text-indigo-400" />
                  <span>
                    <strong>Do not speak to it</strong> — rewrite this chunk exactly as you want it to appear in your finished blog post. Type your exact sentence breaks, em-dashes (`—`), and word choice. VoxScribe pairs your typing with the raw voice transcript to align future articles with your authentic voice.
                  </span>
                </div>

                {/* Editor or Diff */}
                {showDiff ? (
                  <div className="p-3.5 rounded-xl bg-black/60 border border-white/10 min-h-[100px] text-xs leading-relaxed">
                    <div className="text-[11px] text-white/40 mb-2 font-mono">
                      Diff: <span className="text-rose-400 line-through">removed from draft</span> |{' '}
                      <span className="text-emerald-400 font-semibold underline">added in your rewrite</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {computeWordDiff(aiDraft, userRewrite).map((t, i) => {
                        if (t.type === 'removed') {
                          return (
                            <span key={i} className="text-rose-400 line-through bg-rose-950/50 px-1 rounded">
                              {t.word}
                            </span>
                          );
                        }
                        if (t.type === 'added') {
                          return (
                            <span key={i} className="text-emerald-400 font-medium bg-emerald-950/50 px-1 rounded">
                              {t.word}
                            </span>
                          );
                        }
                        return <span key={i} className="text-white/80">{t.word}</span>;
                      })}
                    </div>
                  </div>
                ) : (
                  <textarea
                    rows={4}
                    value={userRewrite}
                    onChange={(e) => setUserRewrite(e.target.value)}
                    placeholder="Type your exact rewrite here..."
                    className="w-full bg-black/60 border border-white/15 rounded-xl p-3.5 text-xs text-white leading-relaxed placeholder-white/30 focus:outline-none focus:border-indigo-500"
                  />
                )}

                {/* Action Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <Database size={13} className="text-indigo-400" />
                    <span>
                      {savedRewrites.length} rewrites saved • {publishedStoriesCount} published stories in corpus
                    </span>
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
      </div>
    </div>
  );
}
