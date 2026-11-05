# Unique Network BD & Hacking Helpline

A Bengali-first local-knowledge support chatbot. GitHub Pages hosts the static browser app; a separately hosted Express API stores optional logs in SQLite.

## Architecture

- **Frontend:** native HTML, CSS and modular ES6 JavaScript.
- **Knowledge engine:** local IDF-weighted keyword search over modular knowledge documents. It uses inverse-document-frequency weighting, phrase/keyword matching and a fallback response. It is TF-IDF-style, not a full conventional TF-IDF engine with term-frequency weighting.
- **Answer generation:** performed locally in the browser; no remote AI inference API is connected.
- **Browser persistence:** chat history and session ID in localStorage.
- **Backend:** Node.js, Express 5, modular routes/controllers/services/middleware and better-sqlite3.
- **Database:** SQLite WAL, foreign keys and versioned migrations. Production requires a persistent volume.
- **Deployment:** GitHub Actions publishes the static frontend only. GitHub Pages cannot run Node.js or persist SQLite.

## Nine frontend features

1. Category-aware quick replies
2. Typing indicator
3. Message copy and text export
4. Backend health status
5. Local knowledge autocomplete
6. Safe bold and HTTP(S) link formatting
7. Scroll-to-bottom control
8. Browser speech input via Web Speech API where supported
9. Browser text-to-speech via speechSynthesis where supported

Speech recognition requires browser API support and microphone permission. Bengali voice availability depends on the device/browser. Microphone audio is not uploaded to the backend.

## Local setup

Serve the repository root over HTTP for frontend use. To run the API:

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Run backend tests with `npm test` and migrations with `npm run migrate` from the `backend` directory.

## Frontend API configuration

After hosting the backend, edit `js/config.js`:

```js
window.UNBD_API_BASE_URL = "https://YOUR-BACKEND-HOST";
```

Use the HTTPS origin only; do not append `/api`. Never expose `ADMIN_API_KEY` in browser code. Backend `CORS_ORIGINS` must include the exact origin `https://uniquenetworkbd.github.io`.

## Production backend hosting checklist

1. Create a Node.js web service from this repository with root directory `backend`.
2. Install command: `npm install`; start command: `npm start`.
3. Attach a persistent disk/volume at a provider-supported mount path such as `/var/data`.
4. Set `DB_PATH=/var/data/database.sqlite`; do not store production SQLite on ephemeral application storage.
5. Set a random `ADMIN_API_KEY` with at least 32 bytes in the host's secret settings.
6. Set `NODE_ENV=production` and `CORS_ORIGINS=https://uniquenetworkbd.github.io`.
7. Keep `TRUST_PROXY=0` unless the host's proxy topology is confirmed and exactly configured.
8. Verify `GET /api/health` returns HTTP 200 with `database: "ok"`.
9. Set the API HTTPS origin in `js/config.js`, commit, and verify the Pages deployment and browser requests.

A provider's free tier may sleep, impose quotas, or charge for persistent disks. Confirm current terms; do not assume free persistent SQLite storage. Run one backend instance for this SQLite architecture.

## API routes

| Method | Route | Access |
|---|---|---|
| GET | `/api/health` | Public health, schema and storage metadata |
| POST | `/api/chat-logs` | Public validated, rate-limited, idempotent write |
| GET | `/api/chat-logs` | Bearer `ADMIN_API_KEY` |
| POST | `/api/interactions` | Public validated, rate-limited write |
| GET | `/api/interactions` | Bearer `ADMIN_API_KEY` |

## Extension modules

- **Network Tools:** `layout.html?page=tools` shows the local knowledge index, a guided ISP troubleshooting wizard, and backend network status. With `NETWORK_TARGETS_JSON=[]` the API clearly labels demo router/OLT and bandwidth values as simulated. When targets are configured, the API performs allowlisted TCP connect checks only; it does not claim ICMP ping, RouterOS login, OLT optical levels, or real throughput. Example target configuration is documented in `backend/.env.example`.
- **Troubleshooting wizard:** browser-only decision trees for slow internet, ONU LOS and billing mismatch. The wizard does not change router/ONU configuration or perform billing operations.
- **Admin Analytics:** `layout.html?page=analytics` requests `/api/admin/analytics` with `Authorization: Bearer ADMIN_API_KEY`; the key is typed by the operator and remains in page memory only. The API returns aggregate chat/session/interaction counts, categories, daily totals and fallback/unanswered messages. Never publish the key in frontend code.
- **Banglish synonyms:** `js/knowledge/synonyms.js` expands common Banglish/Bengali phrases into intent tokens before the existing local IDF-weighted search. It is deterministic and does not call an AI service.

## Offline/online sync

With the API origin configured, chat-log writes enter a bounded local retry queue and retry on network recovery and each 30-second health cycle. Client event IDs plus unique SQLite indexes prevent duplicate inserts after uncertain retries. Browser storage is best-effort, not a server backup. If the API origin is empty, local knowledge/history remain available and the status reports that the backend URL is not configured.

## Security and monitoring

Helmet, exact-origin CORS, a 16 KB JSON limit, allowlisted fields, bounded text, control-character rejection, API/IP/session rate limits, constant-time admin token comparison, structured request latency/status logs, SQLite quick-check/storage metadata and graceful WAL checkpoint on shutdown. Rate-limit state is in-memory and per process; do not horizontally scale this SQLite deployment.

## GitHub Pages

Workflow `.github/workflows/pages.yml` tests modules and knowledge search, stages only `index.html`, `layout.html`, `css/` and `js/`, uploads the Pages artifact and deploys it. In repository Settings → Pages select GitHub Actions. A successful build is not proof of successful deployment; inspect the deploy job and test the live URL.

## Project scope

Local knowledge assistant with optional logging API; not an AI inference service, billing system, customer account portal or authenticated support system.
