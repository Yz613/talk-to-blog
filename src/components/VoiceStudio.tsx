import { useState, useEffect, useRef, ChangeEvent } from 'react';
import {
  Mic,
  MicOff,
  Square,
  Sparkles,
  Upload,
  RotateCcw,
  Volume2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  FileText,
  Lightbulb,
  CheckCircle2,
} from 'lucide-react';
import { ArticleLength, ArticleTone, GenerationOptions } from '../types';

interface VoiceStudioProps {
  onGenerate: (transcript: string, options: GenerationOptions) => void;
  isGenerating: boolean;
  initialTranscript?: string;
}

const SAMPLE_TOPICS = [
  {
    title: 'Startup Lessons',
    prompt:
      'I want to talk about the brutal mistakes we made with our first product pricing. We underpriced by 80% because we feared rejection, which attracted the wrong high-maintenance customers. When we quadrupled the price, churn dropped and enterprise clients took us seriously. Here are the 3 hard rules I learned about value-based pricing.',
  },
  {
    title: 'AI Agents & UI',
    prompt:
      'My thesis is that traditional SaaS dashboard UIs are rapidly becoming obsolete. Instead of navigating 15 menus and filters, software is shifting toward conversational and autonomous multi-agent systems. But most teams make the mistake of slapping a chatbot on legacy workflows instead of redesigning the data loop.',
  },
  {
    title: 'Engineering Craft',
    prompt:
      'Reflecting on why keeping code simple is ten times harder than writing complex code. Over-engineering is an emotional coping mechanism for engineers who fear changing requirements. I want to explain how embracing boring technology, tight scope, and deleting unused abstractions saved our engineering velocity.',
  },
  {
    title: 'Remote Work Focus',
    prompt:
      'Deep work in the era of asynchronous notifications. Why Slack and endless micro-status updates destroy flow state, and the deliberate system I built: 3-hour uninterrupted morning blocks, batch-responding to messages twice a day, and treating writing like a superpower.',
  },
];

