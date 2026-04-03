import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { deleteSession, getSession, listSessions, saveSession } from "./db";
import { streamReview } from "./reviewClient";
import type {
  ClientToServerMessage,
  ReviewResult,
  ServerToClientMessage,
} from "./types";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/sessions", async (req, res) => {
  try {
    const sessions = await listSessions();
    res.json(sessions);
  } catch (err) {
    console.error("SESSION FETCH ERROR:", err);
    res.status(500).json({ message: "DB error" });
  }
});

app.get("/sessions/:id", async (req, res) => {
  const session = await getSession(req.params.id);

  if (!session) {
    return res.status(404).json({ message: "Session not found" });
  }

  res.json(session);
});

app.delete("/sessions/:id", async (req, res) => {
  const removed = await deleteSession(req.params.id);

  if (!removed) {
    return res.status(404).json({ message: "Session not found" });
  }

  res.json({ message: "Deleted successfully" });
});

app.get("/", (_req, res) => {
  res.send("🚀 AI Code Review Backend is running");
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

function send(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
}

function safeParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function defaultReview(message: string, score = 50): ReviewResult {
  return {
    bugs: [message],
    style: [],
    security: [],
    summary: message,
    score,
  };
}

function normalizeReview(value: any): ReviewResult {
  const bugs = Array.isArray(value?.bugs)
    ? value.bugs.map((x: unknown) => String(x)).filter(Boolean)
    : [];

  const style = Array.isArray(value?.style)
    ? value.style.map((x: unknown) => String(x)).filter(Boolean)
    : [];

  const security = Array.isArray(value?.security)
    ? value.security.map((x: unknown) => String(x)).filter(Boolean)
    : [];

  let summary =
    typeof value?.summary === "string" ? value.summary.trim() : "";

  let score = Number(value?.score);
  if (!Number.isFinite(score)) score = 50;
  score = Math.max(0, Math.min(100, Math.round(score)));

  if (!summary) {
    summary = "No major issues found";
  }

  if (
    !bugs.length &&
    !style.length &&
    !security.length &&
    summary === "No major issues found"
  ) {
    score = Math.max(score, 70);
  }

  return {
    bugs,
    style,
    security,
    summary,
    score,
  };
}

function extractReview(text: string): ReviewResult {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/\r/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return defaultReview("No valid JSON found in AI response", 50);
  }

  const candidate = cleaned.slice(start, end + 1);

  try {
    const parsed = JSON.parse(candidate);
    return normalizeReview(parsed);
  } catch {
    return defaultReview("Streaming JSON parsing failed", 50);
  }
}

wss.on("connection", (ws) => {
  // This is only the connection ID.
  const connectionId = randomUUID();

  send(ws, {
    type: "session_created",
    sessionId: connectionId,
  });

  let reviewInProgress = false;

  ws.on("message", async (raw) => {
    const parsed = safeParse<ClientToServerMessage>(raw.toString());

    if (!parsed) {
      send(ws, {
        type: "error",
        message: "Invalid JSON payload",
      });
      return;
    }

    if (parsed.type !== "review_code") {
      send(ws, {
        type: "error",
        message: "Unsupported message type",
      });
      return;
    }

    if (!parsed.code.trim()) {
      send(ws, {
        type: "error",
        message: "Code cannot be empty",
      });
      return;
    }

    if (reviewInProgress) {
      send(ws, {
        type: "error",
        message: "A review is already in progress",
      });
      return;
    }

    reviewInProgress = true;

    // New ID per review so history does not overwrite previous sessions.
    const reviewSessionId = randomUUID();

    send(ws, {
      type: "review_started",
      sessionId: reviewSessionId,
    });

    let aggregated = "";

    try {
      await streamReview(parsed.code, parsed.language, (chunk) => {
        aggregated += chunk;

        send(ws, {
          type: "review_chunk",
          sessionId: reviewSessionId,
          chunk,
        });
      });

      const review = extractReview(aggregated);

      await saveSession({
        sessionId: reviewSessionId,
        code: parsed.code,
        language: parsed.language,
        review: JSON.stringify(review),
        score: review.score,
        createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      });

      send(ws, {
        type: "review_done",
        sessionId: reviewSessionId,
        review,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      send(ws, {
        type: "error",
        message,
      });
    } finally {
      reviewInProgress = false;
    }
  });
});

const port = Number(process.env.PORT ?? 3000);

server.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
