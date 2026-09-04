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

const INTERVIEW_QUESTIONS = [
  {
    question: 'Explain an idea you care about to one smart friend.',
    hint: 'Write naturally. Don’t polish it—your phrasing and rhythm are what we want to learn.',
  },
  {
    question: 'Tell a short story about a time you changed your mind.',
    hint: 'Include the part you would emphasize if you were telling this story out loud.',
  },
  {
    question: 'What is a strong opinion you hold about your work or industry?',
    hint: 'Say it the way you actually would, including any caveats or sharp edges.',
  },
  {
    question: 'Teach me how to do something you know well.',
    hint: 'A few paragraphs are ideal. This reveals how you structure explanations.',
  },
  {
    question: 'How do humor, emotion, and vulnerability show up in your writing?',
    hint: 'Examples help, but an honest description is enough.',
  },
  {
    question: 'Write a paragraph that sounds unmistakably like you.',
    hint: 'It can be about anything. Think of this as the strongest voice sample in the interview.',
  },
] as const;

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
        if (Array.isArray(parsed) && parsed.length === INTERVIEW_QUESTIONS.length) {
          return parsed;
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
    setStage(hasAiAccess ? (existingProfile ? 'overview' : 'interview') : 'key');
    if (existingProfile?.interviewAnswers?.length) {
      setAnswers(INTERVIEW_QUESTIONS.map(({ question }) =>
        existingProfile.interviewAnswers.find((item) => item.question === question)?.answer || '',
      ));
    } else {
      try {
        const saved = localStorage.getItem(INTERVIEW_DRAFT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === INTERVIEW_QUESTIONS.length) {
            setAnswers(parsed);
          }
        }
      } catch {}
    }
  }, [isOpen, hasAiAccess, existingProfile]);

  const completedAnswers = useMemo(
    () => answers.filter((answer) => answer.trim().length >= 20).length,
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
      answer: answers[index].trim(),
    })).filter((item) => item.answer.length >= 20);

    if (interviewAnswers.length < 3) {
      setError('Complete at least three answers with a little detail so Gemini has enough voice to study.');
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
  const canAdvance = answers[questionIndex].trim().length >= 20;

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
            <div className="flex items-center justify-between gap-4 mb-7">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-400 font-bold">Voice interview</p>
                <p className="text-xs text-white/40 mt-1">Question {questionIndex + 1} of {INTERVIEW_QUESTIONS.length} · {completedAnswers} answered</p>
              </div>
              <div className="flex gap-1">
                {INTERVIEW_QUESTIONS.map((_, index) => (
                  <span key={index} className={`h-1.5 rounded-full transition-all ${index === questionIndex ? 'w-7 bg-indigo-400' : answers[index].trim().length >= 20 ? 'w-3 bg-emerald-400/70' : 'w-3 bg-white/10'}`} />
                ))}
              </div>
            </div>

            <h3 className="text-2xl sm:text-3xl font-serif italic leading-tight text-white">{current.question}</h3>
            <p className="text-sm text-white/45 mt-2 leading-relaxed">{current.hint}</p>
            <div className="flex justify-end mt-5 mb-2">
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={isBusy || isTranscribingAnswer}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
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
                    Transcribing answer with Gemini...
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
              rows={8}
              value={answers[questionIndex]}
              onChange={(event) => setAnswers((currentAnswers) => currentAnswers.map((answer, index) => index === questionIndex ? event.target.value : answer))}
              placeholder="Answer the way you would actually say it…"
              className="w-full p-4 rounded-2xl border border-white/10 bg-[#09090B] text-white placeholder-white/20 text-base leading-relaxed resize-y font-serif focus:outline-none focus:border-indigo-500"
            />
            <div className="flex items-center justify-between mt-5">
              <button type="button" onClick={() => { stopListening(); setQuestionIndex((index) => Math.max(0, index - 1)); }} disabled={questionIndex === 0 || isBusy} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs text-white/50 hover:text-white disabled:opacity-25 cursor-pointer">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              {isLastQuestion ? (
                <button type="button" onClick={() => { stopListening(); void analyzeVoice(); }} disabled={isBusy || isListening || completedAnswers < 3} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer">
                  {isBusy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isBusy ? 'Learning your voice…' : 'Build my voice profile'}
                </button>
              ) : (
                <button type="button" onClick={() => { stopListening(); setQuestionIndex((index) => Math.min(INTERVIEW_QUESTIONS.length - 1, index + 1)); }} disabled={!canAdvance || isBusy || isListening} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-200 disabled:opacity-40 cursor-pointer">
                  Next <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
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
