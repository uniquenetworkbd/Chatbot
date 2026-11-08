const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const Database = require("better-sqlite3");

const serverPath = path.join(__dirname, "..", "server.js");
const testUsername = "Raive";
const testPassword = "boot-test-123456";

function getPort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Server exited before becoming healthy.");
    try {
      const response = await fetch(baseUrl + "/api/health");
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Server did not become healthy.");
}

function startServer(port, dbPath, password = testPassword) {
  return spawn(process.execPath, [serverPath], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DB_PATH: dbPath,
      NODE_ENV: "test",
      ADMIN_PASSWORD: password,
      TRUST_PROXY: "0"
    },
    stdio: "inherit"
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise(resolve => child.once("exit", resolve));
}

test("startup bootstrap is idempotent and preserves sessions unless credentials rotate", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "unbd-bootstrap-"));
  const dbPath = path.join(directory, "bootstrap.sqlite");
  const port = await getPort();
  const baseUrl = "http://127.0.0.1:" + port;
  let child;

  try {
    child = startServer(port, dbPath);
    await waitForHealth(baseUrl, child);

    const loginResponse = await fetch(baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: testPassword })
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();

    // The backend owns the fixed identity; a client-supplied username is ignored.
    const usernameSpoofAttempt = await fetch(baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "not-Raive", password: testPassword })
    });
    assert.equal(usernameSpoofAttempt.status, 200);

    let inspect = new Database(dbPath);
    const admin = inspect.prepare(
      "SELECT id, username, password_hash FROM admins WHERE username = ?"
    ).get(testUsername);
    assert.ok(admin);
    assert.equal(admin.username, testUsername);
    assert.ok(admin.password_hash.startsWith("scrypt$16384$8$1$"));
    assert.notEqual(admin.password_hash, testPassword);
    assert.equal(inspect.prepare("SELECT COUNT(*) AS count FROM admins").get().count, 1);
    assert.equal(inspect.prepare("SELECT COUNT(*) AS count FROM admin_sessions WHERE admin_id = ?").get(admin.id).count, 1);
    inspect.close();

    await stopServer(child);
    child = null;
    child = startServer(port, dbPath);
    await waitForHealth(baseUrl, child);

    const retainedSession = await fetch(baseUrl + "/api/auth/session", {
      headers: { authorization: "Bearer " + login.token }
    });
    assert.equal(retainedSession.status, 200);

    await stopServer(child);
    child = null;
    child = startServer(port, dbPath, "rotated-test-password-123");
    await waitForHealth(baseUrl, child);

    const revokedSession = await fetch(baseUrl + "/api/auth/session", {
      headers: { authorization: "Bearer " + login.token }
    });
    assert.equal(revokedSession.status, 401);

    const oldPassword = await fetch(baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: testUsername, password: testPassword })
    });
    assert.equal(oldPassword.status, 401);

    const newPassword = await fetch(baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "rotated-test-password-123" })
    });
    assert.equal(newPassword.status, 200);
  } finally {
    await stopServer(child);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test("startup fails closed when ADMIN_PASSWORD is missing", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "unbd-no-secret-"));
  const dbPath = path.join(directory, "no-secret.sqlite");
  const port = await getPort();
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DB_PATH: dbPath,
    NODE_ENV: "test",
    TRUST_PROXY: "0"
  };
  delete env.ADMIN_PASSWORD;
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.join(__dirname, ".."),
    env,
    stdio: "ignore"
  });
  try {
    const exit = await Promise.race([
      new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal }))),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Server did not fail closed without ADMIN_PASSWORD.")), 5000))
    ]);
    assert.notEqual(exit.code, 0);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
