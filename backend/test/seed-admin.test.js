const { test } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { spawnSync } = require("node:child_process");
const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { migrate } = require("../database/migrations");

const script = path.join(__dirname, "..", "scripts", "seed-admin.js");
const username = "Raive";
// Deliberately short test fixture; never place real administrator credentials in source.
const testPassword = "tiny-test";

function createDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "unbd-admin-seed-"));
  const dbPath = path.join(directory, "seed.sqlite");
  const db = new Database(dbPath);
  migrate(db);
  return { directory, dbPath, db };
}

function runSeed(dbPath, password = testPassword) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, DB_PATH: dbPath, ADMIN_USERNAME: username, ADMIN_PASSWORD: password }
  });
}

function passwordMatches(password, encoded) {
  const parts = encoded.split("$");
  assert.equal(parts.length, 6);
  assert.equal(parts[0], "scrypt");
  const [, n, r, p, salt, expectedHex] = parts;
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 64, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024
  });
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

test("seed creates an interim short-password admin with salted scrypt", () => {
  const { directory, dbPath, db } = createDatabase();
  try {
    db.close();
    const result = runSeed(dbPath);
    assert.equal(result.status, 0, result.stderr);
    const check = new Database(dbPath);
    const admin = check.prepare("SELECT id, username, password_hash FROM admins WHERE username = ?").get(username);
    assert.ok(admin);
    assert.equal(admin.username, username);
    assert.ok(admin.password_hash.startsWith("scrypt$16384$8$1$"));
    assert.equal(passwordMatches(testPassword, admin.password_hash), true);
    assert.notEqual(admin.password_hash, testPassword);
    check.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("seed updates existing admin hash and revokes old sessions", () => {
  const { directory, dbPath, db } = createDatabase();
  try {
    const salt = randomBytes(16);
    const oldHash = ["scrypt", "16384", "8", "1", salt.toString("hex"),
      scryptSync("previous-password", salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")
    ].join("$");
    const adminId = db.prepare("INSERT INTO admins(username,password_hash) VALUES(?,?)").run(username, oldHash).lastInsertRowid;
    db.prepare("INSERT INTO admin_sessions(admin_id,token_hash,expires_at) VALUES(?,?,?)")
      .run(adminId, "a".repeat(64), new Date(Date.now() + 3600000).toISOString());
    db.close();

    const result = runSeed(dbPath);
    assert.equal(result.status, 0, result.stderr);
    const check = new Database(dbPath);
    const admin = check.prepare("SELECT id, password_hash FROM admins WHERE username = ?").get(username);
    assert.equal(admin.id, adminId);
    assert.notEqual(admin.password_hash, oldHash);
    assert.equal(passwordMatches(testPassword, admin.password_hash), true);
    assert.equal(check.prepare("SELECT COUNT(*) AS count FROM admin_sessions WHERE admin_id = ?").get(adminId).count, 0);
    check.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
