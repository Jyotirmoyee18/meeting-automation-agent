import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { AssemblyAIProvider, TranscriptionError, TranscriptSegmentData } from '../providers/assemblyAIProvider';
import { GeminiProvider } from '../providers/claudeProvider';
import { meetingRepository, segmentRepository, analysisRepository } from '../repositories/meetingRepository';

// ─── Message Types ────────────────────────────────────────────────────────────

interface MeetingStartMessage {
  type: 'meeting:start';
  meetingId?: string;
  meetingTitle?: string;
  audioMimeType?: string;
  sampleRate?: number;
  audioSource?: 'mic' | 'tab';
}

interface MeetingStopMessage {
  type: 'meeting:stop';
  meetingId: string;
  durationSeconds?: number;
}

interface MeetingPauseMessage {
  type: 'meeting:pause';
  meetingId: string;
}

interface MeetingResumeMessage {
  type: 'meeting:resume';
  meetingId: string;
}

interface ClientPingMessage {
  type: 'client:ping';
}

type ClientJsonMessage =
  | MeetingStartMessage
  | MeetingStopMessage
  | MeetingPauseMessage
  | MeetingResumeMessage
  | ClientPingMessage;

// ─── Session State ────────────────────────────────────────────────────────────

interface SessionState {
  meetingId: string;
  startedAt: number;
  transcriber: AssemblyAIProvider;
  paused: boolean;
  stopping: boolean;
  audioSource?: 'mic' | 'tab';
}

// ─── Send Helper ──────────────────────────────────────────────────────────────

