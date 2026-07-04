// ─── Meeting Status ───────────────────────────────────────────────────────────

export enum MeetingStatus {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
}

// ─── Connection States ────────────────────────────────────────────────────────

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'recording'
  | 'paused'
  | 'reconnecting'
  | 'finalizing'
  | 'completed'
  | 'disconnected'
  | 'error';

// ─── Legacy types (preserved for compatibility) ───────────────────────────────

export interface ActionItem {
  id: string;
  task: string;
  assignee: string;
  priority: 'High' | 'Medium' | 'Low';
}

export interface MeetingData {
  transcript: string;
  summary: string;
  actionItems: ActionItem[];
  followUpEmail: string;
}

export interface TranscriptionEntry {
  speaker: 'User' | 'Model' | 'System';
  text: string;
  timestamp: Date;
}

// ─── API Meeting ──────────────────────────────────────────────────────────────

export interface Meeting {
  id: string;
  title: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  status: 'pending' | 'recording' | 'processing' | 'completed' | 'failed';
  user_id: string | null;
  // Joined from analysis
  analysisStatus?: string | null;
  summary?: string | null;
}

// ─── Transcript Segment ───────────────────────────────────────────────────────

export interface TranscriptSegment {
  id: string;
  meetingId: string;
  text: string;
  speaker: number | null;
  startTime: number | null;
  endTime: number | null;
  confidence: number | null;
  isFinal: boolean;
  createdAt: string;
  // Frontend-only: interim not yet persisted
  isInterim?: boolean;
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export interface AnalysisActionItem {
  task: string;
  owner: string | null;
  deadline: string | null;
  completed: boolean;
}

export interface MeetingAnalysis {
  id: string;
  meetingId: string;
  summary: string | null;
  keyPoints: string[];
  decisions: string[];
  actionItems: AnalysisActionItem[];
  followUpQuestions: string[];
  provider: string;
  model: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Error Codes ──────────────────────────────────────────────────────────────

export type TranscriptionErrorCode =
  | 'TRANSCRIPTION_CONNECTION_FAILED'
  | 'TRANSCRIPTION_AUTH_FAILED'
  | 'TRANSCRIPTION_QUOTA_EXCEEDED'
  | 'TRANSCRIPTION_RATE_LIMITED'
  | 'TRANSCRIPTION_PROVIDER_UNAVAILABLE';

export interface AppError {
  type: 'error';
  code: string;
  message: string;
  recoverable: boolean;
  provider?: string;
}

// ─── WebSocket Messages ───────────────────────────────────────────────────────

export interface WsMeetingStartMsg {
  type: 'meeting:start';
  meetingId: string;
  meetingTitle: string;
  audioMimeType: string;
  sampleRate?: number;
  audioSource?: 'mic' | 'tab';
}

export interface WsAudioChunkMsg {
  type: 'audio:chunk';
  // binary data sent as ArrayBuffer
}

export interface WsMeetingStopMsg {
  type: 'meeting:stop';
  meetingId: string;
  durationSeconds: number;
}

export interface WsMeetingPauseMsg {
  type: 'meeting:pause';
  meetingId: string;
}

export interface WsMeetingResumeMsg {
  type: 'meeting:resume';
  meetingId: string;
}

// Server → Client

export interface WsConnectionReadyMsg {
  type: 'connection:ready';
}

export interface WsTranscriptionInterimMsg {
  type: 'transcription:interim';
  meetingId: string;
  segmentId: string;
  text: string;
  speaker: number | null;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface WsTranscriptionFinalMsg {
  type: 'transcription:final';
  meetingId: string;
  segmentId: string;
  text: string;
  speaker: number | null;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface WsTranscriptionStatusMsg {
  type: 'transcription:status';
  status: ConnectionState;
  meetingId?: string;
  title?: string;
}

export interface WsAnalysisStartedMsg {
  type: 'meeting:analysis-started';
  meetingId: string;
}

export interface WsAnalysisCompletedMsg {
  type: 'meeting:analysis-completed';
  meetingId: string;
  status: 'completed' | 'failed';
  analysis?: {
    summary: string;
    keyPoints: string[];
    decisions: string[];
    actionItems: AnalysisActionItem[];
    followUpQuestions: string[];
  };
  error?: string;
}

export interface WsErrorMsg {
  type: 'error';
  code: string;
  message: string;
  recoverable: boolean;
  provider?: string;
}

export type WsServerMessage =
  | WsConnectionReadyMsg
  | WsTranscriptionInterimMsg
  | WsTranscriptionFinalMsg
  | WsTranscriptionStatusMsg
  | WsAnalysisStartedMsg
  | WsAnalysisCompletedMsg
  | WsErrorMsg;
