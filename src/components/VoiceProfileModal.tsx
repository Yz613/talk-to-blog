import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  LoaderCircle,
  Mic,
  Square,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import type { VoiceInterviewAnswer, VoiceProfile } from '../types';

export interface InterviewQuestion {
  question: string;
  hint: string;
  placeholder?: string;
  options?: string[];
}

const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    question: 'How does humor or edge show up in your writing?',
    hint: 'Pick the vibe that feels closest to you, or write your own take.',
    options: [
      'Dry, sarcastic, with understated deadpan humor.',
      'Playful, witty, and lighthearted—I like making the reader smile.',
      'Brutally direct and no-nonsense—I cut straight to the point.',
      'Warm, sincere, and thoughtful—I rarely use jokes.',
    ],
  },
  {
    question: 'What sentence rhythm feels most like your natural voice?',
    hint: 'Choose your cadence or describe how your thoughts flow.',
    options: [
      'Short. Punchy. Staccato bursts that keep momentum fast.',
      'Conversational and flowing, like talking over coffee.',
      'Structured and analytical: big claim first, followed by clear evidence.',
      'Story-driven and expressive, with rich metaphors and varied tempo.',
    ],
  },
  {
    question: 'What is a one-sentence hot take you believe that most people get wrong?',
    hint: 'Don’t overthink it—spit out one unfiltered sentence.',
    placeholder: 'e.g. Most productivity advice is just procrastination in disguise.',
  },
  {
    question: 'How do you prefer to hook a reader in the opening lines?',
    hint: 'Select your preferred opening style.',
    options: [
      'Start right in the middle of the drama—zero fluff or warm-up.',
      'A relatable personal story or mistake that reveals a bigger lesson.',
      'A counter-intuitive claim or question that challenges assumptions.',
      'A clear, bold promise of the exact problem we are going to solve.',
    ],
  },
  {
    question: 'Explain an idea you care about to one smart friend.',
    hint: 'Write or speak the way you would text them. Phrasing and rhythm matter more than polish.',
    placeholder: 'The thing most people miss about this is...',
  },
  {
    question: 'What is your stance on buzzwords and industry jargon?',
    hint: 'Pick your philosophy on language.',
    options: [
      'Zero BS. Plain everyday English. If a fifth grader won’t get it, rewrite it.',
      'Professional and crisp, but never stiff or academic.',
      'Insider slang is fine when speaking to experts, but never corporate fluff.',
      'I love vivid analogies and everyday metaphors over technical jargon.',
    ],
  },
  {
    question: 'Tell a quick story about a time you realized you were wrong.',
    hint: 'Even 1–2 sentences showing what changed your mind reveals your humility and tone.',
    placeholder: 'I used to believe... until I realized...',
  },
  {
    question: 'What writing clichés or AI-sounding tropes make you cringe?',
    hint: 'Name any words, phrases, or habits to strictly avoid.',
    options: [
      'Words like "delve", "testament", "tapestry", "game-changer", and "in today\'s fast-paced world".',
      'Passive voice, endless rhetorical questions, and hollow motivational quotes.',
      'Overly academic fluff, dense walls of text, and pretentious vocabulary.',
      'Fake excitement with excessive exclamation marks and syrupy cheerfulness.',
    ],
  },
  {
    question: 'How do you like your articles structured visually on the page?',
    hint: 'Pick the visual layout you prefer.',
    options: [
      'Lots of white space: 1-2 sentence paragraphs with bold key takeaways.',
      'Traditional essay style: cohesive, well-developed narrative paragraphs.',
      'Tactical & scannable: bulleted lists, subheadings, and actionable callouts.',
      'Rhythmic mix: alternate between short punchlines and deeper explanations.',
    ],
  },
  {
    question: 'What is your single best rule or piece of advice?',
    hint: 'Give your micro-lesson in 1 or 2 sentences with your natural authority.',
    placeholder: 'Never trade long-term reputation for short-term convenience.',
  },
  {
    question: 'How do you like to end an article or essay?',
    hint: 'Pick your signature sign-off style.',
    options: [
      'A sharp punchline or mic-drop sentence that lingers.',
      'An open question that leaves the reader chewing on the idea all day.',
      'A direct call to action: what the reader should go do right now.',
      'A warm, reflective conclusion tying back to the original theme.',
    ],
  },
  {
    question: 'Write or speak a sentence or two that sounds unmistakably like you.',
    hint: 'It can be about anything. This is your purest signature voice sample.',
    placeholder: 'Say something the way only you would say it...',
  },
];