function send(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendError(ws: WebSocket, error: TranscriptionError | { code: string; message: string; recoverable: boolean }): void {
  send(ws, { type: 'error', provider: 'assemblyai', ...error });
}

// ─── Analysis Runner ──────────────────────────────────────────────────────────

async function runAnalysis(ws: WebSocket, meetingId: string, meetingTitle: string): Promise<void> {
  send(ws, { type: 'meeting:analysis-started', meetingId });

  try {
    const segments = segmentRepository.findByMeetingId(meetingId);
    const transcript = segments.map(s => {
      const speakerLabel = s.speaker !== null ? `Speaker ${(s.speaker as number) + 1}: ` : '';
      return `${speakerLabel}${s.text}`;
    }).join('\n');

    if (!transcript.trim()) {
      analysisRepository.fail(meetingId, 'No transcript content to analyze');
      send(ws, {
        type: 'meeting:analysis-completed',
        meetingId,
        status: 'failed',
        error: 'No transcript content to analyze',
      });
      return;
    }

    // Create running record
    analysisRepository.create(meetingId);

    const gemini = new GeminiProvider();
    const result = await gemini.analyzeTranscript(transcript, meetingTitle);

    analysisRepository.complete(meetingId, {
      ...result,
      model: gemini.getModel(),
    });

    send(ws, {
      type: 'meeting:analysis-completed',
      meetingId,
      status: 'completed',
      analysis: result,
    });
  } catch (err: any) {
    const message = err?.message ?? 'AI analysis failed';
    console.error(`[Analysis] Failed for meeting ${meetingId}:`, message);
    try {
      analysisRepository.fail(meetingId, message);
    } catch (_) {}
    send(ws, {
      type: 'meeting:analysis-completed',
      meetingId,
      status: 'failed',
      error: message,
    });
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export function handleWebSocketConnection(ws: WebSocket): void {
  let session: SessionState | null = null;

  // Send ready signal
  send(ws, { type: 'connection:ready' });

  ws.on('message', async (data: WebSocket.RawData, isBinary: boolean) => {
    // ── Binary audio chunk ──────────────────────────────────────────────────
    if (isBinary) {
      if (!session || session.paused || session.stopping) return;
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      session.transcriber.sendAudio(chunk);
      return;
    }

    // ── JSON message ────────────────────────────────────────────────────────
    let message: ClientJsonMessage;
    try {
      message = JSON.parse(data.toString()) as ClientJsonMessage;
    } catch {
      sendError(ws, { code: 'INVALID_MESSAGE', message: 'Invalid JSON message', recoverable: true });
      return;
    }

    switch (message.type) {
      // ── meeting:start ─────────────────────────────────────────────────────
      case 'meeting:start': {
        if (session) {
          // Clean up any existing session first
          session.transcriber.close();
          session = null;
        }

        const meetingId = (message as MeetingStartMessage).meetingId ?? uuidv4();
        const title = (message as MeetingStartMessage).meetingTitle ?? 'Untitled Meeting';
        const mimeType = (message as MeetingStartMessage).audioMimeType;
        const sampleRate = (message as MeetingStartMessage).sampleRate ?? 16000;

        // Upsert meeting record
        const existing = meetingRepository.findById(meetingId);
        if (!existing) {
          meetingRepository.create(title, meetingId);
        } else {
          meetingRepository.updateStatus(meetingId, 'recording');
        }

        // Connect Deepgram
        const transcriber = new AssemblyAIProvider();

        transcriber.on('interim', (seg: TranscriptSegmentData) => {
          let speaker = seg.speaker;
          if (session?.audioSource === 'mic') speaker = 'Me';
          
          send(ws, {
            type: 'transcription:interim',
            meetingId,
            segmentId: seg.segmentId,
            text: seg.text,
            speaker: speaker,
            startTime: seg.startTime,
            endTime: seg.endTime,
            confidence: seg.confidence,
          });
        });

        transcriber.on('final', (seg: TranscriptSegmentData) => {
          let speaker = seg.speaker;
          if (session?.audioSource === 'mic') speaker = 'Me';

          // Persist idempotently
          const stableId = `${meetingId}-${seg.startTime.toFixed(3)}-${seg.endTime.toFixed(3)}`;
          segmentRepository.upsertById(stableId, {
            meetingId,
            text: seg.text,
            speaker: speaker,
            startTime: seg.startTime,
            endTime: seg.endTime,
            confidence: seg.confidence,
          });

          send(ws, {
            type: 'transcription:final',
            meetingId,
            segmentId: stableId,
            text: seg.text,
            speaker: speaker,
            startTime: seg.startTime,
            endTime: seg.endTime,
            confidence: seg.confidence,
          });
        });

        transcriber.on('error', (err: TranscriptionError) => {
          console.error('[AssemblyAI] Error:', err.code, err.message);
          sendError(ws, err);
          if (!err.recoverable && session) {
            session.stopping = true;
            meetingRepository.updateStatus(meetingId, 'failed');
          }
        });

        transcriber.on('disconnected', () => {
          send(ws, { type: 'transcription:status', status: 'disconnected', meetingId });
        });

        try {
          await transcriber.connect(undefined, sampleRate);
        } catch (err: any) {
          const errMsg = err?.message ?? 'Failed to connect to transcription service';
          console.error('[AssemblyAI] Connection error:', errMsg);
          sendError(ws, {
            code: 'TRANSCRIPTION_CONNECTION_FAILED',
            message: errMsg,
            recoverable: false,
          });
          return;
        }

        session = {
          meetingId,
          startedAt: Date.now(),
          transcriber,
          paused: false,
          stopping: false,
          audioSource: (message as MeetingStartMessage).audioSource,
        };

        send(ws, {
          type: 'transcription:status',
          status: 'connected',
          meetingId,
          title,
        });
        break;
      }

      // ── meeting:pause ─────────────────────────────────────────────────────
      case 'meeting:pause': {
        if (session) {
          session.paused = true;
          send(ws, { type: 'transcription:status', status: 'paused', meetingId: session.meetingId });
        }
        break;
      }

      // ── meeting:resume ────────────────────────────────────────────────────
      case 'meeting:resume': {
        if (session) {
          session.paused = false;
          send(ws, { type: 'transcription:status', status: 'recording', meetingId: session.meetingId });
        }
        break;
      }

      // ── meeting:stop ──────────────────────────────────────────────────────
      case 'meeting:stop': {
        if (!session || session.stopping) break;
        session.stopping = true;

        const { meetingId, transcriber, startedAt } = session;
        const stopMsg = message as MeetingStopMessage;
        const durationSeconds = stopMsg.durationSeconds ?? Math.floor((Date.now() - startedAt) / 1000);

        send(ws, { type: 'transcription:status', status: 'finalizing', meetingId });

        // Finalize Deepgram stream
        transcriber.finalize();
        await new Promise(resolve => setTimeout(resolve, 1500));
        transcriber.close();

        // Complete meeting
        meetingRepository.complete(meetingId, durationSeconds);

        // Get meeting title for analysis
        const meeting = meetingRepository.findById(meetingId);
        const meetingTitle = meeting?.title ?? 'Untitled Meeting';

        send(ws, { type: 'transcription:status', status: 'completed', meetingId });

        session = null;

        // Run AI analysis asynchronously
        runAnalysis(ws, meetingId, meetingTitle).catch(console.error);
        break;
      }

      // ── client:ping ───────────────────────────────────────────────────────
      case 'client:ping': {
        send(ws, { type: 'server:pong', ts: Date.now() });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (session && !session.stopping) {
      // Client disconnected unexpectedly — complete the meeting so we don't lose the recording
      console.log(`[WS] Client disconnected during session ${session.meetingId}`);
      session.transcriber.close();
      try {
        const durationSeconds = Math.floor((Date.now() - session.startedAt) / 1000);
        meetingRepository.complete(session.meetingId, durationSeconds);
      } catch (_) {}
    }
    session = null;
  });

  ws.on('error', (err) => {
    console.error('[WS] Socket error:', err.message);
    if (session) {
      session.transcriber.close();
      session = null;
    }
  });
}
