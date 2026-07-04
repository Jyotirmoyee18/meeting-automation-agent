import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTabCapture } from '../hooks/useTabCapture';
import { useTranscript } from '../hooks/useTranscript';
import {
  ConnectionState,
  WsServerMessage,
  TranscriptSegment,
  AppError,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTimestamp(sec: number | null): string {
  if (sec === null) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SPEAKER_COLORS = [
  'bg-indigo-100 text-indigo-800 border-indigo-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
];

function speakerColor(speaker: number | string | null): string {
  if (speaker === null) return 'bg-slate-100 text-slate-700 border-slate-200';
  let idx = 0;
  if (typeof speaker === 'number') {
    idx = speaker;
  } else if (typeof speaker === 'string' && speaker.length > 0) {
    idx = speaker.charCodeAt(0) - 65;
    if (isNaN(idx) || idx < 0) idx = 0;
  }
  return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
}

// ─── Connection Status Badge ──────────────────────────────────────────────────

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const map: Record<ConnectionState, { label: string; cls: string; dot: string }> = {
    idle:        { label: 'Disconnected',  cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
    connecting:  { label: 'Connecting…',  cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500 animate-pulse' },
    disconnected:{ label: 'Disconnected', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
    connected:   { label: 'Connected',    cls: 'bg-sky-100 text-sky-700',     dot: 'bg-sky-500' },
    recording:   { label: 'Recording',    cls: 'bg-red-100 text-red-700',     dot: 'bg-red-500 animate-pulse' },
    paused:      { label: 'Paused',       cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
    reconnecting:{ label: 'Reconnecting…',cls: 'bg-orange-100 text-orange-700',dot: 'bg-orange-500 animate-pulse' },
    finalizing:  { label: 'Finalizing…', cls: 'bg-purple-100 text-purple-700',dot: 'bg-purple-500 animate-pulse' },
    completed:   { label: 'Completed',    cls: 'bg-emerald-100 text-emerald-700',dot: 'bg-emerald-500' },
    error:       { label: 'Error',        cls: 'bg-red-100 text-red-700',     dot: 'bg-red-500' },
  };
  const s = map[state];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${s.cls}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ─── Audio Level Visualiser ───────────────────────────────────────────────────

function AudioBars({ level, active }: { level: number; active: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-5">
      {[0.3, 0.6, 1.0, 0.7, 0.4, 0.8, 0.5].map((factor, i) => {
        const h = active ? Math.max(4, (level / 128) * 20 * factor) : 3;
        return (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-75 ${active ? 'bg-indigo-500' : 'bg-slate-300'}`}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const LiveMeeting: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const meetingIdRef = useRef<string>(id === 'new' ? uuidv4() : (id ?? uuidv4()));
  const meetingId = meetingIdRef.current;

  const [meetingTitle, setMeetingTitle] = useState('Untitled Meeting');
  const [editingTitle, setEditingTitle] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [appError, setAppError] = useState<AppError | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [analysisState, setAnalysisState] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [started, setStarted] = useState(false);

  const elapsedRef = useRef(0);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRefTab = useWebSocket();
  const wsRefMic = useWebSocket();
  const { segments, interimText, scrollRef, addFinalSegment, setInterimText, clearAll } = useTranscript();

  // ── WS message handler ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleMessage = (msg: WsServerMessage) => {
      switch (msg.type) {
        case 'connection:ready':
          break;

        case 'transcription:status':
          setConnectionState(msg.status);
          if (msg.status === 'completed') {
            setTimeout(() => navigate(`/meetings/${msg.meetingId}`), 1000);
          }
          break;

        case 'transcription:interim':
          setInterimText(msg.text);
          break;

        case 'transcription:final':
          addFinalSegment({
            id: msg.segmentId,
            meetingId: msg.meetingId,
            text: msg.text,
            speaker: msg.speaker,
            startTime: msg.startTime,
            endTime: msg.endTime,
            confidence: msg.confidence,
            isFinal: true,
          });
          break;

        case 'meeting:analysis-started':
          setAnalysisState('running');
          break;

        case 'meeting:analysis-completed':
          setAnalysisState(msg.status === 'completed' ? 'completed' : 'failed');
          if (msg.status === 'failed') setAnalysisError(msg.error ?? 'Analysis failed');
          setTimeout(() => navigate(`/meeting/${meetingId}/details`), 1500);
          break;

        case 'error':
          setAppError({
            type: 'error',
            code: msg.code,
            message: msg.message,
            recoverable: msg.recoverable,
            provider: msg.provider,
          });
          if (!msg.recoverable) {
            setConnectionState('error');
            stopEverything();
          }
          break;
      }
    };

    const offTab = wsRefTab.onMessage(handleMessage);
    const offMic = wsRefMic.onMessage(handleMessage);
    return () => {
      offTab();
      offMic();
    };
  }, [wsRefTab, wsRefMic, addFinalSegment, setInterimText, navigate, meetingId]);

  // ── Tab capture ────────────────────────────────────────────────────────────
  const handleChunkTab = useCallback((data: ArrayBuffer) => {
    wsRefTab.sendBinary(data);
  }, [wsRefTab]);

  const handleChunkMic = useCallback((data: ArrayBuffer) => {
    wsRefMic.sendBinary(data);
  }, [wsRefMic]);

  const handleCaptureStop = useCallback(() => {
    // Track ended — finalize
    if (connectionState === 'recording' || connectionState === 'paused') {
      stopMeeting();
    }
  }, [connectionState]);

  const handleCaptureError = useCallback((err: { message: string }) => {
    setCaptureError(err.message);
    setConnectionState('error');
  }, []);

  const {
    startCapture,
    pauseCapture,
    resumeCapture,
    stopCapture,
    captureState,
    audioLevel,
    mimeType,
    sampleRate,
  } = useTabCapture({
    onChunkTab: handleChunkTab,
    onChunkMic: handleChunkMic,
    onStop: handleCaptureStop,
    onError: handleCaptureError,
  });

  // ── Timer ──────────────────────────────────────────────────────────────────
  const startTimer = () => {
    elapsedRef.current = 0;
    setElapsedSeconds(0);
    elapsedIntervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSeconds(elapsedRef.current);
    }, 1000);
  };

  const stopTimer = () => {
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  };

  useEffect(() => () => stopTimer(), []);

  // ── Start flow ─────────────────────────────────────────────────────────────
  const startMeeting = async () => {
    setAppError(null);
    setCaptureError(null);
    setAnalysisState('idle');
    clearAll();

    wsRefTab.connect();
    wsRefMic.connect();

    // Wait for WS open before starting capture
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        // Check via a direct ping — the connection:ready event will have set state
        if (connectionState === 'connected' || connectionState === 'recording') {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 3000);
    });

    // Start capture
    await startCapture();
    if (captureError) return; // capture failed

    // Send meeting:start
    wsRefTab.sendJson({
      type: 'meeting:start',
      meetingId,
      meetingTitle: meetingTitle,
      audioMimeType: mimeType ?? 'audio/webm;codecs=opus',
      sampleRate,
      audioSource: 'tab'
    });

    wsRefMic.sendJson({
      type: 'meeting:start',
      meetingId,
      meetingTitle: meetingTitle,
      audioMimeType: mimeType ?? 'audio/webm;codecs=opus',
      sampleRate,
      audioSource: 'mic'
    });

    setConnectionState('recording');
    setStarted(true);
    startTimer();
  };

  // ── Stop flow ──────────────────────────────────────────────────────────────
  const stopEverything = useCallback(() => {
    stopCapture();
    stopTimer();
  }, [stopCapture]);

  const stopMeeting = useCallback(() => {
    stopEverything();
    setConnectionState('finalizing');
    wsRefTab.sendJson({
      type: 'meeting:stop',
      meetingId,
      durationSeconds: elapsedRef.current,
    });
    wsRefMic.sendJson({
      type: 'meeting:stop',
      meetingId,
      durationSeconds: elapsedRef.current,
    });
  }, [stopEverything, wsRefTab, wsRefMic, meetingId]);

  // ── Pause / Resume ─────────────────────────────────────────────────────────
  const pauseMeeting = () => {
    pauseCapture();
    wsRefTab.sendJson({ type: 'meeting:pause', meetingId });
    wsRefMic.sendJson({ type: 'meeting:pause', meetingId });
    setConnectionState('paused');
  };

  const resumeMeeting = () => {
    resumeCapture();
    wsRefTab.sendJson({ type: 'meeting:resume', meetingId });
    wsRefMic.sendJson({ type: 'meeting:resume', meetingId });
    setConnectionState('recording');
  };

  // ── Title save ─────────────────────────────────────────────────────────────
  const saveTitleToServer = async (title: string) => {
    if (connectionState === 'idle') return; // Meeting not created in DB yet
    try {
      await fetch(`/api/meetings/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    } catch (_) {}
  };

  const handleTitleBlur = () => {
    setEditingTitle(false);
    saveTitleToServer(meetingTitle);
  };

  const isFinalizing = connectionState === 'finalizing' || connectionState === 'completed' || connectionState === 'error';
  const isRecording = connectionState === 'recording' || connectionState === 'connected';
  const isPaused = connectionState === 'paused';
  const canStop = isRecording || isPaused;
  const canPause = isRecording;
  const canResume = isPaused;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-slate-700 transition-colors"
            title="Back to dashboard"
          >
            <i className="fas fa-arrow-left" />
          </button>
          {editingTitle ? (
            <input
              id="meeting-title-input"
              autoFocus
              value={meetingTitle}
              onChange={e => setMeetingTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={e => e.key === 'Enter' && handleTitleBlur()}
              className="text-lg font-bold text-slate-800 border-b-2 border-indigo-400 outline-none bg-transparent px-1 min-w-48"
            />
          ) : (
            <h2
              id="meeting-title-display"
              className="text-lg font-bold text-slate-800 cursor-pointer hover:text-indigo-700 transition-colors"
              onClick={() => !started || !isFinalizing ? setEditingTitle(true) : undefined}
              title="Click to edit title"
            >
              {meetingTitle}
              {!isFinalizing && <i className="fas fa-pencil-alt text-xs text-slate-400 ml-2" />}
            </h2>
          )}
        </div>

        <div className="flex items-center gap-3">
          <ConnectionBadge state={connectionState} />
          {started && (
            <span className="font-mono text-sm font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
              {formatElapsed(elapsedSeconds)}
            </span>
          )}
          <AudioBars level={audioLevel} active={captureState === 'active'} />
        </div>
      </div>

      {/* Error banners */}
      {(appError || captureError) && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-start gap-3">
          <i className="fas fa-exclamation-circle text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            {appError && (
              <>
                <p className="text-red-800 font-semibold text-sm">{appError.message}</p>
                {appError.code && (
                  <p className="text-red-500 text-xs mt-0.5 font-mono">{appError.code}</p>
                )}
              </>
            )}
            {captureError && !appError && (
              <p className="text-red-800 font-semibold text-sm">{captureError}</p>
            )}
          </div>
          <button
            onClick={() => { setAppError(null); setCaptureError(null); }}
            className="ml-auto text-red-400 hover:text-red-700"
          >
            <i className="fas fa-times" />
          </button>
        </div>
      )}

      {/* Capture status bar */}
      {started && (
        <div className={`px-6 py-2 text-xs font-semibold flex items-center justify-between flex-shrink-0 ${
          captureState === 'active' ? 'bg-emerald-50 text-emerald-700 border-b border-emerald-100'
          : captureState === 'paused' ? 'bg-amber-50 text-amber-700 border-b border-amber-100'
          : 'bg-slate-50 text-slate-500 border-b border-slate-100'
        }`}>
          <span className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${captureState === 'active' ? 'bg-emerald-500 animate-pulse' : captureState === 'paused' ? 'bg-amber-400' : 'bg-slate-300'}`} />
            {captureState === 'active' ? 'Tab audio streaming' : captureState === 'paused' ? 'Paused' : captureState === 'stopped' ? 'Stopped' : 'Starting...'}
          </span>
          <span className="opacity-60 uppercase tracking-widest">
            {segments.length} segment{segments.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Idle / Start screen */}
        {!started && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-200">
              <i className="fas fa-wave-square text-white text-3xl" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Ready to Transcribe</h2>
            <p className="text-slate-500 max-w-sm mb-8 text-sm leading-relaxed">
              Click "Start Transcription" below. You'll be asked to select a browser tab — <strong>make sure to check "Share tab audio"</strong> in the popup.
            </p>

            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 max-w-md mb-8 text-left space-y-2">
              {[
                { icon: 'fa-desktop', text: 'Select the browser tab with your meeting' },
                { icon: 'fa-volume-up', text: 'Check "Share tab audio" in the browser popup' },
                { icon: 'fa-microphone', text: 'Speak in the meeting — transcription starts automatically' },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i className={`fas ${step.icon} text-indigo-600 text-xs`} />
                  </div>
                  <p className="text-sm text-slate-700">{step.text}</p>
                </div>
              ))}
            </div>

            <button
              id="start-transcription-btn"
              onClick={startMeeting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-10 py-4 rounded-2xl shadow-lg shadow-indigo-200 transition-all text-lg flex items-center gap-3"
            >
              <i className="fas fa-play" />
              Start Transcription
            </button>

            {captureError && (
              <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-md text-left">
                <p className="text-amber-800 font-semibold text-sm mb-1">
                  <i className="fas fa-exclamation-triangle mr-2" />
                  Capture failed
                </p>
                <p className="text-amber-700 text-sm">{captureError}</p>
                <button
                  onClick={() => { setCaptureError(null); setConnectionState('idle'); }}
                  className="mt-3 text-xs font-bold text-amber-700 underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Transcript feed */}
        {started && (
          <>
            <div
              ref={scrollRef}
              id="transcript-feed"
              className="flex-1 overflow-y-auto p-6 space-y-3"
            >
              {segments.length === 0 && !interimText && !isFinalizing && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <i className="fas fa-comment-dots text-4xl animate-pulse mb-4" />
                  <p className="text-sm font-medium">Listening for speech...</p>
                  <p className="text-xs mt-1">Make sure the meeting tab audio is playing</p>
                </div>
              )}

              {segments.map(seg => (
                <div key={seg.id} className="flex flex-col items-start">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${speakerColor(seg.speaker)}`}>
                      {seg.speaker !== null 
                        ? (typeof seg.speaker === 'number' 
                            ? `Speaker ${seg.speaker + 1}` 
                            : (seg.speaker === 'Me' ? 'Me' : `Speaker ${seg.speaker}`))
                        : 'Speaker'}
                    </span>
                    {seg.startTime !== null && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatTimestamp(seg.startTime)}
                      </span>
                    )}
                    {seg.confidence > 0 && (
                      <span className="text-[10px] text-slate-300">
                        {Math.round(seg.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="max-w-[90%] bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none shadow-sm">
                    <p className="text-slate-800 leading-relaxed text-sm font-medium">{seg.text}</p>
                  </div>
                </div>
              ))}

              {/* Interim text */}
              {interimText && (
                <div className="flex flex-col items-start opacity-60">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">
                      Live...
                    </span>
                  </div>
                  <div className="max-w-[90%] bg-slate-50 border border-dashed border-slate-200 p-4 rounded-2xl rounded-tl-none">
                    <p className="text-slate-600 leading-relaxed text-sm italic">{interimText}</p>
                  </div>
                </div>
              )}

              {/* Finalizing state */}
              {isFinalizing && (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="relative w-14 h-14 mb-4">
                    <div className="absolute inset-0 border-4 border-purple-100 rounded-full" />
                    <div className="absolute inset-0 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <i className="fas fa-brain text-purple-600" />
                    </div>
                  </div>
                  {analysisState === 'running' && (
                    <p className="text-purple-700 font-semibold text-sm">Generating AI summary...</p>
                  )}
                  {analysisState === 'completed' && (
                    <p className="text-emerald-700 font-semibold text-sm">
                      <i className="fas fa-check-circle mr-2" />
                      Analysis complete! Redirecting...
                    </p>
                  )}
                  {analysisState === 'failed' && (
                    <div className="text-center">
                      <p className="text-amber-700 font-semibold text-sm">Analysis failed — transcript saved</p>
                      {analysisError && <p className="text-amber-600 text-xs mt-1">{analysisError}</p>}
                      <button
                        onClick={() => navigate(`/meeting/${meetingId}/details`)}
                        className="mt-3 text-sm font-bold text-indigo-600 underline"
                      >
                        View transcript anyway
                      </button>
                    </div>
                  )}
                  {analysisState === 'idle' && (
                    <p className="text-slate-500 text-sm">Finalizing transcript...</p>
                  )}
                </div>
              )}
            </div>

            {/* Controls bar */}
            {!isFinalizing && (
              <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  {canPause && (
                    <button
                      id="pause-btn"
                      onClick={pauseMeeting}
                      className="flex items-center gap-2 px-5 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-xl font-bold text-sm transition-all"
                    >
                      <i className="fas fa-pause" />
                      Pause
                    </button>
                  )}
                  {canResume && (
                    <button
                      id="resume-btn"
                      onClick={resumeMeeting}
                      className="flex items-center gap-2 px-5 py-2.5 bg-sky-100 hover:bg-sky-200 text-sky-800 rounded-xl font-bold text-sm transition-all"
                    >
                      <i className="fas fa-play" />
                      Resume
                    </button>
                  )}
                </div>

                {canStop && (
                  <button
                    id="stop-btn"
                    onClick={stopMeeting}
                    className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-100 transition-all"
                  >
                    <i className="fas fa-stop" />
                    Stop & Analyze
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LiveMeeting;