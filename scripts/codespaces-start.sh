#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="/tmp/chatbot-api.log"
PID_FILE="/tmp/chatbot-api.pid"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "[codespaces-start] Backend process already exists."
else
  (
    cd "$ROOT_DIR/backend"
    nohup npm start >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )
  echo "[codespaces-start] Backend startup requested; waiting for health before publishing URL."
fi

node "$ROOT_DIR/scripts/publish-codespaces-backend-url.mjs"
