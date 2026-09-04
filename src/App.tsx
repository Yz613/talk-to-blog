import { useState, useEffect } from 'react';
import {
  Mic,
  FileText,
  Search,
  Sparkles,
  History,
  PlusCircle,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  Share2,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { MediumArticle, GenerationOptions, ArticleSeo, VoiceProfile } from './types';
import VoiceStudio from './components/VoiceStudio';
import MediumPreview from './components/MediumPreview';
import SeoDashboard from './components/SeoDashboard';
import DraftsHistoryModal from './components/DraftsHistoryModal';
import VoiceProfileModal from './components/VoiceProfileModal';

const STORAGE_KEY = 'voice_to_medium_drafts_v1';
const MAX_SAVED_DRAFTS = 50;
const VOICE_PROFILE_KEY = 'voxscribe_voice_profile_v1';
const SESSION_API_KEY = 'voxscribe_gemini_key_session';

interface ServiceStatus {
  aiConfigured: boolean;
  generationMode: 'ai' | 'local';
  transcriptionAvailable: boolean;
  keySource?: 'session' | 'server' | 'none';
  serverKeyConfigured?: boolean;
}

interface GeneratedArticleResponse extends Omit<MediumArticle, 'id' | 'createdAt' | 'sourceTranscript' | 'tone'> {
  generationMode: 'ai' | 'local';
}

interface RefinedArticleResponse {
  title?: string;
  subtitle?: string;
  contentMarkdown?: string;
  revisionSummary?: string;
  updatedSeoScore?: number;
  generationMode?: 'ai' | 'local';
}

function isVoiceProfile(value: unknown): value is VoiceProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<VoiceProfile>;
  return Boolean(
    profile.name && profile.summary && profile.writingInstructions && profile.updatedAt &&
    Array.isArray(profile.traits) && Array.isArray(profile.interviewAnswers),
  );
}

