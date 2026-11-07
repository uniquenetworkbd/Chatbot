const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("node:path");

const { openDatabase } = require("./database/connection");
const { bootstrapAdmin } = require("./services/admin-bootstrap");
const { createLogServices } = require("./services/log-services");
const { requestLogger, errors } = require("./middleware/security");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const allowedOrigins = (process.env.CORS_ORIGINS ||
  "https://uniquenetworkbd.github.io,http://localhost:3000,http://127.0.0.1:3000")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const dbPath = process.env.DB_PATH || path.join(__dirname, "data", "database.sqlite");
const database = openDatabase(dbPath);

// Credential bootstrap is mandatory and completes before the HTTP listener opens.
// Credentials are supplied only by the backend runtime secret store.
bootstrapAdmin(database.db);
const logs = createLogServices(database.db);
const dependencies = { ...database, logs };
const app = express();
app.locals.db = database.db;

app.disable("x-powered-by");
const trustProxy = process.env.TRUST_PROXY || "0";
if (trustProxy !== "0" && trustProxy !== "1") {
  throw new Error("TRUST_PROXY must be 0 or 1; configure it only after confirming the proxy topology.");
}
app.set("trust proxy", trustProxy === "1" ? 1 : false);

app.use(requestLogger);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600
}));
app.use(express.json({ limit: "16kb", strict: true }));

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many API requests; retry later." }
});
const writeIpLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Write rate limit reached for this IP; retry later." }
});
const writeSessionLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  keyGenerator(req) {
    const ipKey = req.ip || req.socket.remoteAddress || "unknown-ip";
    const sessionKey = typeof req.body?.sessionId === "string"
      ? req.body.sessionId.slice(0, 100)
      : "anonymous";
    return ipKey + ":" + sessionKey;
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Write rate limit reached for this session; retry later." }
});

app.use("/api/", apiLimiter);
app.post("/api/chat-logs", writeIpLimiter, writeSessionLimiter);
app.post("/api/interactions", writeIpLimiter, writeSessionLimiter);

app.use("/api/auth", require("./routes/auth")(dependencies));
app.use("/api/health", require("./routes/health")(dependencies));
app.use("/api/chat-logs", require("./routes/chat-logs")(dependencies));
app.use("/api/interactions", require("./routes/interactions")(dependencies));
app.use("/api/network", require("./routes/network")());
app.use("/api/admin/analytics", require("./routes/admin-analytics")(dependencies));

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use(errors);

const server = app.listen(PORT, HOST, () => {
  console.log(JSON.stringify({
    level: "info",
    event: "server_started",
    host: HOST,
    port: PORT,
    dbPath: database.dbPath,
    schemaVersion: database.migrations.at(-1)?.version || 0,
    timestamp: new Date().toISOString()
  }));
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(JSON.stringify({ level: "info", event: "shutdown", signal }));
  server.close(() => {
    try {
      database.db.pragma("wal_checkpoint(TRUNCATE)");
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "wal_checkpoint_failed", message: error.message }));
    }
    database.db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = { app, db: database.db, server, bootstrapAdmin };
