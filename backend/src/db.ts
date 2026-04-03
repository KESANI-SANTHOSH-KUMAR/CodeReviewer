import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { SessionRow, SessionSummary } from "./types";

const sqlitePath = process.env.SQLITE_PATH ?? "./data/devlane.sqlite";
const absolutePath = path.isAbsolute(sqlitePath)
  ? sqlitePath
  : path.join(process.cwd(), sqlitePath);

fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

const db = new Database(absolutePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    language TEXT NOT NULL,
    review TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export function saveSession(row: SessionRow): void {
  db.prepare(
    `
    INSERT INTO sessions (session_id, code, language, review, score, created_at)
    VALUES (@sessionId, @code, @language, @review, @score, @createdAt)
    ON CONFLICT(session_id) DO UPDATE SET
      code=excluded.code,
      language=excluded.language,
      review=excluded.review,
      score=excluded.score,
      created_at=excluded.created_at
    `
  ).run(row);
}

export function listSessions(): SessionSummary[] {
  return db
    .prepare(
      `
      SELECT session_id as sessionId, language, score, created_at as createdAt
      FROM sessions
      ORDER BY datetime(created_at) DESC
      `
    )
    .all() as SessionSummary[];
}

export function getSession(sessionId: string): SessionRow | undefined {
  return db
    .prepare(
      `
      SELECT
        session_id as sessionId,
        code,
        language,
        review,
        score,
        created_at as createdAt
      FROM sessions
      WHERE session_id = ?
      `
    )
    .get(sessionId) as SessionRow | undefined;
}

export function deleteSession(sessionId: string): boolean {
  const result = db.prepare(`DELETE FROM sessions WHERE session_id = ?`).run(sessionId);
  return result.changes > 0;
}