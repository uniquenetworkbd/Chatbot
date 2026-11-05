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
