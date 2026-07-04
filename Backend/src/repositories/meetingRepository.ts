import db from '../db';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MeetingRow {
  id: string;
  title: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  status: 'pending' | 'recording' | 'processing' | 'completed' | 'failed';
  user_id: string | null;
}

export interface TranscriptSegmentRow {
  id: string;
  meeting_id: string;
  text: string;
  speaker: number | string | null;
  start_time: number | null;
  end_time: number | null;
  confidence: number | null;
  is_final: number;
  created_at: string;
}

export interface MeetingAnalysisRow {
  id: string;
  meeting_id: string;
  summary: string | null;
  key_points: string | null;
  decisions: string | null;
  action_items: string | null;
  follow_up_questions: string | null;
  provider: string;
  model: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Meeting Repository ───────────────────────────────────────────────────────

export const meetingRepository = {
  create(title: string, id?: string): MeetingRow {
    const meetingId = id || uuidv4();
    const stmt = db.prepare(`
      INSERT INTO meetings (id, title, status, started_at)
      VALUES (?, ?, 'recording', datetime('now'))
    `);
    stmt.run(meetingId, title);
    return this.findById(meetingId)!;
  },

  findById(id: string): MeetingRow | undefined {
    return db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as MeetingRow | undefined;
  },

  findAll(search?: string, limit = 50, offset = 0): MeetingRow[] {
    if (search) {
      return db.prepare(`
        SELECT * FROM meetings
        WHERE title LIKE ? OR id LIKE ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(`%${search}%`, `%${search}%`, limit, offset) as MeetingRow[];
    }
    return db.prepare(`
      SELECT * FROM meetings
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as MeetingRow[];
  },

  updateStatus(id: string, status: MeetingRow['status']): void {
    db.prepare('UPDATE meetings SET status = ? WHERE id = ?').run(status, id);
  },

  complete(id: string, durationSeconds: number): void {
    db.prepare(`
      UPDATE meetings
      SET status = 'completed', ended_at = datetime('now'), duration_seconds = ?
      WHERE id = ?
    `).run(durationSeconds, id);
  },

  updateTitle(id: string, title: string): void {
    db.prepare('UPDATE meetings SET title = ? WHERE id = ?').run(title, id);
  },
};

// ─── Transcript Segment Repository ───────────────────────────────────────────

export const segmentRepository = {
  insert(segment: {
    meetingId: string;
    text: string;
    speaker?: number | string | null;
    startTime?: number | null;
    endTime?: number | null;
    confidence?: number | null;
  }): TranscriptSegmentRow {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO transcript_segments (id, meeting_id, text, speaker, start_time, end_time, confidence, is_final)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      segment.meetingId,
      segment.text,
      segment.speaker ?? null,
      segment.startTime ?? null,
      segment.endTime ?? null,
      segment.confidence ?? null,
    );
    return this.findById(id)!;
  },

  // Idempotent insert by stable ID (prevents duplicates on reconnect)
  upsertById(id: string, segment: {
    meetingId: string;
    text: string;
    speaker?: number | string | null;
    startTime?: number | null;
    endTime?: number | null;
    confidence?: number | null;
  }): void {
    db.prepare(`
      INSERT OR IGNORE INTO transcript_segments (id, meeting_id, text, speaker, start_time, end_time, confidence, is_final)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      segment.meetingId,
      segment.text,
      segment.speaker ?? null,
      segment.startTime ?? null,
      segment.endTime ?? null,
      segment.confidence ?? null,
    );
  },

  findById(id: string): TranscriptSegmentRow | undefined {
    return db.prepare('SELECT * FROM transcript_segments WHERE id = ?').get(id) as TranscriptSegmentRow | undefined;
  },

  findByMeetingId(meetingId: string): TranscriptSegmentRow[] {
    return db.prepare(`
      SELECT * FROM transcript_segments
      WHERE meeting_id = ?
      ORDER BY start_time ASC, created_at ASC
    `).all(meetingId) as TranscriptSegmentRow[];
  },
};

// ─── Analysis Repository ──────────────────────────────────────────────────────

export const analysisRepository = {
  create(meetingId: string): MeetingAnalysisRow {
    const id = uuidv4();
    db.prepare(`
      INSERT OR REPLACE INTO meeting_analyses (id, meeting_id, status)
      VALUES (?, ?, 'running')
    `).run(id, meetingId);
    return this.findByMeetingId(meetingId)!;
  },

  complete(meetingId: string, data: {
    summary: string;
    keyPoints: string[];
    decisions: string[];
    actionItems: object[];
    followUpQuestions: string[];
    model: string;
  }): void {
    db.prepare(`
      UPDATE meeting_analyses
      SET summary = ?, key_points = ?, decisions = ?, action_items = ?,
          follow_up_questions = ?, model = ?, status = 'completed',
          updated_at = datetime('now')
      WHERE meeting_id = ?
    `).run(
      data.summary,
      JSON.stringify(data.keyPoints),
      JSON.stringify(data.decisions),
      JSON.stringify(data.actionItems),
      JSON.stringify(data.followUpQuestions),
      data.model,
      meetingId,
    );
  },

  fail(meetingId: string, errorMessage: string): void {
    db.prepare(`
      UPDATE meeting_analyses
      SET status = 'failed', error_message = ?, updated_at = datetime('now')
      WHERE meeting_id = ?
    `).run(errorMessage, meetingId);
  },

  findByMeetingId(meetingId: string): MeetingAnalysisRow | undefined {
    return db.prepare('SELECT * FROM meeting_analyses WHERE meeting_id = ?').get(meetingId) as MeetingAnalysisRow | undefined;
  },
};
