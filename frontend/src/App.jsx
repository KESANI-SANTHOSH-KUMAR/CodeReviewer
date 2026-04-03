import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import "./index.css";

const API_URL = import.meta.env.VITE_API_URL;
const WS_URL = import.meta.env.VITE_WS_URL;

function safeJsonParse(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeIssue(item) {
  if (typeof item === "string") {
    let text = item.trim();
    // Try to fix common AI formatting issues (single quotes to double quotes)
    try {
      const fixed = text.replace(/'/g, '"');
      const parsed = JSON.parse(fixed);
      return {
        // Map whatever the AI sends to the "text" key the UI needs
        text: parsed.description || parsed.message || parsed.text || text,
        line: parsed.line ?? null,
        column: parsed.column ?? (parsed.col ?? null), // handle "col" or "column"
      };
    } catch {
      return { text, line: null, column: null };
    }
  }

  if (item && typeof item === "object") {
    return {
      // Prioritize 'description' since that's what your AI is currently sending
      text: item.description || item.message || item.text || "Issue detected",
      line: item.line ?? null,
      column: item.column ?? (item.col ?? null),
    };
  }
  return null;
}
function normalizeReview(review) {
  if (!review) {
    return {
      bugs: [],
      style: [],
      security: [],
      summary: "",
      score: 0,
    };
  }

  const safeScore = Number(review.score);
  const score = Number.isFinite(safeScore)
    ? Math.max(0, Math.min(100, Math.round(safeScore)))
    : 0;

  const bugs = Array.isArray(review.bugs)
    ? review.bugs.map(normalizeIssue).filter(Boolean)
    : [];

  const style = Array.isArray(review.style)
    ? review.style.map(normalizeIssue).filter(Boolean)
    : [];

  const security = Array.isArray(review.security)
    ? review.security.map(normalizeIssue).filter(Boolean)
    : [];

  const summary =
    typeof review.summary === "string" && review.summary.trim()
      ? review.summary.trim()
      : "No major issues found";

  return {
    bugs,
    style,
    security,
    summary,
    score,
  };
}

function getScoreTone(score) {
  if (score >= 85) return "excellent";
  if (score >= 60) return "warning";
  return "danger";
}

function getScoreLabel(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 50) return "Fair";
  return "Needs work";
}

function getScoreColor(score) {
  if (score >= 85) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function shortId(id) {
  if (!id) return "";
  return `${id.slice(0, 8)}…`;
}

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function isSameLocalDay(dateString) {
  try {
    const normalized = dateString.replace(" ", "T"); // 🔥 FIX
    const d = new Date(normalized);
    const now = new Date();

    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  } catch {
    return false;
  }
}

function detectLanguageFromFilename(filename = "") {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".java")) return "java";
  if (lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".cxx")) return "cpp";
  if (lower.endsWith(".c")) return "c";
  if (lower.endsWith(".sql")) return "sql";
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".php")) return "php";

  return null;
}