export default function App() {
  const [currentArticle, setCurrentArticle] = useState<MediumArticle | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [drafts, setDrafts] = useState<MediumArticle[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'voice' | 'article' | 'seo'>('voice');
  const [rawTranscript, setRawTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [storySession, setStorySession] = useState(0);
  const [isVoiceProfileOpen, setIsVoiceProfileOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem(SESSION_API_KEY) || '');
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(() => {
    try {
      const saved = localStorage.getItem(VOICE_PROFILE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      return isVoiceProfile(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });

  // Load saved drafts from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setDrafts(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load local drafts:', e);
    }
  }, []);

  useEffect(() => {
    fetch('/api/health', {
      headers: apiKey ? { 'x-gemini-api-key': apiKey } : {},
    })
      .then((response) => response.json())
      .then((status: ServiceStatus) => setServiceStatus(status))
      .catch(() => setServiceStatus({
        aiConfigured: false,
        generationMode: 'local',
        transcriptionAvailable: false,
      }));
  }, [apiKey]);

  const apiHeaders = () => ({
    'Content-Type': 'application/json',
    ...(apiKey ? { 'x-gemini-api-key': apiKey } : {}),
  });

  const handleApiKeyChange = (key: string) => {
    sessionStorage.setItem(SESSION_API_KEY, key);
    setApiKey(key);
    showStatus('Gemini connected. Now let’s learn your voice.');
  };

  const handleDisconnectKey = () => {
    sessionStorage.removeItem(SESSION_API_KEY);
    setApiKey('');
    showStatus('The Gemini key was removed from this browser session.');
  };

  const handleSaveVoiceProfile = (profile: VoiceProfile) => {
    localStorage.setItem(VOICE_PROFILE_KEY, JSON.stringify(profile));
    setVoiceProfile(profile);
    showStatus(`Voice learned: ${profile.name}`);
  };

  const showStatus = (message: string, isError = false, duration = 4000) => {
    setStatusIsError(isError);
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), duration);
  };

  // Save drafts to localStorage
  const saveDraftsToStorage = (updatedDrafts: MediumArticle[]) => {
    const limitedDrafts = updatedDrafts.slice(0, MAX_SAVED_DRAFTS);
    setDrafts(limitedDrafts);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limitedDrafts));
    } catch (e) {
      console.warn('Failed to persist drafts:', e);
    }
  };

  const handleImportDrafts = (candidates: unknown[]) => {
    const imported = candidates.filter((candidate): candidate is MediumArticle => {
      if (!candidate || typeof candidate !== 'object') return false;
      const draft = candidate as Partial<MediumArticle>;
      return Boolean(
        draft.id && draft.title && draft.contentMarkdown && draft.createdAt &&
        draft.seo?.seoTitle && Array.isArray(draft.tags?.primaryMediumTags),
      );
    });

    if (!imported.length) {
      showStatus('That backup did not contain any valid VoxScribe stories.', true, 6000);
      return;
    }

    const importedIds = new Set(imported.map((draft) => draft.id));
    saveDraftsToStorage([...imported, ...drafts.filter((draft) => !importedIds.has(draft.id))]);
    showStatus(`Imported ${imported.length} ${imported.length === 1 ? 'story' : 'stories'}.`);
  };

  // Generate article from voice transcript
  const handleGenerate = async (transcript: string, options: GenerationOptions) => {
    setRawTranscript(transcript);
    setIsGenerating(true);
    setStatusIsError(false);
    setStatusMessage('Transforming spoken thoughts into viral Medium article...');

    try {
      const response = await fetch('/api/generate-article', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          transcript,
          tone: options.tone,
          targetAudience: options.targetAudience,
          readingLength: options.readingLength,
          customInstructions: options.customInstructions,
          voiceProfile,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error || 'Failed to generate article.');
      }

      const generatedData = await response.json() as GeneratedArticleResponse;

      const newArticle: MediumArticle = {
        id: `story_${Date.now()}`,
        title: generatedData.title,
        subtitle: generatedData.subtitle,
        alternativeTitles: generatedData.alternativeTitles || [],
        readTimeMinutes: generatedData.readTimeMinutes || 5,
        wordCount: generatedData.wordCount || 1200,
        contentMarkdown: generatedData.contentMarkdown,
        executiveSummary: generatedData.executiveSummary || '',
        seo: generatedData.seo,
        tags: generatedData.tags,
        suggestedPublications: generatedData.suggestedPublications || [],
        createdAt: new Date().toISOString(),
        sourceTranscript: transcript,
        tone: options.tone,
        generationMode: generatedData.generationMode || 'ai',
      };

      setCurrentArticle(newArticle);
      const updatedList = [newArticle, ...drafts.filter((d) => d.id !== newArticle.id)];
      saveDraftsToStorage(updatedList);

      // Switch to preview tab
      setActiveTab('article');
      showStatus(
        generatedData.generationMode === 'local'
          ? 'Local draft ready. Add a Gemini key anytime for a deeper AI writing pass.'
          : 'Article ready! Explore SEO and copy directly to Medium.',
      );
    } catch (error: any) {
      console.error('Error generating article:', error);
      showStatus(`Could not generate the article: ${error.message || 'Unknown error'}`, true, 7000);
    } finally {
      setIsGenerating(false);
    }
  };

  // Refine article section with AI
  const handleRefine = async (instruction: string) => {
    if (!currentArticle) return;
    setIsRefining(true);

    try {
      const response = await fetch('/api/refine-article', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          article: currentArticle,
          instruction,
          voiceProfile,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Refinement failed.');
      }

      const refined = await response.json() as RefinedArticleResponse;

      const updatedArticle: MediumArticle = {
        ...currentArticle,
        title: refined.title || currentArticle.title,
        subtitle: refined.subtitle || currentArticle.subtitle,
        contentMarkdown: refined.contentMarkdown || currentArticle.contentMarkdown,
        seo: {
          ...currentArticle.seo,
          seoScore: refined.updatedSeoScore || currentArticle.seo.seoScore,
        },
        generationMode: refined.generationMode || currentArticle.generationMode,
      };

      setCurrentArticle(updatedArticle);
      const updatedList = drafts.map((d) =>
        d.id === updatedArticle.id ? updatedArticle : d
      );
      saveDraftsToStorage(updatedList);
      showStatus(`Polished: ${refined.revisionSummary || 'Article updated'}`, false, 3500);
    } catch (err: any) {
      showStatus(`Could not refine: ${err.message}`, true, 6000);
    } finally {
      setIsRefining(false);
    }
  };

  // Update article inline fields
  const handleUpdateArticle = (updatedFields: Partial<MediumArticle>) => {
    if (!currentArticle) return;
    const contentMarkdown = updatedFields.contentMarkdown ?? currentArticle.contentMarkdown;
    const updated = {
      ...currentArticle,
      ...updatedFields,
      wordCount: contentMarkdown.trim() ? contentMarkdown.trim().split(/\s+/).length : 0,
      readTimeMinutes: Math.max(1, Math.ceil((contentMarkdown.trim().split(/\s+/).filter(Boolean).length) / 220)),
    };
    setCurrentArticle(updated);
    const updatedList = drafts.map((d) => (d.id === updated.id ? updated : d));
    saveDraftsToStorage(updatedList);
  };

  // Update SEO fields
  const handleUpdateSeo = (updatedSeoFields: Partial<ArticleSeo>) => {
    if (!currentArticle) return;
    const updated: MediumArticle = {
      ...currentArticle,
      seo: { ...currentArticle.seo, ...updatedSeoFields },
    };
    setCurrentArticle(updated);
    const updatedList = drafts.map((d) => (d.id === updated.id ? updated : d));
    saveDraftsToStorage(updatedList);
  };

  // Delete draft
  const handleDeleteDraft = (id: string) => {
    const remaining = drafts.filter((d) => d.id !== id);
    saveDraftsToStorage(remaining);
    if (currentArticle?.id === id) {
      setCurrentArticle(remaining[0] || null);
      if (remaining.length === 0) {
        setActiveTab('voice');
      }
    }
  };

  // Start fresh voice recording
  const handleNewStory = () => {
    setRawTranscript('');
    setStorySession((session) => session + 1);
    setActiveTab('voice');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#E0E0E0] flex flex-col overflow-x-hidden font-sans-ui selection:bg-indigo-600 selection:text-white">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 bg-[#0A0A0C]/90 backdrop-blur-md border-b border-white/5 px-3 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Brand Logo & Name */}
          <div
            onClick={handleNewStory}
            className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none min-w-0"
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg shadow-indigo-600/25">
              <div className="w-3 h-3 bg-white rounded-xs rotate-45"></div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="hidden min-[390px]:inline font-bold tracking-tighter text-xl text-white">
                  VOXSCRIBE
                </span>
                <span className="hidden sm:inline text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  Voice to Medium
                </span>
              </div>
              <p className="text-[11px] text-white/40 hidden sm:block">
                Talk your ideas • Auto SEO • Publication Ready
              </p>
            </div>
          </div>

          {/* Workflow Tabs (When an article is active) */}
          {currentArticle && (
            <div className="hidden md:flex items-center p-1 bg-[#0D0D10] rounded-full border border-white/5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('voice')}
                className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'voice'
                    ? 'bg-white/10 text-white shadow-xs'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                <Mic className="w-3.5 h-3.5 text-indigo-400" />
                Spoken Ideas
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('article')}
                className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'article'
                    ? 'bg-white/10 text-white shadow-xs'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                Medium Story
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('seo')}
                className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'seo'
                    ? 'bg-white/10 text-white shadow-xs'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                <Search className="w-3.5 h-3.5 text-indigo-400" />
                Optimization Hub ({currentArticle.seo.seoScore}/100)
              </button>
            </div>
          )}

          {/* Right Action Tools */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsVoiceProfileOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${voiceProfile ? 'text-emerald-200 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15' : 'text-white/80 bg-white/5 border-white/10 hover:bg-white/10'}`}
              title={voiceProfile ? `Voice profile: ${voiceProfile.name}` : 'Connect Gemini and teach it your voice'}
            >
              <UserRound className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{voiceProfile ? voiceProfile.name : 'My Voice'}</span>
            </button>
            {/* Drafts History */}
            <button
              type="button"
              id="drafts-history-btn"
              onClick={() => setIsHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
              title="View saved stories"
            >
              <History className="w-3.5 h-3.5 text-white/50" />
              <span className="hidden sm:inline">Saved Stories</span>
              {drafts.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-white/10 text-indigo-300 text-[11px] font-bold flex items-center justify-center ml-0.5">
                  {drafts.length}
                </span>
              )}
            </button>

            {/* New Recording Button */}
            <button
              type="button"
              id="new-recording-btn"
              onClick={handleNewStory}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-black hover:bg-gray-200 text-xs font-semibold transition-colors shadow-sm cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">New Voice Note</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        {currentArticle && (
          <div className="md:hidden flex items-center justify-center mt-2.5 pt-2 border-t border-white/5 gap-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('voice')}
              className={`px-3 py-1 rounded-full ${
                activeTab === 'voice'
                  ? 'bg-white text-black font-semibold'
                  : 'bg-white/5 text-white/60'
              }`}
            >
              Voice Note
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('article')}
              className={`px-3 py-1 rounded-full ${
                activeTab === 'article'
                  ? 'bg-white text-black font-semibold'
                  : 'bg-white/5 text-white/60'
              }`}
            >
              Medium Story
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('seo')}
              className={`px-3 py-1 rounded-full ${
                activeTab === 'seo'
                  ? 'bg-white text-black font-semibold'
                  : 'bg-white/5 text-white/60'
              }`}
            >
              SEO Score ({currentArticle.seo.seoScore})
            </button>
          </div>
        )}
      </header>

      {/* Floating Status Notification Toast */}
      {statusMessage && (
        <div role={statusIsError ? 'alert' : 'status'} className={`fixed bottom-6 right-6 z-50 max-w-md bg-[#0D0D10] text-white px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-medium flex items-center gap-2 border ${statusIsError ? 'border-rose-500/40' : 'border-indigo-500/30'}`}>
          <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${statusIsError ? 'text-rose-400' : 'text-indigo-400'}`} />
          {statusMessage}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8">
        {/* If Active Tab is Voice */}
        {activeTab === 'voice' && (
          <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto mb-6">
              <span className="text-indigo-400 font-mono text-xs uppercase tracking-widest block mb-3">
                VOICE-TO-MEDIUM WORKFLOW
              </span>
              <h1 className="text-3xl sm:text-5xl font-serif font-light leading-tight text-white mb-4 italic">
                Turn your spoken thoughts into viral Medium stories
              </h1>
              <p className="text-sm sm:text-base text-white/60 leading-relaxed font-serif">
                Just talk freely into your microphone. Say your ideas, reflections, or arguments. We structure them into high-performing articles with Google &amp; Medium SEO optimization and curated tags.
              </p>
              {serviceStatus && (
                <button type="button" onClick={() => setIsVoiceProfileOpen(true)} className={`inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full border text-xs transition-colors cursor-pointer ${serviceStatus.aiConfigured ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/15' : 'bg-amber-500/10 border-amber-500/20 text-amber-200 hover:bg-amber-500/15'}`}>
                  <span className={`w-2 h-2 rounded-full ${serviceStatus.aiConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {voiceProfile && serviceStatus.aiConfigured
                    ? `Gemini connected · Writing as “${voiceProfile.name}” · Edit profile`
                    : serviceStatus.aiConfigured
                      ? 'Gemini connected · Teach it your voice'
                      : 'Local writing mode · Connect Gemini & teach it your voice'}
                </button>
              )}
            </div>

            <VoiceStudio
              key={storySession}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
              initialTranscript={rawTranscript}
              canTranscribeAudio={serviceStatus?.transcriptionAvailable ?? false}
              apiKey={apiKey}
              onError={(message) => showStatus(message, true, 6000)}
            />

            {/* If user already generated an article in this session, show a shortcut to return to it */}
            {currentArticle && (
              <div className="max-w-4xl mx-auto p-4 rounded-2xl bg-[#0D0D10] border border-white/10 shadow-lg flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center font-serif font-bold text-sm">
                    M
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">
                      Current Generated Article
                    </div>
                    <div className="text-sm font-bold text-white line-clamp-1">
                      {currentArticle.title}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('article')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black hover:bg-gray-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  View Story <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* If Active Tab is Article Preview */}
        {activeTab === 'article' && currentArticle && (
          <div className="space-y-6">
            <MediumPreview
              article={currentArticle}
              onUpdateArticle={handleUpdateArticle}
              onRefineSection={handleRefine}
              isRefining={isRefining}
            />
          </div>
        )}

        {/* If Active Tab is SEO Optimization */}
        {activeTab === 'seo' && currentArticle && (
          <div className="space-y-6">
            <SeoDashboard
              seo={currentArticle.seo}
              onUpdateSeo={handleUpdateSeo}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/5 bg-[#0D0D10] py-4 px-8 text-center text-[10px] text-white/30 tracking-widest uppercase flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>VOXSCRIBE • Engine v2.4.0</span>
        <span>Spoken Voice Dictation • Automated SEO • Publication Ready</span>
      </footer>

      {/* Drafts History Modal */}
      <DraftsHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        drafts={drafts}
        onSelectDraft={(draft) => {
          setCurrentArticle(draft);
          setRawTranscript(draft.sourceTranscript || '');
          setActiveTab('article');
        }}
        onDeleteDraft={handleDeleteDraft}
        onImportDrafts={handleImportDrafts}
        onError={(message) => showStatus(message, true, 6000)}
      />

      <VoiceProfileModal
        isOpen={isVoiceProfileOpen}
        onClose={() => setIsVoiceProfileOpen(false)}
        apiKey={apiKey}
        serverKeyAvailable={Boolean(serviceStatus?.serverKeyConfigured)}
        existingProfile={voiceProfile}
        onApiKeyChange={handleApiKeyChange}
        onDisconnectKey={handleDisconnectKey}
        onSaveProfile={handleSaveVoiceProfile}
      />
    </div>
  );
}