export default function VoiceStudio({
  onGenerate,
  isGenerating,
  initialTranscript = '',
}: VoiceStudioProps) {
  const [transcript, setTranscript] = useState(initialTranscript);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showOptions, setShowOptions] = useState(false);

  // Settings
  const [tone, setTone] = useState<ArticleTone>('thought-leadership');
  const [targetAudience, setTargetAudience] = useState('Tech founders, developers & creators');
  const [readingLength, setReadingLength] = useState<ArticleLength>('medium');
  const [customInstructions, setCustomInstructions] = useState('');

  // Voice recognition and audio refs
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Update transcript if initialTranscript changes
  useEffect(() => {
    if (initialTranscript) {
      setTranscript(initialTranscript);
    }
  }, [initialTranscript]);

  // Audio waveform visualizer
  const startVisualizer = (stream: MediaStream) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);

      analyser.fftSize = 64;
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!canvasRef.current || !analyserRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        animationFrameRef.current = requestAnimationFrame(draw);
        analyserRef.current.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.85;

          // Gradient color in indigo tones
          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, '#6366f1');
          gradient.addColorStop(1, '#a5b4fc');

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, canvas.height - barHeight, barWidth - 2, barHeight, 3);
          ctx.fill();

          x += barWidth + 1;
        }
      };

      draw();
    } catch (err) {
      console.warn('Audio visualizer init error:', err);
    }
  };

  const stopVisualizer = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // Start speech recognition & microphone recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Start waveform
      startVisualizer(stream);

      // Start MediaRecorder (for backup audio capture & high quality Gemini transcription)
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250);

      // Web Speech API for real-time live dictation
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        let currentBaseTranscript = transcript;
        if (currentBaseTranscript && !currentBaseTranscript.endsWith(' ')) {
          currentBaseTranscript += ' ';
        }

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const item = event.results[i];
            if (item.isFinal) {
              finalTranscript += item[0].transcript + ' ';
            } else {
              interimTranscript += item[0].transcript;
            }
          }

          if (finalTranscript) {
            currentBaseTranscript += finalTranscript;
          }

          setTranscript(currentBaseTranscript + interimTranscript);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition warning/error:', event.error);
        };

        recognition.onend = () => {
          // Restart if still flagged as recording
          if (isRecording && recognitionRef.current) {
            try {
              recognition.start();
            } catch {
              // Ignore if already active
            }
          }
        };

        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch (e) {
          console.warn('Recognition start error:', e);
        }
      }

      setIsRecording(true);
      setRecordingSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access denied:', err);
      alert('Could not access your microphone. Please check your browser microphone permissions.');
    }
  };

  // Stop recording
  const stopRecording = async () => {
    setIsRecording(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch {
        // No-op
      }
    }

    stopVisualizer();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());

      // If transcript is still empty (e.g. Web Speech API was unavailable or silent),
      // we automatically send the recorded audio to Gemini transcribe!
      setTimeout(async () => {
        if (!transcript.trim() && audioChunksRef.current.length > 0) {
          await transcribeRecordedAudioChunks();
        }
      }, 400);
    }
  };

  // Transcribe recorded audio with server-side Gemini 3.5 transcribe
  const transcribeRecordedAudioChunks = async () => {
    try {
      setIsTranscribingAudio(true);
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const reader = new FileReader();

      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        try {
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioData: base64Audio,
              mimeType: 'audio/webm',
            }),
          });
          const data = await res.json();
          if (data.transcript) {
            setTranscript((prev) => (prev ? `${prev}\n\n${data.transcript}` : data.transcript));
          }
        } catch (err) {
          console.error('Fallback transcription error:', err);
        } finally {
          setIsTranscribingAudio(false);
        }
      };

      reader.readAsDataURL(audioBlob);
    } catch (e) {
      console.error('Transcribe error:', e);
      setIsTranscribingAudio(false);
    }
  };

  // Audio file upload handler
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsTranscribingAudio(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      try {
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioData: base64,
            mimeType: file.type || 'audio/mp3',
          }),
        });
        const data = await res.json();
        if (data.transcript) {
          setTranscript((prev) =>
            prev ? `${prev}\n\n${data.transcript}` : data.transcript
          );
        } else if (data.error) {
          alert(`Transcription error: ${data.error}`);
        }
      } catch (err: any) {
        alert(`Failed to transcribe audio file: ${err.message}`);
      } finally {
        setIsTranscribingAudio(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // Format timer MM:SS
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Word count helper
  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  const handleGenerateClick = () => {
    if (!transcript.trim()) {
      alert('Please speak or type your ideas before generating an article.');
      return;
    }
    onGenerate(transcript, {
      tone,
      targetAudience,
      readingLength,
      customInstructions,
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Voice Control Stage */}
      <div className="bg-[#0D0D10] border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-8 relative overflow-hidden">
        {/* Top bar with status */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            {isRecording ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="text-xs font-mono uppercase tracking-wider text-red-400">
                  Recording live ({formatTimer(recordingSeconds)})
                </span>
              </div>
            ) : isTranscribingAudio ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs text-indigo-300">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                <span>Transcribing audio with Gemini...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-white/50">
                <span className="w-2 h-2 rounded-full bg-white/30"></span>
                <span>Ready to listen</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Audio File Upload */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="audio/*"
              className="hidden"
            />
            <button
              type="button"
              id="upload-audio-file-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRecording || isTranscribingAudio}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors cursor-pointer disabled:opacity-40"
              title="Upload existing voice memo (.mp3, .m4a, .wav)"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Audio Note
            </button>

            {/* Clear Button */}
            {transcript && (
              <button
                type="button"
                id="clear-transcript-btn"
                onClick={() => setTranscript('')}
                disabled={isRecording}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/50 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-full transition-colors cursor-pointer"
                title="Clear transcript"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Center Mic Action */}
        <div className="flex flex-col items-center justify-center py-4 sm:py-6">
          <div className="relative mb-5">
            {/* Pulsing ring while recording */}
            {isRecording && (
              <div className="absolute -inset-3 rounded-full bg-rose-500/20 animate-pulse" />
            )}

            <button
              type="button"
              id="mic-toggle-btn"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isTranscribingAudio || isGenerating}
              className={`relative z-10 w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all shadow-xl cursor-pointer ${
                isRecording
                  ? 'bg-rose-600 hover:bg-rose-700 text-white ring-4 ring-rose-500/20 scale-105'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white ring-4 ring-indigo-500/20 hover:scale-105 shadow-indigo-600/30'
              }`}
              title={isRecording ? 'Stop Recording' : 'Start Speaking'}
            >
              {isRecording ? (
                <Square className="w-8 h-8 fill-current" />
              ) : (
                <Mic className="w-9 h-9 text-white" />
              )}
            </button>
          </div>

          <p className="text-base sm:text-lg font-serif font-light text-white italic tracking-tight text-center">
            {isRecording
              ? 'Listening to your ideas... Speak naturally!'
              : transcript.trim()
              ? 'Speak more to expand, or transform your ideas below.'
              : 'Click to start talking — just say whatever is on your mind'}
          </p>
          <p className="text-xs text-white/40 mt-1.5 text-center max-w-md">
            Rant, brainstorm, explain a concept, or outline an opinion. Our AI organizes your thoughts into a Medium masterpiece.
          </p>

          {/* Live Waveform Canvas */}
          <div className={`w-full max-w-md h-12 mt-4 transition-opacity ${isRecording ? 'opacity-100' : 'opacity-0 h-0 pointer-events-none'}`}>
            <canvas
              ref={canvasRef}
              width={400}
              height={48}
              className="w-full h-full rounded"
            />
          </div>
        </div>

        {/* Ideas & Transcript Box */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="raw-transcript-textarea"
              className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              Your Ideas &amp; Raw Brainstorm
            </label>
            <span className="text-xs text-white/40 font-mono">
              {wordCount} {wordCount === 1 ? 'word' : 'words'} captured
            </span>
          </div>

          <div className="relative">
            <textarea
              id="raw-transcript-textarea"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Your spoken thoughts will stream here in real time... You can also type, paste notes, or drop sample ideas below."
              rows={6}
              className="w-full p-4 rounded-xl border border-white/10 bg-[#0A0A0C] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 text-white placeholder-white/20 text-base leading-relaxed transition-all resize-y font-serif"
            />
            {isRecording && (
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-indigo-600/20 border border-indigo-500/30 px-3 py-1 rounded-full text-[11px] font-medium text-indigo-300">
                <Volume2 className="w-3 h-3 animate-pulse text-indigo-400" />
                Live dictation active
              </div>
            )}
          </div>
        </div>

        {/* Topic Inspirations (Quick Sparks) */}
        {!transcript.trim() && (
          <div className="mt-6 pt-5 border-t border-white/5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-3">
              <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
              Need a spark? Click a sample brainstorm to test:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SAMPLE_TOPICS.map((topic, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTranscript(topic.prompt)}
                  className="text-left p-3.5 rounded-xl border border-white/5 bg-[#0A0A0C] hover:bg-indigo-600/10 hover:border-indigo-500/30 transition-all text-xs group cursor-pointer"
                >
                  <div className="font-serif font-medium text-white group-hover:text-indigo-300 mb-1 text-sm">
                    {topic.title}
                  </div>
                  <div className="text-white/40 line-clamp-2 leading-relaxed">
                    {topic.prompt}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Expandable Article Configuration / Settings */}
        <div className="mt-6 pt-5 border-t border-white/5">
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center justify-between w-full text-xs font-medium text-white/60 hover:text-white transition-colors py-1 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
              Article Tone, Publication Fit &amp; SEO Options
            </span>
            <span className="flex items-center gap-1 text-white/40">
              {showOptions ? (
                <>
                  Hide <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Customize <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </span>
          </button>

          {showOptions && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-[#0A0A0C] border border-white/5">
              {/* Tone */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1.5">
                  Writing Tone &amp; Archetype
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as ArticleTone)}
                  className="w-full text-xs bg-[#0D0D10] border border-white/10 rounded-lg p-2.5 text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="thought-leadership">Thought Leadership (Visionary &amp; Authority)</option>
                  <option value="technical-deepdive">Technical Deep Dive (Concrete &amp; Code)</option>
                  <option value="personal-narrative">Personal Story &amp; Reflection</option>
                  <option value="pragmatic-guide">Pragmatic Framework &amp; How-To</option>
                  <option value="opinionated">Opinionated &amp; Contrarian</option>
                </select>
              </div>

              {/* Length */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1.5">
                  Story Read Length
                </label>
                <select
                  value={readingLength}
                  onChange={(e) => setReadingLength(e.target.value as ArticleLength)}
                  className="w-full text-xs bg-[#0D0D10] border border-white/10 rounded-lg p-2.5 text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="short">Snappy (3 - 4 min read, ~900 words)</option>
                  <option value="medium">Standard Medium (5 - 7 min read, ~1,500 words)</option>
                  <option value="in-depth">In-Depth Guide (8 - 10 min read, ~2,400 words)</option>
                </select>
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1.5">
                  Target Reader Audience
                </label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g. Software engineers, Startup founders"
                  className="w-full text-xs bg-[#0D0D10] border border-white/10 rounded-lg p-2.5 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Custom instruction */}
              <div className="sm:col-span-3">
                <label className="block text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1.5">
                  Special Creator Focus (Optional)
                </label>
                <input
                  type="text"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Include a clear 3-step action framework; emphasize Google and Medium algorithm visibility"
                  className="w-full text-xs bg-[#0D0D10] border border-white/10 rounded-lg p-2.5 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Prominent Action Button */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-5 border-t border-white/5">
          <div className="text-xs text-white/40 flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px]">
              ✓
            </div>
            Includes automatic SEO scoring, meta tags, and top 5 Medium tags.
          </div>

          <button
            type="button"
            id="generate-article-btn"
            onClick={handleGenerateClick}
            disabled={!transcript.trim() || isRecording || isGenerating || isTranscribingAudio}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white text-black hover:bg-gray-200 font-semibold text-sm transition-all shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Crafting Medium Article...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-indigo-600" />
                Transform into Medium Article
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
