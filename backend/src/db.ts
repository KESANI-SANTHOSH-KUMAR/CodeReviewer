import { db } from "./dbConnection.js";
import { RowDataPacket, ResultSetHeader } from "mysql2";

// ✅ Session Type
export interface Session {
  sessionId: string;
  code: string;
  language: string;
  review: string;
  score: number;
  createdAt: Date;
}

// SAVE SESSION
export async function saveSession(session: Session): Promise<void> {
  await db.execute<ResultSetHeader>(
    `INSERT INTO sessions 
     (sessionId, code, language, review, score, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      session.sessionId,
      session.code,
      session.language,
      session.review,
      session.score,
      session.createdAt,
    ]
  );
}

// LIST SESSIONS
export async function listSessions(): Promise<Session[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT * FROM sessions ORDER BY createdAt DESC"
  );
  return rows as Session[];
}

// GET ONE SESSION
export async function getSession(id: string): Promise<Session | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT * FROM sessions WHERE sessionId = ?",
    [id]
  );

  return rows.length > 0 ? (rows[0] as Session) : null;
}

// DELETE SESSION
export async function deleteSession(id: string): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    "DELETE FROM sessions WHERE sessionId = ?",
    [id]
  );

  return result.affectedRows > 0;
}
