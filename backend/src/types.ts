export interface ReviewResult {
  bugs: string[];
  style: string[];
  security: string[];
  summary: string;
  score: number;
}

export interface ReviewCodeMessage {
  type: "review_code";
  code: string;
  language: string;
}

export interface SessionCreatedMessage {
  type: "session_created";
  sessionId: string;
}

export interface ReviewStartedMessage {
  type: "review_started";
  sessionId: string;
}

export interface ReviewChunkMessage {
  type: "review_chunk";
  sessionId: string;
  chunk: string;
}

export interface ReviewDoneMessage {
  type: "review_done";
  sessionId: string;
  review: ReviewResult;
}

export interface ReviewErrorMessage {
  type: "error";
  message: string;
}

export type ClientToServerMessage = ReviewCodeMessage;

export type ServerToClientMessage =
  | SessionCreatedMessage
  | ReviewStartedMessage
  | ReviewChunkMessage
  | ReviewDoneMessage
  | ReviewErrorMessage;

export interface SessionRow {
  sessionId: string;
  code: string;
  language: string;
  review: string;
  score: number;
  createdAt: string;
}

export interface SessionSummary {
  sessionId: string;
  language: string;
  score: number;
  createdAt: string;
}