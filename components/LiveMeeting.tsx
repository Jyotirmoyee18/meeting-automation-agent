import React, { useEffect, useRef, useState } from 'react';
import { TranscriptionEntry } from '../types';

interface LiveMeetingProps {
  transcripts: TranscriptionEntry[];
  onAddTranscript: (entry: TranscriptionEntry) => void;
  onStop: (fullTranscript: string) => void;
  isProcessing: boolean;
  meetingLink?: string;
}

const LiveMeeting: React.FC<LiveMeetingProps> = ({
  transcripts,
  onAddTranscript,
  onStop,
  isProcessing,
  meetingLink,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isBotConnected, setIsBotConnected] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [manualText, setManualText] = useState('');
  const [captureMode, setCaptureMode] = useState<'mic' | 'display+mic' | 'starting'>('starting');
  const [segmentCount, setSegmentCount] = useState(0);
  const [status, setStatus] = useState('Initializing...');

  // ── Refs ───────────────────────────────────────────────────────────────────
  const audioContextRef    = useRef<AudioContext | null>(null);
  const displayStreamRef   = useRef<MediaStream | null>(null);
  const micStreamRef       = useRef<MediaStream | null>(null);
  const recognitionRef     = useRef<any>(null);
  const animationFrameRef  = useRef<number | null>(null);
  const audioElementRef    = useRef<HTMLAudioElement | null>(null);

  // The ONE source of truth for collected speech — a plain ref, written
  // synchronously in onresult, read synchronously in stopListening.
  // Never depends on React state or props.
  const accRef = useRef<string[]>([]);

  // A ref that mirrors the mic stream — recognition restarts only while
  // this stream is alive (tracks are not ended). Immune to StrictMode.
  const activeRef = useRef(false);

  // Stable ref to onAddTranscript so closures never go stale
  const emitRef = useRef(onAddTranscript);
  useEffect(() => { emitRef.current = onAddTranscript; }, [onAddTranscript]);

  const emit = (entry: TranscriptionEntry) => emitRef.current(entry);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  // ── Visualiser ─────────────────────────────────────────────────────────────
  const startVisualiser = (stream: MediaStream) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const tick = () => {
        const d = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(d);
        setAudioLevel(d.reduce((a, b) => a + b, 0) / d.length);
        animationFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('Visualiser error', e);
    }
  };

  // ── Speech Recognition ─────────────────────────────────────────────────────
  // Keyed to the mic stream itself — restarts as long as the stream is live.
  const startRecognition = (micStream: MediaStream) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      emit({ speaker: 'System', text: 'ERROR: Use Chrome or Edge — Speech Recognition not supported here.', timestamp: new Date() });
      setStatus('Not supported');
      return;
    }

    // Stop any previous instance cleanly
    if (recognitionRef.current) {
      try { recognitionRef.current._noRestart = true; recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }

    const rec = new SR();
    rec.continuous    = true;
    rec.interimResults = true;
    rec.lang          = 'en-US';
    rec._noRestart    = false;

    rec.onstart = () => {
      setStatus('Listening — speak now');
    };

    rec.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (!text) continue;
          accRef.current.push(text);
          setSegmentCount(c => c + 1);
          emit({ speaker: 'Speaker', text, timestamp: new Date() });
        }
      }
    };

    // Restart only if the mic stream is still alive and we didn't call stop() ourselves
    rec.onend = () => {
      if (rec._noRestart) return;
      const streamAlive = micStream.getTracks().some(t => t.readyState === 'live');
      if (streamAlive && activeRef.current) {
        setStatus('Restarting recognition...');
        try { rec.start(); } catch (_) {}
      } else {
        setStatus('Recognition stopped');
      }
    };

    rec.onerror = (e: any) => {
      if (e.error === 'no-speech') { setStatus('No speech detected — keep talking'); return; }
      if (e.error === 'aborted')   return; // normal during stop()
      setStatus(`Error: ${e.error}`);
      if (e.error === 'not-allowed') {
        emit({ speaker: 'System', text: 'Microphone permission denied. Allow mic access and refresh.', timestamp: new Date() });
      }
      if (e.error === 'audio-capture') {
        emit({ speaker: 'System', text: 'No microphone detected. Connect a mic and refresh.', timestamp: new Date() });
      }
    };

    rec.start();
    recognitionRef.current = rec;
  };

  // ── Main start ─────────────────────────────────────────────────────────────
  const startListening = async () => {
    // Guard against StrictMode double-invoke — if already active, skip
    if (activeRef.current) return;
    activeRef.current = true;
    accRef.current = [];
    setSegmentCount(0);
    setStatus('Requesting microphone...');

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
        video: false,
      });
      micStreamRef.current = micStream;
      setStatus('Mic granted — starting recognition...');

      startVisualiser(micStream);
      startRecognition(micStream);
      setIsBotConnected(true);

      if (meetingLink) {
        emit({ speaker: 'System', text: 'In the share popup → tick "Share tab audio" → pick your meeting tab.', timestamp: new Date() });
        try {
          const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: true,
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          });
          displayStreamRef.current = displayStream;

          if (audioElementRef.current) {
            audioElementRef.current.srcObject = displayStream;
            audioElementRef.current.volume = 1.0;
            audioElementRef.current.muted = false;
            await audioElementRef.current.play().catch(() => {});
          }

          setCaptureMode('display+mic');
          emit({ speaker: 'System', text: 'Meeting audio playing through speakers — mic is transcribing', timestamp: new Date() });
        } catch {
          setCaptureMode('mic');
          emit({ speaker: 'System', text: 'Screen share skipped — mic-only mode. Speak and your words will appear.', timestamp: new Date() });
        }
      } else {
        setCaptureMode('mic');
        emit({ speaker: 'System', text: 'Mic live — start speaking and your words will appear below.', timestamp: new Date() });
      }
    } catch (err: any) {
      activeRef.current = false;
      setIsBotConnected(false);
      setStatus(`Failed: ${err.message}`);
      emit({ speaker: 'System', text: `Could not start mic: ${err.message}`, timestamp: new Date() });
    }
  };

  // ── Stop ───────────────────────────────────────────────────────────────────
  const stopListening = () => {
    activeRef.current = false;
    setIsBotConnected(false);

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    // Stop recognition cleanly (flag prevents onend restart)
    if (recognitionRef.current) {
      recognitionRef.current._noRestart = true;
      try { recognitionRef.current.stop(); } catch (_) {}
    }

    micStreamRef.current?.getTracks().forEach(t => t.stop());
    displayStreamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close().catch(() => {});
    if (audioElementRef.current) audioElementRef.current.srcObject = null;

    const speechText = accRef.current.join(' ').trim();
    const finalTranscript = speechText || manualText.trim();
    onStop(finalTranscript || '[No speech detected — session ended]');
  };

  // ── Manual add ─────────────────────────────────────────────────────────────
  const handleManualAdd = () => {
    const text = manualText.trim();
    if (!text) return;
    accRef.current.push(text);
    setSegmentCount(c => c + 1);
    emit({ speaker: 'Speaker', text, timestamp: new Date() });
    setManualText('');
  };

  // ── Mount — StrictMode safe ────────────────────────────────────────────────
  useEffect(() => {
    startListening();
    return () => {
      // On StrictMode unmount: stop everything and reset active flag
      activeRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current._noRestart = true;
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      displayStreamRef.current?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <audio ref={audioElementRef} autoPlay playsInline style={{ display: 'none' }} />

      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-[650px] animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isBotConnected ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                <i className={`fas ${meetingLink ? 'fa-network-wired' : 'fa-microphone'} text-white text-lg`}></i>
              </div>
              {isBotConnected && (
                <div className="absolute -bottom-1 -right-1 flex items-end gap-0.5 bg-white p-1 rounded-md shadow-sm border border-slate-100 h-5 w-12 overflow-hidden">
                  {[1,2,3,4,5,6].map(i => (
                    <div key={i} className="bg-indigo-500 w-1 rounded-full transition-all duration-75"
                      style={{ height: `${Math.min(100, (audioLevel / 50) * (Math.random() * 50 + 50))}%` }} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 leading-tight">
                {meetingLink ? 'Meeting Transcriber' : 'Microphone Transcriber'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">{status}</p>
            </div>
          </div>

          <button onClick={stopListening} disabled={isProcessing}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-100 transition-all disabled:opacity-50">
            <i className="fas fa-power-off"></i>
            {isProcessing ? 'Processing...' : 'Finish Session'}
          </button>
        </div>

        {/* Status bar — always visible so you can debug */}
        <div className={`px-4 py-2 text-xs font-semibold flex items-center justify-between
          ${segmentCount > 0 ? 'bg-emerald-50 text-emerald-700 border-b border-emerald-100'
                             : 'bg-amber-50 text-amber-700 border-b border-amber-100'}`}>
          <span>
            {segmentCount > 0
              ? `✓ ${segmentCount} speech segment${segmentCount !== 1 ? 's' : ''} captured`
              : '⏳ Waiting for speech — speak now'}
          </span>
          <span className="opacity-60 text-[10px] uppercase tracking-widest">
            {captureMode === 'display+mic' ? 'Tab Audio + Mic' : captureMode === 'mic' ? 'Mic Only' : 'Starting'}
          </span>
        </div>

        {/* Transcript feed */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/20">

          {transcripts.filter(t => t.speaker !== 'System').length === 0 && !isProcessing && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 space-y-3">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl">
                <i className="fas fa-comment-dots animate-pulse"></i>
              </div>
              <p className="text-sm font-medium text-center max-w-xs">
                Speak clearly<br />
                
              </p>
            </div>
          )}

          {transcripts.map((entry, idx) => (
            <div key={idx}
              className={`flex flex-col ${entry.speaker === 'System' ? 'items-center' : 'items-start'} animate-in fade-in slide-in-from-left-2`}>
              {entry.speaker === 'System' ? (
                <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-full shadow-sm">
                  <span className="text-xs font-bold text-indigo-600 italic flex items-center gap-2 uppercase tracking-tight">
                    <i className="fas fa-info-circle text-[10px]"></i>{entry.text}
                  </span>
                </div>
              ) : (
                <div className="max-w-[90%] group">
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Live Feed</span>
                    <div className="h-px w-8 bg-slate-200"></div>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none shadow-sm group-hover:border-indigo-200 transition-colors">
                    <p className="text-slate-800 leading-relaxed text-sm md:text-base font-medium">{entry.text}</p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-12 animate-in fade-in duration-700">
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <i className="fas fa-brain text-indigo-600 text-2xl animate-pulse"></i>
                </div>
              </div>
              <h4 className="text-indigo-900 font-bold text-xl mb-2">Creating Meeting Intelligence</h4>
              <p className="text-slate-500 text-sm max-w-xs text-center font-medium">Summarizing session and extracting tasks...</p>
            </div>
          )}
        </div>

        {/* Manual input fallback */}
        {!isProcessing && (
          <div className="px-4 py-3 border-t border-slate-100 bg-white flex gap-2 items-center">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide whitespace-nowrap">Manual:</span>
            <input type="text" value={manualText}
              onChange={e => setManualText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualAdd()}
              placeholder="Mic not working? Paste transcript here and press Enter"
              className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-700 placeholder-slate-400"
            />
            <button onClick={handleManualAdd} disabled={!manualText.trim()}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-all">
              Add
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <span>Browser Speech</span>
          <div className="flex gap-0.5">
            {[1,2,3].map(i => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${isBotConnected ? 'bg-emerald-400' : 'bg-slate-300'}`} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default LiveMeeting;