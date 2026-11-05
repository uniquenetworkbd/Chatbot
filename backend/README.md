# Unique Network BD Chatbot API

Express + SQLite backend. The database is created automatically at first startup at `backend/data/database.sqlite`; it is intentionally excluded from Git because it is a runtime data file.

## Run in GitHub Codespaces

```bash
cd backend
npm install
cp .env.example .env
# Set ADMIN_API_KEY to a long random secret in .env
npm start
```

Codespaces forwards port 3000. Keep the API private in Codespaces unless you intentionally change the port visibility. Set `CORS_ORIGINS` to the exact frontend origin(s) that should call the API.

## API

- `GET /api/health` — database health.
- `POST /api/chat-logs` — save `{ "sessionId", "userMessage", "botResponse", "category?" }`.
- `GET /api/chat-logs?limit=50&sessionId=...` — retrieve logs; requires `Authorization: Bearer ADMIN_API_KEY`.
- `POST /api/interactions` — save `{ "eventType", "sessionId?", "details?" }`.
- `GET /api/interactions?limit=50` — retrieve interaction logs; requires admin bearer key.

Public write endpoints are rate-limited and validate payload sizes. Read endpoints require an admin key. Do not put the admin key in browser JavaScript or commit real secrets. Use Codespaces Secrets or environment variables.

## Tests

```bash
npm install
npm test
```

## GitHub Pages frontend bridge

The browser client posts each locally generated user/assistant exchange to `POST /api/chat-logs` and checks `GET /api/health`. The bridge is best-effort: local knowledge search and localStorage history continue to work when the API is unavailable.

When the API is hosted at a separate public origin, set `window.UNBD_API_BASE_URL` to that HTTPS origin before loading `js/app.js`. Configure `CORS_ORIGINS` with the exact frontend origin `https://uniquenetworkbd.github.io` plus any explicitly trusted development origins. Never expose `ADMIN_API_KEY` in frontend code. GitHub Pages serves static assets only; deploy this Node.js API to a separate Node-capable host with persistent disk storage for SQLite.
