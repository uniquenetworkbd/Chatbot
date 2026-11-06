const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const Database = require("better-sqlite3");

const serverPath = path.join(__dirname, "..", "server.js");
const testPassword = "@#Raive@#";

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

function startServer(port, dbPath) {
  return spawn(process.execPath, [serverPath], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DB_PATH: dbPath,
      NODE_ENV: "test",
    },
    stdio: "inherit"
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise(resolve => child.once("exit", resolve));
}

test("startup bootstrap creates Raive, hashes password and revokes old sessions on restart", async () => {
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
      body: JSON.stringify({ username: "Raive", password: testPassword })
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();

    const inspect = new Database(dbPath);
    const admin = inspect.prepare(
      "SELECT id, username, password_hash FROM admins WHERE username = ?"
    ).get("Raive");
    assert.ok(admin);
    assert.equal(admin.username, "Raive");
    assert.ok(admin.password_hash.startsWith("scrypt$16384$8$1$"));
    assert.notEqual(admin.password_hash, testPassword);
    assert.equal(
      inspect.prepare("SELECT COUNT(*) AS count FROM admin_sessions WHERE admin_id = ?")
        .get(admin.id).count,
      1
    );
    inspect.close();

    await stopServer(child);
    child = null;

    child = startServer(port, dbPath);
    await waitForHealth(baseUrl, child);

    const oldSession = await fetch(baseUrl + "/api/auth/session", {
      headers: { authorization: "Bearer " + login.token }
    });
    assert.equal(oldSession.status, 401);

    const secondLogin = await fetch(baseUrl + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Raive", password: testPassword })
    });
    assert.equal(secondLogin.status, 200);
  } finally {
    await stopServer(child);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
