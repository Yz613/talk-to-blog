import React, { useState, useMemo } from 'react';
import {
  X,
  BookA,
  Plus,
  Trash2,
  ArrowRight,
  Sparkles,
  Tag,
  CheckCircle2,
  Wand2,
} from 'lucide-react';
import { WordReplacement, VoiceProfile } from '../types';
import { applyWordReplacements, applyCustomVocabularyCasing } from '../utils/dictionary';

interface VocabularyModalProps {
  isOpen: boolean;
  onClose: () => void;
  voiceProfile?: VoiceProfile | null;
  onSaveVoiceProfile?: (profile: VoiceProfile) => void;
}

export const VOCABULARY_STORAGE_KEY = 'voxscribe_custom_vocabulary_v1';
export const REPLACEMENTS_STORAGE_KEY = 'voxscribe_word_replacements_v1';

export default function VocabularyModal({
  isOpen,
  onClose,
  voiceProfile,
  onSaveVoiceProfile,
}: VocabularyModalProps) {
  // Vocabulary input state
  const [vocabInput, setVocabInput] = useState('');

  // Replacement rule form state
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');

  // Interactive tester state
  const [testText, setTestText] = useState('I work at panoptic and love building software with nextjs.');

  // Load from voiceProfile or localStorage
  const [vocabList, setVocabList] = useState<string[]>(() => {
    try {
      if (voiceProfile?.customVocabulary && voiceProfile.customVocabulary.length > 0) {
        return voiceProfile.customVocabulary;
      }
      const saved = localStorage.getItem(VOCABULARY_STORAGE_KEY);
      return saved ? JSON.parse(saved) : ['Panoptyc', 'Medium', 'VoxScribe'];
    } catch {
      return ['Panoptyc', 'Medium', 'VoxScribe'];
    }
  });

  const [replacementsList, setReplacementsList] = useState<WordReplacement[]>(() => {
    try {
      if (voiceProfile?.wordReplacements && voiceProfile.wordReplacements.length > 0) {
        return voiceProfile.wordReplacements;
      }
      const saved = localStorage.getItem(REPLACEMENTS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [
        { id: 'rep_1', from: 'panoptic', to: 'Panoptyc' },
        { id: 'rep_2', from: 'pan optic', to: 'Panoptyc' },
        { id: 'rep_3', from: 'vox scribe', to: 'VoxScribe' },
      ];
    } catch {
      return [
        { id: 'rep_1', from: 'panoptic', to: 'Panoptyc' },
        { id: 'rep_2', from: 'pan optic', to: 'Panoptyc' },
        { id: 'rep_3', from: 'vox scribe', to: 'VoxScribe' },
      ];
    }
  });

  const persistChanges = (newVocab: string[], newReplacements: WordReplacement[]) => {
    try {
      localStorage.setItem(VOCABULARY_STORAGE_KEY, JSON.stringify(newVocab));
      localStorage.setItem(REPLACEMENTS_STORAGE_KEY, JSON.stringify(newReplacements));
    } catch {}

    if (voiceProfile && onSaveVoiceProfile) {
      onSaveVoiceProfile({
        ...voiceProfile,
        customVocabulary: newVocab,
        wordReplacements: newReplacements,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  // Add word(s) to vocabulary (supports comma-separated bulk addition)
  const handleAddVocab = () => {
    if (!vocabInput.trim()) return;

    const newWords = vocabInput
      .split(',')
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    const updated = Array.from(new Set([...vocabList, ...newWords]));
    setVocabList(updated);
    persistChanges(updated, replacementsList);
    setVocabInput('');
  };

  const handleRemoveVocab = (wordToRemove: string) => {
    const updated = vocabList.filter((w) => w !== wordToRemove);
    setVocabList(updated);
    persistChanges(updated, replacementsList);
  };

  // Add replacement rule
  const handleAddReplacement = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const from = fromInput.trim();
    const to = toInput.trim();
    if (!from || !to) return;

    const existingIndex = replacementsList.findIndex(
      (r) => r.from.toLowerCase() === from.toLowerCase()
    );

    let updated: WordReplacement[];
    if (existingIndex >= 0) {
      updated = replacementsList.map((r, i) =>
        i === existingIndex ? { ...r, to } : r
      );
    } else {
      const newRule: WordReplacement = {
        id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        from,
        to,
      };
      updated = [...replacementsList, newRule];
    }

    setReplacementsList(updated);
    persistChanges(vocabList, updated);
    setFromInput('');
    setToInput('');
  };

  const handleRemoveReplacement = (id: string) => {
    const updated = replacementsList.filter((r) => r.id !== id);
    setReplacementsList(updated);
    persistChanges(vocabList, updated);
  };

  // Interactive Live Preview computation
  const previewOutput = useMemo(() => {
    if (!testText) return '';
    let result = applyWordReplacements(testText, replacementsList);
    result = applyCustomVocabularyCasing(result, vocabList);
    return result;
  }, [testText, replacementsList, vocabList]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl bg-[#0D0D10] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0A0A0C]/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <BookA className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Vocabulary &amp; Personal Dictionary
              </h2>
              <p className="text-xs text-white/50">
                Teach VoxScribe brand names, proper nouns, and automatic word replacement rules.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-7">
          {/* Section 1: Custom Vocabulary */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Tag className="w-4 h-4 text-indigo-400" />
                  Custom Vocabulary &amp; Proper Nouns
                </h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Words that speech models frequently misspell. These are biased during audio transcription and forced to retain exact casing.
                </p>
              </div>
              <span className="text-xs text-white/40 font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                {vocabList.length} words
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add terms (e.g. Panoptyc, Kubernetes, Next.js, Substack)..."
                value={vocabInput}
                onChange={(e) => setVocabInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddVocab())}
                className="flex-1 px-4 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={handleAddVocab}
                disabled={!vocabInput.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            <div className="flex flex-wrap gap-2 p-3 bg-black/30 border border-white/5 rounded-2xl min-h-[56px] max-h-36 overflow-y-auto">
              {vocabList.length === 0 ? (
                <span className="text-xs text-white/30 italic">No custom terms added yet.</span>
              ) : (
                vocabList.map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-medium text-indigo-200 group"
                  >
                    <span>{word}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveVocab(word)}
                      className="text-indigo-400/60 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </section>

          {/* Section 2: Word Replacement Rules */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-emerald-400" />
                  Automatic Word Replacements
                </h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Deterministic find-and-replace rules. Applied automatically to speech transcripts and drafts before generating.
                </p>
              </div>
              <span className="text-xs text-white/40 font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                {replacementsList.length} rules
              </span>
            </div>

            <form onSubmit={handleAddReplacement} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <input
                type="text"
                placeholder="When you say / hears: panoptic"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
                className="sm:col-span-2 px-4 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <div className="hidden sm:flex items-center justify-center text-white/30">
                <ArrowRight className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Replace with: Panoptyc"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                className="sm:col-span-2 px-4 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="submit"
                disabled={!fromInput.trim() || !toInput.trim()}
                className="sm:col-span-5 sm:w-auto self-end inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-200 border border-emerald-500/30 text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer mt-1"
              >
                <Plus className="w-4 h-4" /> Add Replacement Rule
              </button>
            </form>

            <div className="divide-y divide-white/5 bg-black/30 border border-white/5 rounded-2xl max-h-48 overflow-y-auto">
              {replacementsList.length === 0 ? (
                <div className="p-4 text-xs text-white/30 italic text-center">No replacement rules active.</div>
              ) : (
                replacementsList.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                        {rule.from}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-white/30" />
                      <span className="font-mono text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">
                        {rule.to}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveReplacement(rule.id)}
                      className="text-white/30 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                      title="Delete rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Section 3: Live Interactive Tester */}
          <section className="space-y-2.5 p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20">
            <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Live Interactive Tester
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/40 block mb-1">Type test phrase:</label>
                <textarea
                  rows={2}
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  className="w-full p-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-white/20 resize-none focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-emerald-400/70 block mb-1">Formatted Output:</label>
                <div className="p-2.5 bg-black/40 border border-emerald-500/20 rounded-xl text-xs text-emerald-200 min-h-[58px] flex items-center">
                  {previewOutput || <span className="text-white/20 italic">Output will appear here...</span>}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-[#0A0A0C]/60">
          <div className="text-[11px] text-white/40 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Changes save and sync automatically to active voice profile
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-200 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
