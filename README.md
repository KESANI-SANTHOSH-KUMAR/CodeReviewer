# 🚀 AI Code Review Bot

> ✨ Real-time AI-powered code analysis with stunning UI, multi-language support, and persistent session history

---

## 🧠 Overview

AI Code Review Bot is a **full-stack intelligent application** that analyzes code in real time and provides structured feedback on:

* 🐞 Bugs
* 🎨 Style issues
* 🔐 Security vulnerabilities
* 📊 Code quality score

Built with **modern technologies** and designed for **production-level performance**, this project demonstrates real-world full-stack engineering skills.

---

## ⚡ Features

### 🔥 Core Features

* ⚡ Real-time code review using WebSocket
* 🌐 Multi-language support (Python, Java, JavaScript, C/C++, SQL, Go, PHP)
* 🧠 AI-powered structured analysis
* 📊 Score-based evaluation system
* 💾 Persistent session history (MySQL - Aiven)

---

### 🎨 UI / UX

* ✨ Stunning glassmorphism UI
* 🧩 Monaco Code Editor integration
* 📂 File upload support
* 📜 Session history panel
* 📊 Visual score indicators
* 🧠 Smart language detection

---

### 🏗️ Architecture

```
Frontend (React + Vite + Monaco)
        ↓
WebSocket (Real-time)
        ↓
Backend (Node.js + Express)
        ↓
AI Service (FastAPI / LLM)
        ↓
Database (MySQL - Aiven)
```

---

## 🛠️ Tech Stack

### Frontend

* React (Vite)
* Monaco Editor
* CSS (Custom UI)

### Backend

* Node.js
* Express
* WebSocket

### AI Layer

* FastAPI
* LLM (AI Code Review Model)

### Database

* MySQL (Aiven Cloud)

---

## 🚀 Deployment

### 🔹 Backend (Render)

1. Push backend to GitHub
2. Deploy on Render
3. Add environment variables:

```
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
AI_SERVICE_URL=
```

---

### 🔹 Frontend (Vercel)

1. Push frontend to GitHub
2. Deploy on Vercel
3. Add environment variables:

```
VITE_API_URL=https://your-backend.onrender.com
VITE_WS_URL=wss://your-backend.onrender.com
```

---

### 🔹 Database (Aiven MySQL)

```sql
CREATE TABLE sessions (
  sessionId VARCHAR(255) PRIMARY KEY,
  code TEXT,
  language VARCHAR(50),
  review TEXT,
  score INT,
  createdAt DATETIME
);
```

---

## 🧪 How It Works

1. User writes or uploads code
2. Frontend sends code via WebSocket
3. Backend processes request
4. AI analyzes code
5. Structured JSON response returned
6. Data stored in MySQL
7. UI displays results beautifully

---

## 💡 Challenges Solved

* ❌ Inconsistent AI output → ✅ Normalized JSON handling
* ❌ Data loss (in-memory) → ✅ MySQL persistence
* ❌ WebSocket instability → ✅ Stable connection handling
* ❌ Date mismatch → ✅ Proper formatting & parsing

---

## 🧠 Key Learnings

* Real-time communication using WebSockets
* AI integration in production systems
* Database persistence & scaling
* Full-stack deployment (Render + Vercel)
* Handling unpredictable AI responses

---

## 💯 Interview Explanation

> Initially, session data was stored in-memory which caused data loss on server restarts.
> I improved the system by integrating MySQL (Aiven) for persistent storage and scalability.
> The project uses WebSockets for real-time communication and AI models for structured code analysis.

---

## 🔥 Future Improvements

* 📊 Analytics dashboard
* 🔍 Search & filter sessions
* 🧠 Better AI accuracy tuning
* 🧾 Export reports (PDF)
* 🎯 Code highlighting (jump to error line)

---

## 👨‍💻 Author

**Kesani Santhosh Kumar**
🚀 Full Stack Developer

---

## ⭐ Support

If you like this project:

👉 Star ⭐ the repo
👉 Share it
👉 Use it

---

## 🔥 Final Note

This project is not just a demo — it’s a **production-ready full-stack system** that showcases:

✔ Real-time systems
✔ AI integration
✔ Database design
✔ Deployment skills

---

> 💡 *“Code smarter, not harder — let AI review your code.”*
