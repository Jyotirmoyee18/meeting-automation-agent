import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), 'data', 'voxnote.db');

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db: DatabaseType = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled Meeting',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    ended_at TEXT,
    duration_seconds INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    user_id TEXT
  );

  CREATE TABLE IF NOT EXISTS transcript_segments (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    text TEXT NOT NULL,
    speaker INTEGER,
    start_time REAL,
    end_time REAL,
    confidence REAL,
    is_final INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS meeting_analyses (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL UNIQUE,
    summary TEXT,
    key_points TEXT,
    decisions TEXT,
    action_items TEXT,
    follow_up_questions TEXT,
    provider TEXT NOT NULL DEFAULT 'anthropic',
    model TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_segments_meeting_id ON transcript_segments(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
  CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at DESC);
`);

export default db;
