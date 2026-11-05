# Unique Network BD & Hacking Helpline

A Bengali-first local-knowledge support chatbot. GitHub Pages hosts the static browser app; a separately hosted Express API stores optional logs in SQLite.

## Architecture
- Frontend: native HTML, CSS and ES modules.
- Knowledge engine: local IDF-weighted keyword search over modular documents. Answers are generated in the browser; no hosted AI inference is connected.
- Browser persistence: chat history and session ID in localStorage.
- Backend: Node.js 22, Express 5, modular database/routes/controllers/services/middleware and better-sqlite3.
- Database: SQLite WAL, foreign keys and versioned migrations; production requires a persistent volume.
- Deployment: GitHub Actions publishes frontend only. GitHub Pages cannot run Node.js or persist SQLite.

## Nine frontend features
1. Category-aware quick replies
2. Typing indicator
3. Message copy and text export
4. Backend health status
5. Local knowledge autocomplete
6. Safe bold and HTTP(S) link formatting
7. Scroll-to-bottom control
8. Browser speech input (Web Speech API where supported)
9. Browser text-to-speech (speechSynthesis where supported)

Speech support, microphone permission and Bengali voice availability depend on browser/device. Audio is not uploaded to the API.

## Local setup
Serve the repository root over HTTP for frontend use. For backend: change to backend directory, run npm install, copy .env.example to .env, then npm start. Run tests with npm test and migrations with npm run migrate from the backend directory.

## Frontend API configuration
After hosting the backend, edit js/config.js and set window.UNBD_API_BASE_URL to the public HTTPS API origin, for example https://your-service.onrender.com. Do not append /api. Never expose ADMIN_API_KEY in browser code. Backend CORS_ORIGINS must include the exact origin https://uniquenetworkbd.github.io.

## Production backend hosting
1. Create a Node web service from this repository with root directory backend.
2. Install command npm install; start command npm start.
3. Attach a persistent disk/volume at a provider-supported mount path such as /var/data.
4. Set DB_PATH=/var/data/database.sqlite; do not store production SQLite on ephemeral application storage.
5. Set ADMIN_API_KEY as a strong secret in host environment settings.
6. Set CORS_ORIGINS=https://uniquenetworkbd.github.io and NODE_ENV=production. Set TRUST_PROXY=1 only behind one trusted reverse proxy.
7. Verify GET /api/health returns HTTP 200 and database status ok.
8. Put the API HTTPS origin into js/config.js, commit and verify Pages deployment.

A provider free tier can sleep, impose quotas or charge for persistent disks. Confirm current terms; do not assume free persistent SQLite storage. A single backend instance is required for this SQLite design.

## API
| Method | Route | Access |
|---|---|---|
| GET | /api/health | Public health, schema and disk status |
| POST | /api/chat-logs | Public validated, rate-limited, idempotent write |
| GET | /api/chat-logs | Bearer ADMIN_API_KEY |
| POST | /api/interactions | Public validated, rate-limited write |
| GET | /api/interactions | Bearer ADMIN_API_KEY |

## Offline/online sync
With API origin configured, chat log writes enter a bounded local retry queue and retry on network recovery and each 30-second health cycle. Client event IDs plus unique SQLite indexes prevent duplicate inserts after uncertain retries. Browser storage is best-effort, not server backup. If API origin is empty, local knowledge/history remain available and status reports URL not configured.

## Security and monitoring
Helmet, exact-origin CORS, 16 KB JSON limit, allowlisted fields, bounded text, control-character rejection, general API and stricter write rate limits, constant-time admin token comparison, structured request latency/status logs, SQLite quick-check/disk metrics and graceful WAL checkpoint on shutdown. Rate-limit state is in-memory and per process; do not horizontally scale this SQLite deployment.

## GitHub Pages
Workflow .github/workflows/pages.yml tests modules and knowledge search, stages only index.html, layout.html, css and js, uploads the Pages artifact and deploys. In Settings → Pages select GitHub Actions. Successful build is not proof of successful live deployment; inspect the deploy job and live URL.

## Scope
Local knowledge assistant with optional logging API; not an AI inference service, billing system, customer account portal or authenticated support system.
