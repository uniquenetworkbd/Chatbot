#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_LOG="/tmp/chatbot-api.log"
BACKEND_PID="/tmp/chatbot-api.pid"
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
DB_PATH="${ROOT_DIR}/backend/data/database.sqlite"
REPOSITORY="${GITHUB_REPOSITORY:-uniquenetworkbd/Chatbot}"
CODESPACE="${CODESPACE_NAME:-}"
DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
API_BASE="https://${CODESPACE}-${PORT}.${DOMAIN}"

export PORT HOST DB_PATH

fail() {
  printf '[auto-publish] ERROR: %s\n' "$*" >&2
  if [[ -f "$BACKEND_LOG" ]]; then
    printf '%s\n' '--- backend log (last 60 lines) ---' >&2
    tail -n 60 "$BACKEND_LOG" >&2 || true
  fi
  exit 1
}

[[ "$PORT" == "3000" ]] || fail "This Codespaces publisher is configured for port 3000; received PORT=$PORT."
[[ -n "$CODESPACE" ]] || fail 'CODESPACE_NAME is missing; this script must run inside GitHub Codespaces.'
[[ "$CODESPACE" =~ ^[a-zA-Z0-9-]+$ ]] || fail 'CODESPACE_NAME contains unsupported characters.'
[[ "$DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]] || fail 'Invalid GitHub Codespaces forwarding domain.'
[[ "$REPOSITORY" == "uniquenetworkbd/Chatbot" ]] || fail "Unexpected repository: $REPOSITORY."

cd "$ROOT_DIR"
mkdir -p "$ROOT_DIR/backend/data"

# Install runtime dependencies on every Codespaces start; no package-lock is currently committed.
echo '[auto-publish] Installing backend dependencies...'
npm --prefix "$ROOT_DIR/backend" install --no-audit --no-fund

# Reuse an existing process only when both health and the new conversation route are present.
HEALTH_URL="${API_BASE}/api/health"
CONVERSATIONS_URL="${API_BASE}/api/conversations"
export HEALTH_URL CONVERSATIONS_URL
health_ok=0
route_ok=0
if node -e 'fetch(process.env.HEALTH_URL,{signal:AbortSignal.timeout(3000),cache:"no-store"}).then(async r=>{const j=await r.json();process.exit(r.ok&&j.status==="ok"&&j.database==="ok"?0:1)}).catch(()=>process.exit(1)' >/dev/null 2>&1; then
  health_ok=1
  route_status="$(node -e 'fetch(process.env.CONVERSATIONS_URL,{signal:AbortSignal.timeout(3000),cache:"no-store"}).then(r=>{console.log(r.status)}).catch(()=>console.log("000"))')"
  [[ "$route_status" == "401" ]] && route_ok=1
fi
if [[ "$health_ok" != "1" || "$route_ok" != "1" ]]; then
  if [[ -f "$BACKEND_PID" ]] && kill -0 "$(cat "$BACKEND_PID")" 2>/dev/null; then
    echo '[auto-publish] Existing backend is stale or unhealthy; restarting it for the current checkout...'
    kill "$(cat "$BACKEND_PID")" || true
    for attempt in $(seq 1 20); do
      kill -0 "$(cat "$BACKEND_PID")" 2>/dev/null || break
      sleep 1
    done
  fi
  echo '[auto-publish] Starting backend server in background...'
  nohup node "$ROOT_DIR/backend/server.js" >>"$BACKEND_LOG" 2>&1 </dev/null &
  echo "$!" >"$BACKEND_PID"
fi

healthy=0
for attempt in $(seq 1 60); do
  if node -e 'fetch(process.env.HEALTH_URL,{signal:AbortSignal.timeout(3500),cache:"no-store"}).then(async r=>{const j=await r.json();process.exit(r.ok&&j.status==="ok"&&j.database==="ok"?0:1)}).catch(()=>process.exit(1))' >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done
[[ "$healthy" == "1" ]] || fail 'Backend did not pass /api/health within 120 seconds. backend-url.json was not changed.'

# Codespaces supplies GITHUB_TOKEN with permissions from devcontainer.json.
# gh auth token is a safe fallback when the environment variable is not exported.
PUBLISH_TOKEN="${GITHUB_TOKEN:-}"
if [[ -z "$PUBLISH_TOKEN" ]] && command -v gh >/dev/null 2>&1; then
  PUBLISH_TOKEN="$(gh auth token 2>/dev/null || true)"
fi
[[ -n "$PUBLISH_TOKEN" ]] || fail 'No GitHub token available. Ensure Codespaces repository permission contents: write is granted.'
export PUBLISH_TOKEN REPOSITORY API_BASE

node --input-type=module <<'NODE'
const token = process.env.PUBLISH_TOKEN;
const repository = process.env.REPOSITORY;
const apiBase = process.env.API_BASE;
const apiRoot = process.env.GITHUB_API_URL || "https://api.github.com";
const endpoint = `${apiRoot}/repos/${repository}/contents/backend-url.json`;
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json"
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `GitHub API HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

let published = false;
for (let attempt = 1; attempt <= 4 && !published; attempt += 1) {
  let existing = null;
  try {
    existing = await request(`${endpoint}?ref=main`);
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const now = new Date();
  const manifest = {
    schemaVersion: 1,
    status: "active",
    url: apiBase,
    port: 3000,
    codespace: process.env.CODESPACE_NAME,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  const payload = {
    message: "chore: publish healthy Codespaces backend URL",
    content: Buffer.from(JSON.stringify(manifest, null, 2) + "\n").toString("base64"),
    branch: "main"
  };
  if (existing?.sha) payload.sha = existing.sha;

  try {
    const result = await request(endpoint, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    console.log(`[auto-publish] Published healthy backend URL to ${repository}/backend-url.json on main (commit ${result.commit?.sha || "created"}).`);
    published = true;
  } catch (error) {
    if (error.status !== 409 || attempt === 4) throw error;
    console.warn(`[auto-publish] Manifest changed concurrently; retrying (${attempt}/4).`);
  }
}
if (!published) throw new Error("Backend URL publication did not complete.");
NODE

echo "[auto-publish] COMPLETE: ${API_BASE} is healthy and published to main."
