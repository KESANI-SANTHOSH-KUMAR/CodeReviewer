from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq
import os
import re
import json
import time

# ==============================
# LOAD ENV
# ==============================
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY not found in .env")

client = Groq(api_key=GROQ_API_KEY)

# ==============================
# APP
# ==============================
app = FastAPI(title="AI Code Review Service (Groq)")

# ==============================
# MODEL
# ==============================
class ReviewRequest(BaseModel):
    code: str
    language: str

# ==============================
# HELPERS
# ==============================
def sanitize_list(value):
    if not isinstance(value, list):
        return []
    cleaned = []
    for item in value:
        text = str(item).strip()
        if text:
            cleaned.append(text)
    return cleaned

def normalize_review(data):
    bugs = sanitize_list(data.get("bugs"))
    style = sanitize_list(data.get("style"))
    security = sanitize_list(data.get("security"))

    summary = str(data.get("summary", "")).strip()
    if not summary:
        summary = "No major issues found"

    try:
        score = int(data.get("score", 50))
    except Exception:
        score = 50

    score = max(0, min(100, score))

    if not bugs and not style and not security and summary == "No major issues found":
        score = max(score, 70)

    return {
        "bugs": bugs,
        "style": style,
        "security": security,
        "summary": summary,
        "score": score,
    }

def fallback_review(message: str = "Fallback response due to invalid AI output", score: int = 50):
    return normalize_review(
        {
            "bugs": [message],
            "style": [],
            "security": [],
            "summary": message,
            "score": score,
        }
    )

def extract_review_json(raw_text: str):
    cleaned = re.sub(r"```json|```", "", raw_text, flags=re.IGNORECASE).strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")

    if start == -1 or end == -1 or end <= start:
        return fallback_review("Model did not return valid JSON", 50)

    candidate = cleaned[start : end + 1]

    try:
        parsed = json.loads(candidate)
        return normalize_review(parsed)
    except Exception:
        return fallback_review("JSON parsing failed", 50)

def stream_json_response(payload: dict):
    final_json = json.dumps(payload, ensure_ascii=False)

    def event_stream():
        for i in range(0, len(final_json), 200):
            chunk = final_json[i : i + 200]
            yield f"data: {chunk}\n\n"
            time.sleep(0.03)
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

# ==============================
# ROOT
# ==============================
@app.get("/")
def root():
    return {"message": "AI Code Review Service Running (Groq)"}

# ==============================
# HEALTH
# ==============================
@app.get("/health")
def health():
    return {"status": "ok"}

# ==============================
# REVIEW API
# ==============================
@app.post("/review")
async def review_code(req: ReviewRequest):
    try:
        language_hint = {
            "python": "Follow PEP8 standards.",
            "javascript": "Follow ES6+ standards.",
            "typescript": "Follow TypeScript best practices.",
            "java": "Follow Java OOP principles and naming conventions.",
            "cpp": "Check memory safety and pointers.",
            "c": "Check memory management and buffer overflow.",
            "sql": "Check SQL injection and query optimization.",
            "php": "Check PHP security issues, variable usage, and escaping.",
            "go": "Check idiomatic Go practices and error handling.",
        }.get(req.language, "")

        prompt = f"""
You are a senior {req.language} developer and expert code reviewer.

Your goal is to provide an accurate, minimal, and realistic code review.

========================
CORE PRINCIPLE
========================
If there is NO clear issue, DO NOT report anything.

========================
LANGUAGE CONTEXT
========================
{language_hint}

========================
STRICT RULES (VERY IMPORTANT)
========================
- Only report issues that are CLEARLY present in the code.
- DO NOT assume hidden or possible issues.
- DO NOT over-analyze simple code.
- DO NOT give generic suggestions.
- DO NOT mention best practices unless violated.
- If unsure → DO NOT report it.

========================
BUG RULES
========================
Report ONLY:
- Syntax errors
- Undefined variables
- Invalid operations
- Real logical mistakes

DO NOT report:
- Hypothetical bugs
- Edge cases not present in code

========================
STYLE RULES (HIGH PRIORITY ONLY)
========================
Report ONLY style issues that have a SIGNIFICANT impact on:

- Performance (e.g., inefficient loops, unnecessary computations)
- Maintainability (e.g., deeply nested logic, unreadable structure)
- Scalability (e.g., poor design that won't scale)
- Critical naming issues that cause confusion

DO NOT report:
- Minor formatting issues (spacing, indentation)
- Personal coding preferences
- Optional improvements
- Cosmetic or low-impact suggestions

If the code is readable and functional → return an empty style array.

========================
SECURITY RULES
========================
Report ONLY if explicitly visible:

- SQL Injection → ONLY if user input is directly used in query
- XSS → ONLY if raw user input is output without sanitization

DO NOT report:
- Security risks without user input
- Theoretical vulnerabilities

========================
SCORING LOGIC
========================
- Start from 100
- Subtract points ONLY for real issues
- No issues → score = 90–100

========================
OUTPUT RULES
========================
Return ONLY valid JSON.

DO NOT include:
- explanations
- markdown (no ``` )
- extra text

Format:
{{
  "bugs": [],
  "style": [],
  "security": [],
  "summary": "",
  "score": 0
}}

========================
FINAL BEHAVIOR
========================
- If NO issues:
  bugs = []
  style = []
  security = []
  summary = "No major issues found"
  score = 90

- Be deterministic (same input → same output)
- Prefer empty results over incorrect ones

========================
CODE
========================
{req.code}
""".strip()

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "You are a strict code reviewer. Return only JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            top_p=1,
        )

        raw_result = response.choices[0].message.content or ""
        review = extract_review_json(raw_result)

        return stream_json_response(review)

    except Exception as e:
        print("ERROR:", str(e))
        return stream_json_response(
            fallback_review("AI service error", 50)
        )