function detectLanguageFromCode(code = "") {
  const text = code.trim();

  if (!text) return null;
  if (/^\s*<\?php/i.test(text)) return "php";
  if (/^\s*package\s+main/m.test(text) && /func\s+main\s*\(/m.test(text)) return "go";
  if (/^\s*#include\s*</m.test(text) && /cout\s*<</m.test(text)) return "cpp";
  if (/^\s*#include\s*</m.test(text) && /printf\s*\(/m.test(text)) return "c";
  if (/^\s*public\s+class\s+/m.test(text) || /System\.out\.println\s*\(/m.test(text)) return "java";
  if (/\bconsole\.log\s*\(/m.test(text) || /\b=>\s*{?/m.test(text) || /\bimport\s+.*from\s+['"]/m.test(text)) {
    if (/\binterface\b|\btype\s+\w+\s*=|\:\s*\w+/m.test(text)) return "typescript";
    return "javascript";
  }
  if (/^\s*SELECT\s+/im.test(text) || /\bINSERT\s+/im.test(text) || /\bUPDATE\s+/im.test(text)) return "sql";
  if (/^\s*def\s+\w+\s*\(/m.test(text) || /\bimport\s+\w+/m.test(text) || /\bprint\s*\(/m.test(text)) return "python";

  return null;
}

function detectLanguage(code, filename) {
  return (
    detectLanguageFromFilename(filename) ||
    detectLanguageFromCode(code) ||
    "plaintext"
  );
}

function IssueList({ items, emptyText }) {
  if (!items.length) {
    return <div className="empty-state">{emptyText}</div>;
  }

  return (
    <div className="issue-list">
      {items.map((item, index) => (
        <div className="issue-row" key={`${item.text}-${index}`}>
          <div className="issue-dot" />
          <div className="issue-body">
            <div className="issue-text">{item.text}</div>

            {(item.line != null || item.column != null) && (
              <div className="issue-meta">
                {item.line != null && <span>Line {item.line}</span>}
                {item.column != null && <span>Col {item.column}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const wsRef = useRef(null);
  const fileInputRef = useRef(null);
  const mainGridRef = useRef(null);
  const resizingRef = useRef(false);
  
  const [code, setCode] = useState("print('Hello')");
  const [language, setLanguage] = useState("python");
  const [fileName, setFileName] = useState("");
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [leftWidth, setLeftWidth] = useState(64);
  const [notice, setNotice] = useState(
    "Connect the backend, select a language, and review your code."
  );
  const [activeTab, setActiveTab] = useState("overview");
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const languages = useMemo(
    () => [
      { label: "Python", value: "python" },
      { label: "JavaScript", value: "javascript" },
      { label: "TypeScript", value: "typescript" },
      { label: "Java", value: "java" },
      { label: "C++", value: "cpp" },
      { label: "C", value: "c" },
      { label: "SQL", value: "sql" },
      { label: "Go", value: "go" },
      { label: "PHP", value: "php" },
    ],
    []
  );

  const starterCode = useMemo(
    () => ({
      python: "print('Hello World')",
      javascript: "console.log('Hello World');",
      typescript: "const msg: string = 'Hello';\nconsole.log(msg);",
      java: `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello World");
  }
}`,
      cpp: `#include <iostream>
using namespace std;

int main() {
  cout << "Hello";
  return 0;
}`,
      c: `#include <stdio.h>

int main() {
  printf("Hello");
  return 0;
}`,
      sql: "SELECT * FROM users;",
      go: `package main

import "fmt"

func main() {
  fmt.Println("Hello")
}`,
      php: `<?php
echo 'Hello World';
`,
    }),
    []
  );

  const getEditorLanguage = (lang) => {
    if (lang === "cpp") return "cpp";
    if (lang === "c") return "c";
    return lang;
  };

  const currentReview = useMemo(() => normalizeReview(review), [review]);
  const detectedLanguage = useMemo(
    () => detectLanguage(code, fileName),
    [code, fileName]
  );
  const scoreTone = getScoreTone(currentReview.score);
  const scoreLabel = getScoreLabel(currentReview.score);
  const scoreColor = getScoreColor(currentReview.score);

  const todaySessions = useMemo(() => {
  return sessions.filter((session) =>
    isSameLocalDay(session.createdAt)
  );
}, [sessions]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const response = await fetch(`${API_URL}/sessions`);
      if (!response.ok) throw new Error("Failed to load sessions");
      const data = await response.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setNotice("Could not load session history.");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const openSession = useCallback(async (sessionId) => {
    try {
      const response = await fetch(`${API_URL}/sessions/${sessionId}`);
      if (!response.ok) throw new Error("Session not found");

      const session = await response.json();
      const parsedReview = safeJsonParse(session.review) ?? {
        bugs: [],
        style: [],
        security: [],
        summary: "Stored review could not be parsed",
        score: 50,
      };

      setCode(session.code || "");
      setLanguage(session.language || "python");
      setFileName("");
      setReview(parsedReview);
      setActiveTab("overview");
      setSelectedSessionId(sessionId);
      setNotice(`Loaded session ${shortId(sessionId)}`);
      setIsHistoryOpen(false);
    } catch (error) {
      console.error(error);
      setNotice("Could not load that session.");
    }
  }, []);

  const deleteSessionById = useCallback(async (sessionId) => {
    try {
      const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete session");

      setSessions((prev) => prev.filter((item) => item.sessionId !== sessionId));

      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
        setReview(null);
      }

      setNotice(`Deleted session ${shortId(sessionId)}`);
    } catch (error) {
      console.error(error);
      setNotice("Could not delete session.");
    }
  }, [selectedSessionId]);

  const openHistory = useCallback(() => {
    setIsHistoryOpen(true);
    loadSessions();
  }, [loadSessions]);

  const closeHistory = useCallback(() => {
    setIsHistoryOpen(false);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!resizingRef.current || !mainGridRef.current) return;

      const rect = mainGridRef.current.getBoundingClientRect();
      const next = ((event.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(36, Math.min(72, next));
      setLeftWidth(clamped);
    };

    const handlePointerUp = () => {
      if (resizingRef.current) {
        resizingRef.current = false;
        setIsResizing(false);
        document.body.style.cursor = "";
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    if (wsRef.current) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setNotice("Live backend connected.");
      console.log("Connected to WS");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "review_started") {
          setReview(null);
          setLoading(true);
          setActiveTab("overview");
          setSelectedSessionId(data.sessionId ?? null);
          setNotice("AI is analysing your code...");
        }

        if (data.type === "review_done") {
          setLoading(false);
          setReview(data.review);
          setSelectedSessionId(data.sessionId ?? null);
          setNotice("Review completed successfully.");
          loadSessions();
        }

        if (data.type === "error") {
          setLoading(false);
          setNotice(data.message || "Backend error");
          console.error("Backend error:", data.message);
        }
      } catch (err) {
        console.error("Invalid WS message:", err);
      }
    };

    ws.onerror = (err) => {
      console.warn("WebSocket error:", err);
      setNotice("WebSocket error. Check backend is running.");
    };

    ws.onclose = () => {
      setConnected(false);
      setNotice("Backend disconnected.");
      wsRef.current = null;
      console.warn("WebSocket closed");
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [loadSessions]);

  const handleReview = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setNotice("WebSocket is not connected yet.");
      return;
    }

    setNotice("Review request sent.");
    wsRef.current.send(
      JSON.stringify({
        type: "review_code",
        code,
        language,
      })
    );
  };

  const handleReset = () => {
    setCode(starterCode[language] || "");
    setFileName("");
    setReview(null);
    setLoading(false);
    setActiveTab("overview");
    setSelectedSessionId(null);
    setNotice(`Loaded ${language.toUpperCase()} starter code.`);
  };

  const handleClear = () => {
    setReview(null);
    setLoading(false);
    setNotice("Cleared review results.");
  };

  const handleResizePointerDown = (e) => {
    e.preventDefault();
    resizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const detected = detectLanguageFromFilename(file.name) || detectLanguageFromCode(text) || language;

      setFileName(file.name);
      setLanguage(detected);
      setCode(text);
      setSelectedSessionId(null);
      setReview(null);
      setActiveTab("overview");
      setNotice(`Loaded ${file.name} (${detected.toUpperCase()})`);
    } catch (error) {
      console.error(error);
      setNotice("Could not read the file.");
    } finally {
      event.target.value = "";
    }
  };

  const bugs = currentReview.bugs;
  const style = currentReview.style;
  const security = currentReview.security;

  const SessionCard = ({ session, onOpen, onDelete }) => (
    <article
      className={
        selectedSessionId === session.sessionId
          ? "session-card active"
          : "session-card"
      }
      onClick={() => onOpen(session.sessionId)}
    >
      <div className="session-top">
        <span className="session-lang">
          {String(session.language || "").toUpperCase()}
        </span>
        <span
          className="session-score"
          style={{ color: getScoreColor(session.score) }}
        >
          {session.score}/100
        </span>
      </div>

      <div className="session-date">{formatDate(session.createdAt)}</div>
      <div className="session-id">{shortId(session.sessionId)}</div>

      <div className="session-actions">
        <button
          className="session-link"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(session.sessionId);
          }}
        >
          Open
        </button>

        <button
          className="session-link danger"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session.sessionId);
          }}
        >
          Delete
        </button>
      </div>
    </article>
  );

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />

      <header className="header glass">
        <div className="brand">
          <div className="brand-mark">✦</div>
          <div>
            <div className="brand-title">AI Code Review Bot</div>
            <div className="brand-subtitle">
              Real-time code review with streaming feedback
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className={`status-pill ${connected ? "live" : "warm"}`}>
            <span className="status-dot" />
            {connected ? "Connected" : "Connecting"}
          </div>
          <div className="status-pill neutral">{language.toUpperCase()}</div>
          <div className="status-pill neutral">
            Detected: {detectedLanguage.toUpperCase()}
          </div>
        </div>
      </header>

      <div className="notice-bar glass">
        <span className={`notice-dot ${connected ? "live" : "warm"}`} />
        <span>{notice}</span>
        <span className="notice-right">
          {loading ? "Reviewing..." : connected ? "Ready" : "Offline"}
        </span>
      </div>

      <main className="main-layout">
        <aside className="sessions-panel glass">
          <div className="sessions-header">
            <div>
              <div className="toolbar-label">Today</div>
              <h3>Review Sessions</h3>
            </div>

            <div className="sessions-header-actions">
              <button className="button ghost small" onClick={loadSessions}>
                {sessionsLoading ? "Refreshing..." : "Refresh"}
              </button>
              <button className="button primary small" onClick={openHistory}>
                Open History
              </button>
            </div>
          </div>

          <div className="sessions-meta">
            Today: {todaySessions.length} | All: {sessions.length}
          </div>

          <div className="sessions-list">
            {sessionsLoading && sessions.length === 0 ? (
              <div className="empty-state">Loading sessions…</div>
            ) : todaySessions.length === 0 ? (
              <div className="empty-state">
                No sessions from today yet. Run your first review and it will appear here.
              </div>
            ) : (
              todaySessions.map((session) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  onOpen={openSession}
                  onDelete={deleteSessionById}
                />
              ))
            )}
          </div>
        </aside>

        <div className="workspace" ref={mainGridRef}>
          <section className="editor-panel glass" style={{ flexBasis: `${leftWidth}%` }}>
            <div className="toolbar">
              <div className="toolbar-left">
                <div>
                  <div className="toolbar-label">Language</div>
                  <select
                    className="select"
                    value={language}
                    onChange={(e) => {
                      const lang = e.target.value;
                      setLanguage(lang);
                      setCode(starterCode[lang] || "");
                      setFileName("");
                      setNotice(`${lang.toUpperCase()} starter loaded.`);
                    }}
                  >
                    {languages.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mini-stat">
                  <span className="mini-stat__label">Mode</span>
                  <span className="mini-stat__value">Live Review</span>
                </div>

                <div className="mini-stat">
                  <span className="mini-stat__label">Detected</span>
                  <span className="mini-stat__value">
                    {detectedLanguage.toUpperCase()}
                  </span>
                </div>

                <div className="mini-stat">
                  <span className="mini-stat__label">File</span>
                  <span className="mini-stat__value">
                    {fileName ? fileName : "None"}
                  </span>
                </div>
              </div>

              <div className="toolbar-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".js,.jsx,.ts,.tsx,.py,.go,.java,.c,.cpp,.cc,.cxx,.sql,.php,.txt,text/plain"
                  onChange={handleFileUpload}
                  hidden
                />

                <button className="button ghost small" onClick={handlePickFile}>
                  Upload File
                </button>
                <button className="button ghost small" onClick={handleReset}>
                  Reset Sample
                </button>
                <button className="button ghost small" onClick={handleClear}>
                  Clear Review
                </button>
                <button className="button primary" onClick={handleReview}>
                  {loading ? "Reviewing..." : "Review Code"}
                </button>
              </div>
            </div>

            <div className="editor-stage">
              <Editor
                height="100%"
                theme="vs-dark"
                language={getEditorLanguage(language)}
                value={code}
                onChange={(value) => setCode(value ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 15,
                  fontFamily: "Fira Code, Menlo, Monaco, Consolas, monospace",
                  automaticLayout: true,
                  roundedSelection: true,
                  scrollBeyondLastLine: false,
                  renderLineHighlight: "all",
                  padding: { top: 14, bottom: 14 },
                }}
              />
            </div>
          </section>

          <div
            className={`resizer ${isResizing ? "active" : ""}`}
            onPointerDown={handleResizePointerDown}
            aria-label="Resize panels"
            role="separator"
          >
            <span className="resizer-handle" />
          </div>

          <aside className="review-panel glass" style={{ flexBasis: `${100 - leftWidth}%` }}>
            {review ? (
              <>
                <div className="review-hero">
                  <div
                    className={`score-ring ${scoreTone}`}
                    style={{
                      background: `conic-gradient(${scoreColor} 0 ${currentReview.score}%, rgba(255,255,255,0.08) ${currentReview.score}% 100%)`,
                    }}
                  >
                    <div className="score-ring__inner">
                      <span>{currentReview.score}</span>
                      <small>/100</small>
                    </div>
                  </div>

                  <div className="review-copy">
                    <div className="eyebrow">{scoreLabel}</div>
                    <h2>AI Review</h2>
                    <p className="review-summary">{currentReview.summary}</p>

                    <div className="metric-row">
                      <div className="metric-card">
                        <span>🐞 Bugs</span>
                        <strong>{bugs.length}</strong>
                      </div>
                      <div className="metric-card">
                        <span>🎨 Style</span>
                        <strong>{style.length}</strong>
                      </div>
                      <div className="metric-card">
                        <span>🔐 Security</span>
                        <strong>{security.length}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="tab-row">
                  <button
                    className={activeTab === "overview" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("overview")}
                  >
                    Overview
                  </button>
                  <button
                    className={activeTab === "bugs" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("bugs")}
                  >
                    Bugs
                  </button>
                  <button
                    className={activeTab === "style" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("style")}
                  >
                    Style
                  </button>
                  <button
                    className={activeTab === "security" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("security")}
                  >
                    Security
                  </button>
                </div>

                <div className="panel-content">
                  {activeTab === "overview" && (
                    <div className="overview-grid">
                      <div className="overview-card">
                        <h3>Summary</h3>
                        <p>{currentReview.summary}</p>
                      </div>

                      <div className="overview-card">
                        <h3>Highlights</h3>
                        {bugs.length === 0 &&
                        style.length === 0 &&
                        security.length === 0 ? (
                          <div className="good-badge">No major issues found ✨</div>
                        ) : (
                          <div className="highlight-list">
                            {bugs[0] && (
                              <span className="highlight-chip red">
                                Bug: {bugs[0].text}
                              </span>
                            )}
                            {style[0] && (
                              <span className="highlight-chip amber">
                                Style: {style[0].text}
                              </span>
                            )}
                            {security[0] && (
                              <span className="highlight-chip blue">
                                Security: {security[0].text}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === "bugs" && (
                    <div className="section-card">
                      <div className="section-title red">🐞 Bugs</div>
                      <IssueList
                        items={bugs}
                        emptyText="No major bugs detected."
                      />
                    </div>
                  )}

                  {activeTab === "style" && (
                    <div className="section-card">
                      <div className="section-title amber">🎨 Style</div>
                      <IssueList
                        items={style}
                        emptyText="No high-impact style issues detected."
                      />
                    </div>
                  )}

                  {activeTab === "security" && (
                    <div className="section-card">
                      <div className="section-title blue">🔐 Security</div>
                      <IssueList
                        items={security}
                        emptyText="No clear security issues detected."
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-dashboard">
                <div className="empty-art">🧠</div>
                <h2>Ready for Review</h2>
                <p>
                  Select a language, paste code, or upload a file, then launch
                  the review to see issues turn into a polished dashboard.
                </p>

                <div className="empty-pills">
                  <span className="pill">Streaming</span>
                  <span className="pill">WebSocket</span>
                  <span className="pill">Multi-language</span>
                  <span className="pill">Glass UI</span>
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>

      <div className={`history-overlay ${isHistoryOpen ? "open" : ""}`} onClick={closeHistory}>
        <aside className="history-drawer glass" onClick={(e) => e.stopPropagation()}>
          <div className="sessions-header">
            <div>
              <div className="toolbar-label">All History</div>
              <h3>Review Sessions</h3>
            </div>

            <button className="button ghost small" onClick={closeHistory}>
              Close
            </button>
          </div>

          <div className="sessions-meta">
            All sessions: {sessions.length}
          </div>

          <div className="sessions-list">
            {sessionsLoading && sessions.length === 0 ? (
              <div className="empty-state">Loading sessions…</div>
            ) : sessions.length === 0 ? (
              <div className="empty-state">
                No saved sessions yet.
              </div>
            ) : (
              sessions.map((session) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  onOpen={openSession}
                  onDelete={deleteSessionById}
                />
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
