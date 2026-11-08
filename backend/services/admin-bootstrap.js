const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");

const ADMIN_USERNAME = "Raive";
const SCRYPT = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 1024;

function readAdminCredentials(env = process.env) {
  const password = env.ADMIN_PASSWORD;
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("ADMIN_PASSWORD is required and must contain 12-1024 characters. Configure it in the backend runtime secret store.");
  }
  return { username: ADMIN_USERNAME, password };
}

function encodePassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, SCRYPT);
  return ["scrypt", "16384", "8", "1", salt.toString("hex"), derived.toString("hex")].join("$");
}

function verifyStoredPassword(password, encoded) {
  if (typeof encoded !== "string") return false;
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, hashHex] = parts;
  if (![n, r, p].every(value => /^\d+$/.test(value)) ||
      !/^[a-f0-9]{32}$/.test(saltHex) || !/^[a-f0-9]{128}$/.test(hashHex)) return false;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isSafeInteger(params.N) || !Number.isSafeInteger(params.r) || !Number.isSafeInteger(params.p) ||
      params.N < 2 || params.N > 262144 || params.r < 1 || params.r > 32 || params.p < 1 || params.p > 16) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, { ...params, maxmem: SCRYPT.maxmem });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function bootstrapAdmin(db, env = process.env) {
  const { username, password } = readAdminCredentials(env);
  const result = db.transaction(() => {
    const existing = db.prepare("SELECT id, username, password_hash FROM admins WHERE username = ? COLLATE NOCASE").get(ADMIN_USERNAME);
    let adminId;
    let action;
    let sessionsRevoked = false;

    if (!existing) {
      const inserted = db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(username, encodePassword(password));
      adminId = inserted.lastInsertRowid;
      action = "created";
    } else {
      adminId = existing.id;
      if (existing.username !== username) {
        db.prepare("UPDATE admins SET username = ? WHERE id = ?").run(username, adminId);
      }
      const passwordUnchanged = verifyStoredPassword(password, existing.password_hash);
      if (passwordUnchanged) {
        action = "unchanged";
      } else {
        db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(encodePassword(password), adminId);
        db.prepare("DELETE FROM admin_sessions WHERE admin_id = ?").run(adminId);
        sessionsRevoked = true;
        action = "password_rotated";
      }
    }

    // Exactly one administrator identity is supported; its username is fixed in backend code.
    const removed = db.prepare("DELETE FROM admins WHERE id <> ?").run(adminId).changes;
    if (removed > 0) sessionsRevoked = true;

    const admin = db.prepare("SELECT id, username FROM admins WHERE id = ?").get(adminId);
    if (!admin || admin.username !== ADMIN_USERNAME) throw new Error("Admin bootstrap did not persist the fixed administrator identity.");
    return { action, admin: { id: admin.id }, sessionsRevoked, legacyAdminsRemoved: removed };
  })();

  console.log(JSON.stringify({
    level: "info",
    event: "admin_auto_bootstrap_completed",
    action: result.action,
    administrator: "fixed",
    passwordStoredAs: "salted scrypt hash",
    sessionsRevoked: result.sessionsRevoked,
    legacyAdminsRemoved: result.legacyAdminsRemoved
  }));
  return result;
}

module.exports = { ADMIN_USERNAME, bootstrapAdmin, readAdminCredentials };
