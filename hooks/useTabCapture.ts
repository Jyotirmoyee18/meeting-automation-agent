import { useRef, useState, useCallback } from 'react';

export type CaptureState =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'paused'
  | 'stopped'
  | 'error';

export interface CaptureError {
  code:
    | 'UNSUPPORTED_BROWSER'
    | 'PERMISSION_DENIED'
    | 'NO_AUDIO_TRACK'
    | 'MEDIARECORDER_ERROR'
    | 'UNKNOWN';
  message: string;
}

interface UseTabCaptureOptions {
  onChunk: (data: ArrayBuffer) => void;
  onStop: () => void;
  onError: (err: CaptureError) => void;
}

interface UseTabCaptureReturn {
  captureState: CaptureState;
  mimeType: string | null;
  audioLevel: number;
  startCapture: () => Promise<void>;
  pauseCapture: () => void;
  resumeCapture: () => void;
  stopCapture: () => void;
}

// Detect the best supported MIME type
function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

export function useTabCapture({
  onChunk,
  onStop,
  onError,
}: UseTabCaptureOptions): UseTabCaptureReturn {
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);

  const cleanupVisualiser = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const cleanup = useCallback(() => {
    cleanupVisualiser();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch (_) {}
    }
    recorderRef.current = null;
    cleanupStream();
  }, []);

  const startVisualiser = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;

      const tick = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(avg);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('[useTabCapture] Visualiser error:', e);
    }
  };

  const handleStop = useCallback(() => {
    if (stoppingRef.current) return; // prevent duplicate
    stoppingRef.current = true;
    cleanupVisualiser();
    cleanupStream();
    setCaptureState('stopped');
    onStop();
  }, [onStop]);

  const startCapture = useCallback(async () => {
    // Browser support check
    if (!navigator.mediaDevices?.getDisplayMedia) {
      onError({
        code: 'UNSUPPORTED_BROWSER',
        message: 'Screen capture is not supported in this browser. Please use Chrome or Edge.',
      });
      return;
    }

    stoppingRef.current = false;
    setCaptureState('requesting');

    let stream: MediaStream;
    try {
      stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 1,
        },
        selfBrowserSurface: 'include',
        systemAudio: 'include',
      });
    } catch (err: any) {
      setCaptureState('error');
      const msg = String(err?.message ?? '').toLowerCase();
      if (msg.includes('permission') || msg.includes('not allowed') || err?.name === 'NotAllowedError') {
        onError({ code: 'PERMISSION_DENIED', message: 'Screen capture permission was denied. Please try again and allow access.' });
      } else {
        onError({ code: 'UNKNOWN', message: `Could not start screen capture: ${err?.message ?? 'Unknown error'}` });
      }
      return;
    }

    // Validate audio track
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      // Stop all tracks before failing
      stream.getTracks().forEach(t => t.stop());
      setCaptureState('error');
      onError({
        code: 'NO_AUDIO_TRACK',
        message: 'No audio track found. Please select a browser tab and make sure "Share tab audio" is checked.',
      });
      return;
    }

    streamRef.current = stream;
    startVisualiser(stream);

    // Detect track end (user stops sharing in browser UI)
    audioTracks[0].onended = () => {
      if (!stoppingRef.current) {
        handleStop();
      }
    };

    // Also watch video track end
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length > 0) {
      videoTracks[0].onended = () => {
        if (!stoppingRef.current) {
          handleStop();
        }
      };
    }

    // Create MediaRecorder with best available MIME type
    const mime = getSupportedMimeType();
    const recorderOptions: MediaRecorderOptions = mime ? { mimeType: mime } : {};
    setMimeType(mime || 'audio/webm');

    // Use only the audio track for MediaRecorder to send only audio
    const audioOnlyStream = new MediaStream(audioTracks);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(audioOnlyStream, recorderOptions);
    } catch (err: any) {
      cleanup();
      setCaptureState('error');
      onError({ code: 'MEDIARECORDER_ERROR', message: `Could not start MediaRecorder: ${err?.message}` });
      return;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        event.data.arrayBuffer().then(buf => onChunk(buf));
      }
    };

    recorder.onerror = (event: any) => {
      console.error('[MediaRecorder] Error:', event.error);
      if (!stoppingRef.current) {
        cleanup();
        setCaptureState('error');
        onError({ code: 'MEDIARECORDER_ERROR', message: `MediaRecorder error: ${event.error?.message ?? 'Unknown'}` });
      }
    };

    recorder.onstop = () => {
      if (!stoppingRef.current) {
        handleStop();
      }
    };

    recorderRef.current = recorder;
    recorder.start(250); // 250ms chunks for low latency
    setCaptureState('active');
  }, [onChunk, onStop, onError, handleStop, cleanup]);

  const pauseCapture = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
      setCaptureState('paused');
    }
  }, []);

  const resumeCapture = useCallback(() => {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume();
      setCaptureState('active');
    }
  }, []);

  const stopCapture = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    cleanup();
    setCaptureState('stopped');
  }, [cleanup]);

  return {
    captureState,
    mimeType,
    audioLevel,
    startCapture,
    pauseCapture,
    resumeCapture,
    stopCapture,
  };
}
