const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, scryptSync } = require("node:crypto");
const { migrate } = require("../database/migrations");

const username = "Raive";
const password = process.env.ADMIN_PASSWORD;
if (typeof password !== "string" || !/^[\\x21-\\x7E]{16}$/.test(password)) {
  throw new Error("ADMIN_PASSWORD is required and must be exactly 16 printable ASCII characters. Configure it as a Codespaces secret; no insecure default password is provided.");
}

const dbPath = path.resolve(
  process.env.DB_PATH || path.join(__dirname, "..", "data", "database.sqlite")
);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

try {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = FULL");
  migrate(db);

  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, {
    N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024
  });
  const passwordHash = [
    "scrypt", "16384", "8", "1", salt.toString("hex"), derived.toString("hex")
  ].join("$");

  const result = db.transaction(() => {
    db.prepare("DELETE FROM admins WHERE username COLLATE BINARY <> ?").run(username);
    const existing = db.prepare(
      "SELECT id FROM admins WHERE username = ? COLLATE NOCASE"
    ).get(username);
    db.prepare(`
      INSERT INTO admins (username, password_hash) VALUES (?, ?)
      ON CONFLICT(username) DO UPDATE SET
        username = excluded.username,
        password_hash = excluded.password_hash
    `).run(username, passwordHash);
    const admin = db.prepare(
      "SELECT id, username FROM admins WHERE username = ? COLLATE BINARY"
    ).get(username);
    if (!admin) throw new Error("Canonical Raive admin seed did not persist.");
    db.prepare("DELETE FROM admin_sessions").run();
    return { action: existing ? "updated" : "created", admin };
  })();

  console.log(JSON.stringify({
    action: result.action,
    username: result.admin.username,
    database: dbPath,
    passwordStoredAs: "salted scrypt hash",
    legacyAdminsRemoved: true,
    previousSessionsRevoked: true
  }));
} finally {
  db.close();
}
