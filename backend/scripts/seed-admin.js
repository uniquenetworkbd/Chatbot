const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, scryptSync } = require("node:crypto");
const { migrate } = require("../database/migrations");

const username = String(process.env.ADMIN_USERNAME || "").trim();
const password = String(process.env.ADMIN_PASSWORD || "");
if (!/^[A-Za-z0-9._-]{3,80}$/.test(username)) throw new Error("Set ADMIN_USERNAME (3–80 letters, digits, dot, underscore or hyphen).");
if (Buffer.byteLength(password, "utf8") < 14 || Buffer.byteLength(password, "utf8") > 1024) throw new Error("ADMIN_PASSWORD must be 14–1024 bytes.");
const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, "..", "data", "database.sqlite"));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
try {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const hash = ["scrypt", "16384", "8", "1", salt.toString("hex"), derived.toString("hex")].join("$");
  const insert = db.prepare("INSERT INTO admins(username, password_hash) VALUES(?,?)");
  insert.run(username, hash);
  console.log(JSON.stringify({ created: true, username, database: dbPath, passwordStoredAs: "scrypt hash" }));
} catch (error) {
  if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) {
    console.error("Admin account already exists or username conflicts; no password was changed.");
  }
  throw error;
} finally { db.close(); }
