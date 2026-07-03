import { createClient, LiveTranscriptionEvents, ListenLiveClient } from '@deepgram/sdk';
import { EventEmitter } from 'events';

// ─── Error Codes ──────────────────────────────────────────────────────────────

export type TranscriptionErrorCode =
  | 'TRANSCRIPTION_CONNECTION_FAILED'
  | 'TRANSCRIPTION_AUTH_FAILED'
  | 'TRANSCRIPTION_QUOTA_EXCEEDED'
  | 'TRANSCRIPTION_RATE_LIMITED'
  | 'TRANSCRIPTION_PROVIDER_UNAVAILABLE';

export interface TranscriptionError {
  type: 'error';
  code: TranscriptionErrorCode;
  message: string;
  recoverable: boolean;
  provider: 'deepgram';
}

// ─── Transcript Events ────────────────────────────────────────────────────────

export interface WordData {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

export interface TranscriptSegmentData {
  segmentId: string;
  text: string;
  speaker: number | null;
  startTime: number;
  endTime: number;
  confidence: number;
  words: WordData[];
  isFinal: boolean;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class DeepgramProvider extends EventEmitter {
  private client: ReturnType<typeof createClient>;
  private live: ListenLiveClient | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private closed = false;

  constructor() {
    super();
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPGRAM_API_KEY is not configured');
    }
    this.client = createClient(apiKey);
  }

  async connect(encoding?: string, sampleRate?: number): Promise<void> {
    if (this.live || this.closed) return;

    // Determine encoding — default to linear16 if not specified
    const enc = this.normalizeEncoding(encoding);

    this.live = this.client.listen.live({
      model: 'nova-2',
      language: 'en-US',
      encoding: enc as any,
      sample_rate: sampleRate ?? 16000,
      channels: 1,
      diarize: true,
      punctuate: true,
      interim_results: true,
      utterance_end_ms: 1000,
      vad_events: true,
      smart_format: true,
    });

    this.live.on(LiveTranscriptionEvents.Open, () => {
      this.emit('connected');
      // Keep-alive ping every 8 seconds
      this.keepAliveInterval = setInterval(() => {
        if (this.live && !this.closed) {
          this.live.keepAlive();
        }
      }, 8000);
    });

    this.live.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      this.handleTranscript(data);
    });

    this.live.on(LiveTranscriptionEvents.Error, (err: any) => {
      this.handleError(err);
    });

    this.live.on(LiveTranscriptionEvents.Close, () => {
      this.clearKeepAlive();
      if (!this.closed) {
        this.emit('disconnected');
      }
    });

    // Wait for open event with timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Deepgram connection timeout'));
      }, 10000);

      this.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.once('error', (err: TranscriptionError) => {
        clearTimeout(timeout);
        reject(new Error(err.message));
      });
    });
  }

  sendAudio(chunk: Buffer): void {
    if (this.live && !this.closed) {
      this.live.send(chunk);
    }
  }

  finalize(): void {
    if (this.live && !this.closed) {
      this.live.requestClose();
    }
  }

  close(): void {
    this.closed = true;
    this.clearKeepAlive();
    if (this.live) {
      try {
        this.live.requestClose();
      } catch (_) {}
      this.live = null;
    }
  }

  private clearKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private normalizeEncoding(mimeType?: string): string {
    if (!mimeType) return 'linear16';
    const lower = mimeType.toLowerCase();
    if (lower.includes('webm') && lower.includes('opus')) return 'opus';
    if (lower.includes('webm')) return 'webm';
    if (lower.includes('ogg')) return 'ogg-vorbis';
    if (lower.includes('mp4') || lower.includes('aac')) return 'aac';
    if (lower.includes('wav') || lower.includes('pcm') || lower.includes('linear16')) return 'linear16';
    // Default to opus for unknown webm-like formats
    return 'linear16';
  }

  private handleTranscript(data: any): void {
    try {
      const channel = data?.channel;
      const alternatives = channel?.alternatives;
      if (!alternatives || alternatives.length === 0) return;

      const alt = alternatives[0];
      const transcript: string = alt.transcript ?? '';
      if (!transcript.trim()) return;

      const words: WordData[] = (alt.words ?? []).map((w: any) => ({
        word: w.word ?? '',
        start: w.start ?? 0,
        end: w.end ?? 0,
        confidence: w.confidence ?? 0,
        speaker: w.speaker ?? undefined,
        punctuated_word: w.punctuated_word ?? w.word,
      }));

      // Determine speaker from first word
      const speaker = words.length > 0 && words[0].speaker !== undefined
        ? words[0].speaker
        : null;

      const startTime = words.length > 0 ? words[0].start : (data?.start ?? 0);
      const endTime = words.length > 0 ? words[words.length - 1].end : (data?.duration ?? 0);
      const confidence = alt.confidence ?? 0;
      const isFinal = data?.is_final === true;

      const segmentData: TranscriptSegmentData = {
        segmentId: `${data?.channel_index?.[0] ?? 0}-${startTime.toFixed(3)}-${isFinal ? 'f' : 'i'}`,
        text: transcript,
        speaker,
        startTime,
        endTime,
        confidence,
        words,
        isFinal,
      };

      this.emit(isFinal ? 'final' : 'interim', segmentData);
    } catch (err) {
      console.error('[Deepgram] Error parsing transcript:', err);
    }
  }

  private handleError(err: any): void {
    const errStr = String(err?.message || err || '').toLowerCase();
    let error: TranscriptionError;

    if (errStr.includes('401') || errStr.includes('unauthorized') || errStr.includes('invalid api key')) {
      error = {
        type: 'error',
        code: 'TRANSCRIPTION_AUTH_FAILED',
        message: 'Transcription authentication failed. Please check your Deepgram API key.',
        recoverable: false,
        provider: 'deepgram',
      };
    } else if (errStr.includes('402') || errStr.includes('payment') || errStr.includes('quota') || errStr.includes('credits')) {
      error = {
        type: 'error',
        code: 'TRANSCRIPTION_QUOTA_EXCEEDED',
        message: 'Live transcription is temporarily unavailable because the transcription provider quota has been reached.',
        recoverable: false,
        provider: 'deepgram',
      };
    } else if (errStr.includes('429') || errStr.includes('rate limit') || errStr.includes('too many requests')) {
      error = {
        type: 'error',
        code: 'TRANSCRIPTION_RATE_LIMITED',
        message: 'Transcription rate limit reached. Please wait a moment before retrying.',
        recoverable: true,
        provider: 'deepgram',
      };
    } else if (errStr.includes('503') || errStr.includes('unavailable') || errStr.includes('service')) {
      error = {
        type: 'error',
        code: 'TRANSCRIPTION_PROVIDER_UNAVAILABLE',
        message: 'Transcription service is temporarily unavailable. Please try again shortly.',
        recoverable: true,
        provider: 'deepgram',
      };
    } else {
      error = {
        type: 'error',
        code: 'TRANSCRIPTION_CONNECTION_FAILED',
        message: 'Transcription connection failed. Please check your connection and try again.',
        recoverable: true,
        provider: 'deepgram',
      };
    }

    this.emit('error', error);
  }
}
