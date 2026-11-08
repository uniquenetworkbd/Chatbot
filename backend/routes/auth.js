const express = require("express");
const rateLimit = require("express-rate-limit");
const { randomBytes, createHash, scrypt: scryptCallback, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(scryptCallback);
const { ADMIN_USERNAME } = require("../services/admin-bootstrap");
const { requireAdmin } = require("../middleware/security");

const router = express.Router();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." }
});
const tokenHash = token => createHash("sha256").update(token, "utf8").digest("hex");
function parseHash(value) {
  if (typeof value !== "string") return null;
  const parts = value.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, n, r, p, salt, hash] = parts;
  if (!/^\d+$/.test(n) || !/^\d+$/.test(r) || !/^\d+$/.test(p) || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return null;
  const params = { n: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isSafeInteger(params.n) || !Number.isSafeInteger(params.r) || !Number.isSafeInteger(params.p) ||
      params.n < 2 || params.n > 262144 || params.r < 1 || params.r > 32 || params.p < 1 || params.p > 16) return null;
  return { ...params, salt, hash };
}
async function verifyPassword(password, encoded) {
  const parsed = parseHash(encoded);
  if (!parsed) return false;
  const derived = await scrypt(password, Buffer.from(parsed.salt, "hex"), 64, { N: parsed.n, r: parsed.r, p: parsed.p, maxmem: 64 * 1024 * 1024 });
  const expected = Buffer.from(parsed.hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
module.exports = ({ db }) => {
  router.post("/login", loginLimiter, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      const { password } = req.body || {};
      if (typeof password !== "string" || password.length < 1 || password.length > 1024) {
        return res.status(400).json({ error: "Password is required." });
      }
      const admin = db.prepare("SELECT id, password_hash FROM admins WHERE username = ? COLLATE BINARY").get(ADMIN_USERNAME);
      const valid = admin ? await verifyPassword(password, admin.password_hash) : false;
      if (!valid) return res.status(401).json({ error: "Invalid password." });

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(new Date().toISOString());
      db.prepare("INSERT INTO admin_sessions(admin_id, token_hash, expires_at) VALUES(?,?,?)")
        .run(admin.id, tokenHash(token), expiresAt);
      return res.status(200).json({ token, tokenType: "Bearer", expiresAt, admin: { id: admin.id } });
    } catch (error) { return next(error); }
  });

  router.get("/session", requireAdmin, (req, res) => {
    res.set("Cache-Control", "no-store").json({ authenticated: true, admin: { id: req.admin.id }, expiresAt: req.admin.expiresAt });
  });

  router.post("/logout", requireAdmin, (req, res) => {
    const token = /^Bearer ([A-Za-z0-9_-]{40,})$/.exec(req.get("authorization") || "")?.[1];
    if (token) db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash(token));
    res.set("Cache-Control", "no-store").json({ success: true });
  });
  return router;
};
