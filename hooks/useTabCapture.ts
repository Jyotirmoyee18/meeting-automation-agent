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
  onChunkTab: (data: ArrayBuffer) => void;
  onChunkMic: (data: ArrayBuffer) => void;
  onStop: () => void;
  onError: (err: CaptureError) => void;
}

interface UseTabCaptureReturn {
  captureState: CaptureState;
  mimeType: string | null;
  audioLevel: number;
  sampleRate: number;
  startCapture: () => Promise<void>;
  pauseCapture: () => void;
  resumeCapture: () => void;
  stopCapture: () => void;
}

export function useTabCapture({
  onChunkTab,
  onChunkMic,
  onStop,
  onError,
}: UseTabCaptureOptions): UseTabCaptureReturn {
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [sampleRate, setSampleRate] = useState<number>(44100);

  const streamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tabScriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const micScriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micMediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const pausedRef = useRef(false);

  const cleanupAudioNodes = () => {
    if (tabScriptNodeRef.current) {
      tabScriptNodeRef.current.disconnect();
      tabScriptNodeRef.current.onaudioprocess = null;
      tabScriptNodeRef.current = null;
    }
    if (micScriptNodeRef.current) {
      micScriptNodeRef.current.disconnect();
      micScriptNodeRef.current.onaudioprocess = null;
      micScriptNodeRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }
    if (micMediaStreamSourceRef.current) {
      micMediaStreamSourceRef.current.disconnect();
      micMediaStreamSourceRef.current = null;
    }
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
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
  };

  const cleanup = useCallback(() => {
    cleanupAudioNodes();
    cleanupStream();
  }, []);

  const handleStop = useCallback(() => {
    if (stoppingRef.current) return; // prevent duplicate
    stoppingRef.current = true;
    cleanup();
    setCaptureState('stopped');
    onStop();
  }, [onStop, cleanup]);

  const startCapture = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      onError({
        code: 'UNSUPPORTED_BROWSER',
        message: 'Screen capture is not supported in this browser. Please use Chrome or Edge.',
      });
      return;
    }

    stoppingRef.current = false;
    pausedRef.current = false;
    setCaptureState('requesting');

    let stream: MediaStream;
    try {
      stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
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

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach(t => t.stop());
      setCaptureState('error');
      onError({
        code: 'NO_AUDIO_TRACK',
        message: 'No audio track found. Please select a browser tab and make sure "Share tab audio" is checked.',
      });
      return;
    }

    streamRef.current = stream;

    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1,
        }
      });
      micStreamRef.current = micStream;
    } catch (err: any) {
      console.warn('Microphone access denied or failed', err);
      // We can continue without mic if needed, or we could fail. We'll just continue.
    }

    audioTracks[0].onended = () => {
      if (!stoppingRef.current) {
        handleStop();
      }
    };

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length > 0) {
      videoTracks[0].onended = () => {
        if (!stoppingRef.current) {
          handleStop();
        }
      };
    }

    setMimeType('audio/pcm');

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 44100,
      });
      setSampleRate(audioCtx.sampleRate);
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(new MediaStream(audioTracks));
      mediaStreamSourceRef.current = source;

      let micSource: MediaStreamAudioSourceNode | null = null;
      if (micStreamRef.current) {
        micSource = audioCtx.createMediaStreamSource(micStreamRef.current);
        micMediaStreamSourceRef.current = micSource;
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      if (micSource) {
        micSource.connect(analyser);
      }
      analyserRef.current = analyser;

      const convertToPCM = (e: AudioProcessingEvent) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return pcm16.buffer;
      };

      const tabScriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
      tabScriptNodeRef.current = tabScriptNode;
      source.connect(tabScriptNode);
      const tabGain = audioCtx.createGain();
      tabGain.gain.value = 0;
      tabScriptNode.connect(tabGain);
      tabGain.connect(audioCtx.destination);

      tabScriptNode.onaudioprocess = (e) => {
        if (stoppingRef.current || pausedRef.current) return;
        onChunkTab(convertToPCM(e));
      };

      if (micSource) {
        const micScriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
        micScriptNodeRef.current = micScriptNode;
        micSource.connect(micScriptNode);
        const micGain = audioCtx.createGain();
        micGain.gain.value = 0;
        micScriptNode.connect(micGain);
        micGain.connect(audioCtx.destination);

        micScriptNode.onaudioprocess = (e) => {
          if (stoppingRef.current || pausedRef.current) return;
          onChunkMic(convertToPCM(e));
        };
      }

      const tick = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(avg);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();

      setCaptureState('active');
    } catch (err: any) {
      cleanup();
      setCaptureState('error');
      onError({ code: 'MEDIARECORDER_ERROR', message: `Could not start audio processing: ${err?.message}` });
    }
  }, [onChunkTab, onChunkMic, onStop, onError, handleStop, cleanup]);

  const pauseCapture = useCallback(() => {
    if (!pausedRef.current && !stoppingRef.current) {
      pausedRef.current = true;
      setCaptureState('paused');
    }
  }, []);

  const resumeCapture = useCallback(() => {
    if (pausedRef.current && !stoppingRef.current) {
      pausedRef.current = false;
      setCaptureState('active');
    }
  }, []);

  const stopCapture = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    cleanup();
    setCaptureState('stopped');
  }, [cleanup]);

  return {
    captureState,
    mimeType,
    audioLevel,
    sampleRate,
    startCapture,
    pauseCapture,
    resumeCapture,
    stopCapture,
  };
}
