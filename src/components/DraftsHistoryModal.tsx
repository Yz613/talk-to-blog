import { Clock, Trash2, ArrowRight, X, FileText, Tag, Sparkles } from 'lucide-react';
import { MediumArticle } from '../types';

interface DraftsHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  drafts: MediumArticle[];
  onSelectDraft: (draft: MediumArticle) => void;
  onDeleteDraft: (id: string) => void;
}

export default function DraftsHistoryModal({
  isOpen,
  onClose,
  drafts,
  onSelectDraft,
  onDeleteDraft,
}: DraftsHistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#0D0D10] rounded-2xl border border-white/10 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-serif font-light italic text-white">
              Saved Stories &amp; Voice Brainstorms ({drafts.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List of Drafts */}
        <div className="p-5 overflow-y-auto space-y-3 divide-y divide-white/5">
          {drafts.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30 text-indigo-400" />
              <p className="text-sm font-serif italic text-white/60">No saved drafts yet.</p>
              <p className="text-xs mt-1 text-white/30">
                Articles you generate will automatically be saved here.
              </p>
            </div>
          ) : (
            drafts.map((draft) => (
              <div
                key={draft.id}
                className="pt-3 first:pt-0 flex items-start justify-between gap-4 group"
              >
                <div className="flex-1">
                  <h4
                    onClick={() => {
                      onSelectDraft(draft);
                      onClose();
                    }}
                    className="text-sm font-serif font-medium text-white group-hover:text-indigo-300 cursor-pointer transition-colors line-clamp-1"
                  >
                    {draft.title}
                  </h4>
                  <p className="text-xs text-white/50 line-clamp-1 mt-0.5">
                    {draft.subtitle || draft.executiveSummary}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-white/40 font-mono">
                    <span>
                      {new Date(draft.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>•</span>
                    <span>{draft.readTimeMinutes} min read</span>
                    <span>•</span>
                    <span className="text-indigo-400 font-semibold">
                      SEO: {draft.seo.seoScore}/100
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectDraft(draft);
                      onClose();
                    }}
                    className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    Open <ArrowRight className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteDraft(draft.id)}
                    className="p-1.5 rounded-lg text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Delete Draft"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
