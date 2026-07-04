import WebSocket from "ws";
import querystring from "querystring";
import { EventEmitter } from "events";

// ─── Shared Error / Segment Types ─────────────────────────────────────────────

export type TranscriptionErrorCode =
  | "TRANSCRIPTION_CONNECTION_FAILED"
  | "TRANSCRIPTION_AUTH_FAILED"
  | "TRANSCRIPTION_QUOTA_EXCEEDED"
  | "TRANSCRIPTION_RATE_LIMITED"
  | "TRANSCRIPTION_PROVIDER_UNAVAILABLE";

export interface TranscriptionError {
  type: "error";
  code: TranscriptionErrorCode;
  message: string;
  recoverable: boolean;
  provider: "assemblyai";
}

export interface WordData {
  word: string;
  start: number; // seconds
  end: number; // seconds
  confidence: number;
  speaker?: number;
}

export interface TranscriptSegmentData {
  segmentId: string;
  text: string;
  speaker: number | string | null;
  startTime: number;
  endTime: number;
  confidence: number;
  words: WordData[];
  isFinal: boolean;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class AssemblyAIProvider extends EventEmitter {
  private ws: WebSocket | null = null;
  private closed = false;

  constructor() {
    super();
    if (!process.env.ASSEMBLYAI_API_KEY) {
      throw new Error("ASSEMBLYAI_API_KEY is not configured");
    }
  }

  async connect(_encoding?: string, sampleRate?: number): Promise<void> {
    if (this.ws || this.closed) return;

    return new Promise((resolve, reject) => {
      const apiKey = process.env.ASSEMBLYAI_API_KEY!;
      const params = {
        speech_model: "universal-3-5-pro",
        sample_rate: sampleRate ?? 44100,
        encoding: "pcm_s16le",
        speaker_labels: true
      };
      const endpoint = `wss://streaming.assemblyai.com/v3/ws?${querystring.stringify(params)}`;

      const ws = new WebSocket(endpoint, {
        headers: { Authorization: apiKey },
      });

      let hasConnected = false;

      ws.on("open", () => {
        if (this.closed) return;
        hasConnected = true;
        this.emit("connected");
        resolve();
      });

      ws.on("message", (data) => {
        if (this.closed) return;
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "Turn") {
            this.handleTurn(msg);
          } else if (msg.type === "Error" || msg.error) {
            const fs = require('fs');
            fs.appendFileSync('aai_error.log', data.toString() + '\n');
            console.error("[AssemblyAI] Error Payload:", data.toString());
            this.handleError(new Error(msg.error || msg.message || "Unknown error"));
          } else {
            const fs = require('fs');
            fs.appendFileSync('aai_other.log', data.toString() + '\n');
            console.log("[AssemblyAI] Other Msg:", data.toString());
          }
        } catch (err) {
          console.error("[AssemblyAI] Failed to parse message:", err);
        }
      });

      ws.on("error", (err: Error) => {
        if (!hasConnected) {
          this.handleError(err);
          reject(err);
        } else {
          this.handleError(err);
        }
      });

      ws.on("close", () => {
        if (!this.closed) {
          this.closed = true;
          this.ws = null;
          this.emit("disconnected");
        }
      });

      this.ws = ws;
    });
  }

  sendAudio(chunk: Buffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.closed) {
      this.ws.send(chunk);
    }
  }

  finalize(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.closed) {
      this.ws.send(JSON.stringify({ type: "Terminate" }));
    }
  }

  close(): void {
    this.closed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private handleTurn(turn: any): void {
    try {
      const text = turn.transcript?.trim() ?? "";
      if (!text) return;

      const isFinal = turn.end_of_turn === true;

      // AssemblyAI streaming v3 uses milliseconds for word timestamps
      const words: WordData[] = (turn.words ?? []).map((w: any) => ({
        word: w.text ?? "",
        start: (w.start ?? 0) / 1000,
        end: (w.end ?? 0) / 1000,
        confidence: w.confidence ?? 0,
      }));

      const startTime = words.length > 0 ? words[0].start : 0;
      const endTime = words.length > 0 ? words[words.length - 1].end : 0;

      this.emit(isFinal ? "final" : "interim", {
        segmentId: `${startTime.toFixed(3)}-${isFinal ? "f" : "i"}`,
        text,
        speaker: turn.speaker ?? null,
        startTime,
        endTime,
        confidence: turn.end_of_turn_confidence ?? 0.9,
        words,
        isFinal,
      } satisfies TranscriptSegmentData);
    } catch (err) {
      console.error("[AssemblyAI] Transcript parse error:", err);
    }
  }

  private handleError(err: Error): void {
    const msg = (err?.message ?? "").toLowerCase();
    let error: TranscriptionError;

    if (
      msg.includes("401") ||
      msg.includes("unauthorized") ||
      msg.includes("authentication") ||
      msg.includes("403")
    ) {
      error = {
        type: "error",
        code: "TRANSCRIPTION_AUTH_FAILED",
        message:
          "Transcription authentication failed. Check your AssemblyAI API key.",
        recoverable: false,
        provider: "assemblyai",
      };
    } else if (
      msg.includes("402") ||
      msg.includes("quota") ||
      msg.includes("credits")
    ) {
      error = {
        type: "error",
        code: "TRANSCRIPTION_QUOTA_EXCEEDED",
        message: "AssemblyAI quota exceeded. Please check your account.",
        recoverable: false,
        provider: "assemblyai",
      };
    } else if (msg.includes("429") || msg.includes("rate limit")) {
      error = {
        type: "error",
        code: "TRANSCRIPTION_RATE_LIMITED",
        message:
          "Transcription rate limit reached. Please wait before retrying.",
        recoverable: true,
        provider: "assemblyai",
      };
    } else {
      error = {
        type: "error",
        code: "TRANSCRIPTION_CONNECTION_FAILED",
        message: `Transcription connection failed: ${err.message}`,
        recoverable: true,
        provider: "assemblyai",
      };
    }

    this.emit("error", error);
  }
}
