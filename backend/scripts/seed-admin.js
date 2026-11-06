const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, scryptSync } = require("node:crypto");
const { migrate } = require("../database/migrations");

// Interim policy: accept any non-empty password up to the login API's 1024-byte limit.
// The password is supplied through the environment and is never embedded in source control.
const username = String(process.env.ADMIN_USERNAME || "Raive").trim();
const password = String(process.env.ADMIN_PASSWORD || "");

if (!/^[A-Za-z0-9._-]{3,80}$/.test(username)) {
  throw new Error("ADMIN_USERNAME must be 3–80 letters, digits, dot, underscore or hyphen.");
}
const passwordBytes = Buffer.byteLength(password, "utf8");
if (passwordBytes < 1 || passwordBytes > 1024) {
  throw new Error("ADMIN_PASSWORD must be between 1 and 1024 bytes.");
}

const dbPath = path.resolve(
  process.env.DB_PATH || path.join(__dirname, "..", "data", "database.sqlite")
);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

try {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  const passwordHash = [
    "scrypt",
    "16384",
    "8",
    "1",
    salt.toString("hex"),
    derived.toString("hex")
  ].join("$");

  const seedAdmin = db.transaction(() => {
    const existing = db
      .prepare("SELECT id FROM admins WHERE username = ? COLLATE NOCASE")
      .get(username);

    db.prepare(`
      INSERT INTO admins (username, password_hash)
      VALUES (?, ?)
      ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash
    `).run(username, passwordHash);

    const admin = db
      .prepare("SELECT id, username FROM admins WHERE username = ? COLLATE NOCASE")
      .get(username);

    // Password changes invalidate all active sessions for this admin.
    db.prepare("DELETE FROM admin_sessions WHERE admin_id = ?").run(admin.id);

    return { action: existing ? "updated" : "created", admin };
  });

  const result = seedAdmin();
  console.log(JSON.stringify({
    action: result.action,
    username: result.admin.username,
    database: dbPath,
    passwordStoredAs: "salted scrypt hash",
    previousSessionsRevoked: true
  }));
} finally {
  db.close();
}
