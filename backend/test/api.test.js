const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

let child;
let baseUrl;
let tempDir;
const adminKey = "test-only-secret-key";

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}
async function waitForServer(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(url + "/api/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("API server did not become ready");
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "unbd-api-"));
  const port = await freePort();
  baseUrl = "http://127.0.0.1:" + port;
  child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DB_PATH: path.join(tempDir, "test.sqlite"), ADMIN_API_KEY: adminKey },
    stdio: "ignore"
  });
  await waitForServer(baseUrl);
});

after(() => {
  if (child && child.exitCode === null) child.kill("SIGTERM");
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test("health endpoint confirms SQLite is ready", async () => {
  const response = await fetch(baseUrl + "/api/health");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, "ok");
  assert.equal(data.database, "ok");
});

test("chat log POST persists and admin GET retrieves it", async () => {
  const payload = { sessionId: "test-session-01", userMessage: "ইন্টারনেট সংযোগ নেই", botResponse: "ONU ও রাউটার restart করুন", category: "internet" };
  const saved = await fetch(baseUrl + "/api/chat-logs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).saved, true);
  const denied = await fetch(baseUrl + "/api/chat-logs");
  assert.equal(denied.status, 401);
  const read = await fetch(baseUrl + "/api/chat-logs?sessionId=test-session-01", { headers: { authorization: "Bearer " + adminKey } });
  assert.equal(read.status, 200);
  const data = await read.json();
  assert.equal(data.count, 1);
  assert.equal(data.items[0].user_message, payload.userMessage);
});

test("interaction events persist and are protected on read", async () => {
  const saved = await fetch(baseUrl + "/api/interactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventType: "chat_submitted", sessionId: "test-session-01", details: { source: "api-test" } }) });
  assert.equal(saved.status, 201);
  const read = await fetch(baseUrl + "/api/interactions", { headers: { authorization: "Bearer " + adminKey } });
  assert.equal(read.status, 200);
  const data = await read.json();
  assert.equal(data.count, 1);
  assert.equal(data.items[0].event_type, "chat_submitted");
});

test("invalid payload is rejected", async () => {
  const response = await fetch(baseUrl + "/api/chat-logs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: "x", userMessage: "", botResponse: "answer" }) });
  assert.equal(response.status, 400);
});


test("GitHub Pages origin is allowed by CORS", async () => {
  const response = await fetch(baseUrl + "/api/chat-logs", {
    method: "OPTIONS",
    headers: {
      origin: "https://uniquenetworkbd.github.io",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type"
    }
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://uniquenetworkbd.github.io");
});

test("unapproved browser origin is rejected by CORS", async () => {
  const response = await fetch(baseUrl + "/api/chat-logs", {
    method: "OPTIONS",
    headers: {
      origin: "https://unapproved.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type"
    }
  });
  assert.equal(response.status, 403);
});
