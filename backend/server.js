const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, "data", "database.sqlite"));
const MAX_TEXT = 8000;
const app = express();

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    user_message TEXT NOT NULL,
    bot_response TEXT NOT NULL,
    category TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_chat_logs_session_created ON chat_logs(session_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS interaction_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    session_id TEXT,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_interaction_logs_created ON interaction_logs(created_at DESC);
`);

const allowedOrigins = (process.env.CORS_ORIGINS || "https://uniquenetworkbd.github.io,http://localhost:3000,http://127.0.0.1:3000")
  .split(",").map((value) => value.trim()).filter(Boolean);
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "32kb", strict: true }));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));

const cleanText = (value, field, max = MAX_TEXT) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    const error = new Error(field + " must be a non-empty string of at most " + max + " characters");
    error.status = 400;
    throw error;
  }
  return value.trim();
};
const optionalText = (value, field, max = 120) => {
  if (value == null || value === "") return null;
  return cleanText(value, field, max);
};
const requireAdmin = (req, res, next) => {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return res.status(503).json({ error: "Admin API is disabled; configure ADMIN_API_KEY." });
  const supplied = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (supplied.length !== expected.length || !require("node:crypto").timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

app.get("/api/health", (_req, res) => {
  const result = db.prepare("PRAGMA quick_check").get();
  res.json({ status: result.quick_check === "ok" ? "ok" : "degraded", database: result.quick_check, timestamp: new Date().toISOString() });
});

app.post("/api/chat-logs", (req, res, next) => {
  try {
    const sessionId = cleanText(req.body.sessionId, "sessionId", 100);
    const userMessage = cleanText(req.body.userMessage, "userMessage");
    const botResponse = cleanText(req.body.botResponse, "botResponse");
    const category = optionalText(req.body.category, "category", 80);
    const result = db.prepare("INSERT INTO chat_logs (session_id,user_message,bot_response,category) VALUES (?,?,?,?)")
      .run(sessionId, userMessage, botResponse, category);
    res.status(201).json({ id: Number(result.lastInsertRowid), saved: true });
  } catch (error) { next(error); }
});

app.get("/api/chat-logs", requireAdmin, (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
  const sessionId = req.query.sessionId ? cleanText(req.query.sessionId, "sessionId", 100) : null;
  const rows = sessionId
    ? db.prepare("SELECT * FROM chat_logs WHERE session_id = ? ORDER BY id DESC LIMIT ?").all(sessionId, limit)
    : db.prepare("SELECT * FROM chat_logs ORDER BY id DESC LIMIT ?").all(limit);
  res.json({ count: rows.length, items: rows });
});

app.post("/api/interactions", (req, res, next) => {
  try {
    const eventType = cleanText(req.body.eventType, "eventType", 80);
    const sessionId = optionalText(req.body.sessionId, "sessionId", 100);
    const details = req.body.details == null ? {} : req.body.details;
    if (typeof details !== "object" || Array.isArray(details)) return res.status(400).json({ error: "details must be a JSON object" });
    const serialized = JSON.stringify(details);
    if (serialized.length > 4000) return res.status(400).json({ error: "details exceeds 4000 characters" });
    const result = db.prepare("INSERT INTO interaction_logs (event_type,session_id,details) VALUES (?,?,?)")
      .run(eventType, sessionId, serialized);
    res.status(201).json({ id: Number(result.lastInsertRowid), saved: true });
  } catch (error) { next(error); }
});

app.get("/api/interactions", requireAdmin, (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
  const rows = db.prepare("SELECT * FROM interaction_logs ORDER BY id DESC LIMIT ?").all(limit);
  res.json({ count: rows.length, items: rows });
});

app.use((error, _req, res, _next) => {
  if (error.message === "Origin not allowed by CORS") return res.status(403).json({ error: "Origin not allowed" });
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status === 500 ? "Internal server error" : error.message });
});

const server = app.listen(PORT, HOST, () => {
  console.log("Unique Network BD API listening on http://" + HOST + ":" + PORT);
  console.log("SQLite database: " + DB_PATH);
});
function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

module.exports = { app, db, server };