type Stage = 'key' | 'interview' | 'overview';

interface VoiceProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  serverKeyAvailable: boolean;
  existingProfile: VoiceProfile | null;
  onApiKeyChange: (apiKey: string) => void;
  onDisconnectKey: () => void;
  onSaveProfile: (profile: VoiceProfile) => void;
}

export default function VoiceProfileModal({
  isOpen,
  onClose,
  apiKey,
  serverKeyAvailable,
  existingProfile,
  onApiKeyChange,
  onDisconnectKey,
  onSaveProfile,
}: VoiceProfileModalProps) {
  const INTERVIEW_DRAFT_KEY = 'voxscribe_interview_draft';
  const hasAiAccess = Boolean(apiKey || serverKeyAvailable);
  const [stage, setStage] = useState<Stage>('key');
  const [keyInput, setKeyInput] = useState('');
  const [answers, setAnswers] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('voxscribe_interview_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return INTERVIEW_QUESTIONS.map((_, i) => parsed[i] || '');
        }
      }
    } catch {}
    return INTERVIEW_QUESTIONS.map(() => '');
  });
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribingAnswer, setIsTranscribingAnswer] = useState(false);
  const [error, setError] = useState('');

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const activeQuestionIndexRef = useRef(questionIndex);
  const initialAnswerForTurnRef = useRef('');

  useEffect(() => {
    activeQuestionIndexRef.current = questionIndex;
  }, [questionIndex]);

  useEffect(() => {
    try {
      localStorage.setItem(INTERVIEW_DRAFT_KEY, JSON.stringify(answers));
    } catch {}
  }, [answers]);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setKeyInput('');
    setStage(existingProfile ? 'overview' : (hasAiAccess ? 'interview' : 'key'));
    if (existingProfile?.interviewAnswers?.length) {
      setAnswers(INTERVIEW_QUESTIONS.map(({ question }) =>
        existingProfile.interviewAnswers.find((item) => item.question === question)?.answer || '',
      ));
    } else {
      try {
        const saved = localStorage.getItem(INTERVIEW_DRAFT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setAnswers(INTERVIEW_QUESTIONS.map((_, i) => parsed[i] || ''));
          }
        }
      } catch {}
    }
  }, [isOpen, hasAiAccess, existingProfile]);

  const completedAnswers = useMemo(
    () => answers.filter((answer) => Boolean(answer && answer.trim().length >= 3)).length,
    [answers],
  );

  const cleanupRecording = () => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {}
    mediaRecorderRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setIsListening(false);
  };

  useEffect(() => {
    if (!isOpen) {
      cleanupRecording();
    }
  }, [isOpen]);

  useEffect(() => () => {
    cleanupRecording();
  }, []);

  if (!isOpen) return null;

  const connectKey = async (event: FormEvent) => {
    event.preventDefault();
    const candidate = keyInput.trim();
    if (candidate.length < 10) {
      setError('Paste a complete Gemini API key.');
      return;
    }

    setIsBusy(true);
    setError('');
    try {
      const response = await fetch('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-gemini-api-key': candidate },
      });
      const data = await response.json() as { error?: string; connected?: boolean };
      if (!response.ok) throw new Error(data.error || 'Gemini could not verify that key.');
      onApiKeyChange(candidate);
      setKeyInput('');
      setStage(existingProfile ? 'overview' : 'interview');
    } catch (requestError: any) {
      setError(requestError?.message || 'Gemini could not verify that key.');
    } finally {
      setIsBusy(false);
    }
  };

  const analyzeVoice = async () => {
    const interviewAnswers: VoiceInterviewAnswer[] = INTERVIEW_QUESTIONS.map(({ question }, index) => ({
      question,
      answer: (answers[index] || '').trim(),
    })).filter((item) => item.answer.length >= 3);

    if (interviewAnswers.length < 2) {
      setError('Answer at least two questions (or select options) so Gemini has enough voice cues to study.');
      return;
    }

    setIsBusy(true);
    setError('');
    try {
      const response = await fetch('/api/analyze-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-gemini-api-key': apiKey } : {}),
        },
        body: JSON.stringify({ answers: interviewAnswers }),
      });
      const data = await response.json() as Partial<VoiceProfile> & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Gemini could not analyze your voice.');
      onSaveProfile({
        name: String(data.name || 'My Voice'),
        summary: String(data.summary || 'A voice profile learned from your interview answers.'),
        traits: Array.isArray(data.traits) ? data.traits.map(String) : [],
        sentenceStyle: String(data.sentenceStyle || ''),
        vocabulary: Array.isArray(data.vocabulary) ? data.vocabulary.map(String) : [],
        signatureMoves: Array.isArray(data.signatureMoves) ? data.signatureMoves.map(String) : [],
        avoidances: Array.isArray(data.avoidances) ? data.avoidances.map(String) : [],
        writingInstructions: String(data.writingInstructions || ''),
        interviewAnswers,
        updatedAt: new Date().toISOString(),
      });
      try {
        localStorage.removeItem(INTERVIEW_DRAFT_KEY);
      } catch {}
      setStage('overview');
    } catch (requestError: any) {
      setError(requestError?.message || 'Gemini could not analyze your voice.');
    } finally {
      setIsBusy(false);
    }
  };

  const current = INTERVIEW_QUESTIONS[questionIndex];
  const isLastQuestion = questionIndex === INTERVIEW_QUESTIONS.length - 1;

  const startListening = async () => {
    setError('');
    const targetIndex = questionIndex;
    activeQuestionIndexRef.current = targetIndex;
    initialAnswerForTurnRef.current = answers[targetIndex] || '';

    // Start MediaRecorder so raw microphone audio is captured even if browser SpeechRecognition fails (e.g. Brave)
    let stream: MediaStream | null = null;
    if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        mediaRecorderRef.current = recorder;
        recorder.start(250);
      } catch (err) {
        console.warn('Microphone stream error in modal:', err);
      }
    }

    // Try Web Speech API for live dictation if available
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let recognitionStarted = false;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';

        let committed = answers[targetIndex].trim();
        if (committed) committed += ' ';

        recognition.onresult = (event: any) => {
          let finalText = '';
          let interimText = '';
          for (let index = event.resultIndex; index < event.results.length; index++) {
            const result = event.results[index];
            if (result.isFinal) finalText += `${result[0].transcript} `;
            else interimText += result[0].transcript;
          }
          if (finalText) committed += finalText;
          setAnswers((currentAnswers) => currentAnswers.map((answer, index) =>
            index === targetIndex ? `${committed}${interimText}`.trim() : answer,
          ));
        };

        recognition.onerror = (event: any) => {
          console.warn('SpeechRecognition warning in modal:', event.error);
          if (event.error === 'network' || event.error === 'not-allowed') {
            if (!stream) {
              setError(`Live voice input stopped: ${event.error}. You can type your answer.`);
            }
          }
        };

        recognition.onend = () => {
          recognitionRef.current = null;
        };

        recognitionRef.current = recognition;
        recognition.start();
        recognitionStarted = true;
      } catch (recErr) {
        console.warn('Recognition start failed in modal:', recErr);
      }
    }

    if (!stream && !recognitionStarted) {
      setError('Voice answers are not supported in this browser. You can type your answer instead.');
      return;
    }

    setIsListening(true);
  };

  const stopListening = async () => {
    setIsListening(false);
    const targetIndex = activeQuestionIndexRef.current;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = async () => {
        const currentAnswer = answers[targetIndex] || '';
        const initialAnswer = initialAnswerForTurnRef.current || '';
        const speechProducedText = currentAnswer.trim().length > initialAnswer.trim().length;

        // If SpeechRecognition produced nothing (e.g. Brave blocking), fallback to Gemini server transcription
        if (!speechProducedText && audioChunksRef.current.length > 0) {
          if (hasAiAccess) {
            await transcribeInterviewAudio(targetIndex, [...audioChunksRef.current]);
          } else {
            setError('No speech text was detected. Enable Google speech services in Brave settings, connect Gemini, or type your answer.');
          }
        }

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
      };
      recorder.stop();
    } else {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
    }
  };

  const transcribeInterviewAudio = async (targetIndex: number, chunks: Blob[]) => {
    try {
      setIsTranscribingAnswer(true);
      setError('');
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      const reader = new FileReader();

      await new Promise<void>((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            const base64Audio = reader.result as string;
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'x-gemini-api-key': apiKey } : {}),
              },
              body: JSON.stringify({
                audioData: base64Audio,
                mimeType: 'audio/webm',
              }),
            });
            const data = await res.json() as { transcript?: string; error?: string };
            if (!res.ok) throw new Error(data.error || 'Gemini could not transcribe audio.');
            if (data.transcript) {
              setAnswers((prev) => prev.map((ans, idx) => {
                if (idx !== targetIndex) return ans;
                const trimmed = ans.trim();
                return trimmed ? `${trimmed}\n\n${data.transcript}` : data.transcript;
              }));
            }
            resolve();
          } catch (err: any) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
    } catch (err: any) {
      console.error('Interview transcription error:', err);
      setError(err?.message || 'Failed to transcribe your voice answer.');
    } finally {
      setIsTranscribingAnswer(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md">
      <div role="dialog" aria-modal="true" aria-labelledby="voice-profile-title" className="bg-[#0D0D10] border border-white/10 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-5 sm:px-7 py-4 bg-[#0D0D10]/95 backdrop-blur border-b border-white/5 rounded-t-3xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
              <UserRound className="w-4.5 h-4.5 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <h2 id="voice-profile-title" className="text-base font-semibold text-white">My Voice</h2>
              <p className="text-[11px] text-white/40 truncate">Teach VoxScribe how you naturally think and write</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close My Voice setup" className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {stage === 'key' && (
          <form onSubmit={connectKey} className="p-6 sm:p-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20 mb-5">
              <KeyRound className="w-5 h-5" />
            </div>
            <h3 className="text-2xl sm:text-3xl font-serif italic text-white">Connect your Gemini key</h3>
            <p className="text-sm leading-relaxed text-white/55 mt-2 max-w-xl">
              Your key is kept only in this browser tab’s session. It is sent through this local app directly to Gemini for writing and voice analysis, and is never saved in drafts, local storage, or the repository.
            </p>

            <label htmlFor="gemini-key" className="block text-[10px] uppercase tracking-[0.18em] text-white/50 font-bold mt-7 mb-2">Gemini API key</label>
            <input
              id="gemini-key"
              type="password"
              autoComplete="off"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="Paste your Gemini API key"
              className="w-full px-4 py-3.5 bg-[#09090B] border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500"
            />

            {error && <p role="alert" className="text-xs text-rose-300 mt-3">{error}</p>}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-indigo-300 hover:text-indigo-200 hover:underline">Get a key from Google AI Studio ↗</a>
              <button type="submit" disabled={isBusy || !keyInput.trim()} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-200 disabled:opacity-40 cursor-pointer">
                {isBusy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-indigo-600" />}
                {isBusy ? 'Verifying…' : 'Verify & continue'}
              </button>
            </div>
          </form>
        )}

        {stage === 'interview' && (
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-400 font-bold">Voice Interview</p>
                <p className="text-xs text-white/45 mt-0.5">
                  Question {questionIndex + 1} of {INTERVIEW_QUESTIONS.length} ·{' '}
                  <span className={completedAnswers >= 2 ? 'text-emerald-400 font-medium' : 'text-white/40'}>
                    {completedAnswers} answered
                  </span>
                  {completedAnswers < 2 ? ' (minimum 2 needed)' : ' — skip or answer more for precision'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full scrollbar-none">
                {INTERVIEW_QUESTIONS.map((_, index) => {
                  const isCurrent = index === questionIndex;
                  const isAnswered = Boolean(answers[index]?.trim() && answers[index].trim().length >= 3);
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        stopListening();
                        setQuestionIndex(index);
                      }}
                      title={`Jump to Question ${index + 1}${isAnswered ? ' (Answered)' : ''}`}
                      className={`h-2 rounded-full transition-all cursor-pointer ${
                        isCurrent
                          ? 'w-6 bg-indigo-400'
                          : isAnswered
                            ? 'w-2.5 bg-emerald-400 hover:bg-emerald-300'
                            : 'w-2 bg-white/15 hover:bg-white/30'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            <h3 className="text-2xl sm:text-3xl font-serif italic leading-tight text-white">{current.question}</h3>
            <p className="text-sm text-white/45 mt-2 leading-relaxed">{current.hint}</p>

            {/* Multiple Choice Options if available */}
            {current.options && current.options.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-5 mb-3">
                {current.options.map((option, optIdx) => {
                  const isSelected = answers[questionIndex]?.trim() === option;
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => {
                        stopListening();
                        setAnswers((currentAnswers) =>
                          currentAnswers.map((ans, idx) => (idx === questionIndex ? option : ans)),
                        );
                      }}
                      className={`text-left p-3.5 rounded-xl border text-xs leading-relaxed transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm shadow-indigo-500/20 ring-1 ring-indigo-500'
                          : 'bg-[#09090B] border-white/10 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                            isSelected ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-white/20 bg-white/5'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <span className="min-w-0">{option}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between mt-4 mb-2">
              <span className="text-[11px] text-white/35">
                {current.options ? 'Or tweak in your own words / speak:' : 'Your answer:'}
              </span>
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={isBusy || isTranscribingAnswer}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                  isTranscribingAnswer
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                    : isListening
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                {isTranscribingAnswer ? (
                  <>
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                    Transcribing...
                  </>
                ) : isListening ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Stop listening
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-indigo-300" />
                    Answer by voice
                  </>
                )}
              </button>
            </div>

            <textarea
              autoFocus
              rows={current.options ? 3 : 5}
              value={answers[questionIndex] || ''}
              onChange={(event) =>
                setAnswers((currentAnswers) =>
                  currentAnswers.map((answer, index) => (index === questionIndex ? event.target.value : answer)),
                )
              }
              placeholder={current.placeholder || 'Answer naturally or paste a sample…'}
              className="w-full p-4 rounded-2xl border border-white/10 bg-[#09090B] text-white placeholder-white/20 text-sm sm:text-base leading-relaxed resize-y font-serif focus:outline-none focus:border-indigo-500"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => {
                  stopListening();
                  setQuestionIndex((index) => Math.max(0, index - 1));
                }}
                disabled={questionIndex === 0 || isBusy}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-white/50 hover:text-white disabled:opacity-25 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>

              <div className="flex items-center gap-2">
                {!isLastQuestion && (
                  <button
                    type="button"
                    onClick={() => {
                      stopListening();
                      setQuestionIndex((index) => Math.min(INTERVIEW_QUESTIONS.length - 1, index + 1));
                    }}
                    disabled={isBusy || isListening}
                    className="px-3.5 py-2 text-xs text-white/50 hover:text-white cursor-pointer"
                  >
                    Skip
                  </button>
                )}

                {completedAnswers >= 2 && !isLastQuestion && (
                  <button
                    type="button"
                    onClick={() => {
                      stopListening();
                      void analyzeVoice();
                    }}
                    disabled={isBusy || isListening}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 text-xs font-semibold cursor-pointer transition-all"
                    title="Build your profile now with your answered questions"
                  >
                    {isBusy ? (
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    {isBusy ? 'Learning...' : `Build profile (${completedAnswers})`}
                  </button>
                )}

                {isLastQuestion ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopListening();
                      void analyzeVoice();
                    }}
                    disabled={isBusy || isListening || completedAnswers < 2}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer shadow-lg shadow-indigo-600/30"
                  >
                    {isBusy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isBusy ? 'Learning your voice…' : `Build my voice profile (${completedAnswers} answered)`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      stopListening();
                      setQuestionIndex((index) => Math.min(INTERVIEW_QUESTIONS.length - 1, index + 1));
                    }}
                    disabled={isBusy || isListening}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-200 cursor-pointer"
                  >
                    Next <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {error && <p role="alert" className="text-xs text-rose-300 mt-4 text-right">{error}</p>}
          </div>
        )}

        {stage === 'overview' && existingProfile && (
          <div className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-emerald-300" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 font-bold">Active voice profile</p>
                <h3 className="text-2xl sm:text-3xl font-serif italic text-white mt-1">{existingProfile.name}</h3>
              </div>
            </div>
            <p className="text-sm text-white/60 leading-relaxed mt-5">{existingProfile.summary}</p>

            <div className="mt-6 grid sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-[#09090B] border border-white/5">
                <p className="text-[10px] uppercase tracking-widest text-white/35 font-bold mb-2">Voice traits</p>
                <div className="flex flex-wrap gap-1.5">{existingProfile.traits.map((trait) => <span key={trait} className="px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200">{trait}</span>)}</div>
              </div>
              <div className="p-4 rounded-xl bg-[#09090B] border border-white/5">
                <p className="text-[10px] uppercase tracking-widest text-white/35 font-bold mb-2">Sentence style</p>
                <p className="text-xs text-white/60 leading-relaxed">{existingProfile.sentenceStyle}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/15 mt-3">
              <p className="text-[10px] uppercase tracking-widest text-indigo-300 font-bold mb-2">How VoxScribe will write</p>
              <p className="text-xs text-white/60 leading-relaxed">{existingProfile.writingInstructions}</p>
            </div>

            {existingProfile.adaptationNotes && existingProfile.adaptationNotes.length > 0 && (
              <div className="p-4 rounded-xl bg-indigo-950/25 border border-indigo-500/25 mt-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-indigo-400 font-bold mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Learned from your story edits
                </div>
                <ul className="space-y-1.5">
                  {existingProfile.adaptationNotes.slice(-3).map((note, index) => (
                    <li key={index} className="text-xs text-white/70 flex items-start gap-2 leading-relaxed">
                      <span className="text-indigo-400 mt-0.5">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-white/30 mt-4">Applied automatically to every new Gemini article and refinement. Updated {new Date(existingProfile.updatedAt).toLocaleDateString()}.</p>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-7 pt-5 border-t border-white/5">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setQuestionIndex(0); setStage('interview'); }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/70 cursor-pointer"><RefreshCw className="w-3.5 h-3.5" /> Retake interview</button>
                <button type="button" onClick={() => setStage('key')} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs text-white/50 hover:text-white cursor-pointer"><KeyRound className="w-3.5 h-3.5" /> {apiKey ? 'Replace key' : 'Use session key'}</button>
                {apiKey && <button type="button" onClick={() => { onDisconnectKey(); if (!serverKeyAvailable) setStage('key'); }} className="px-4 py-2 text-xs text-white/40 hover:text-rose-300 cursor-pointer">Forget session key</button>}
              </div>
              <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-200 cursor-pointer">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
