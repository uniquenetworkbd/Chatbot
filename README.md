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

Use the HTTPS origin only; do not append `/api`. Never expose admin passwords or bearer session tokens in browser code. Backend `CORS_ORIGINS` must include the exact origin `https://uniquenetworkbd.github.io`.

## Production backend hosting checklist

1. Create a Node.js web service from this repository with root directory `backend`.
2. Install command: `npm install`; start command: `npm start`.
3. Attach a persistent disk/volume at a provider-supported mount path such as `/var/data`.
4. Set `DB_PATH=/var/data/database.sqlite`; do not store production SQLite on ephemeral application storage.
5. After the backend is running, create the first admin from the backend shell using `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `npm run seed:admin` (password minimum 14 bytes).
6. Set `NODE_ENV=production` and `CORS_ORIGINS=https://uniquenetworkbd.github.io`.
7. Keep `TRUST_PROXY=0` unless the host's proxy topology is confirmed and exactly configured.
8. Verify `GET /api/health` returns HTTP 200 with `database: "ok"`.
9. Set the API HTTPS origin in `js/config.js`, commit, and verify the Pages deployment and browser requests.

A provider's free tier may sleep, impose quotas, or charge for persistent disks. Confirm current terms; do not assume free persistent SQLite storage. Run one backend instance for this SQLite architecture.

## Secure administrator access

The application displays an admin login gate before initializing chat, tools, analytics or configuration views. The backend stores admin passwords only as salted scrypt hashes (`admins.password_hash`), issues random 8-hour bearer sessions, stores only SHA-256 token hashes in SQLite, and revokes sessions on logout. First-admin creation is an explicit operator action: `cd backend`, export `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the shell, then run `npm run seed:admin`. The seed script requires a password of at least 14 bytes and never prints it. `sessionStorage` contains only the bearer token, not the password. All protected API reads/writes and network probes require a valid session.

**Hosting boundary:** GitHub Pages is static hosting. The JavaScript login gate controls the rendered UI but cannot make static HTML/JS files private or prevent a determined visitor from downloading them. Backend data and operations are server-enforced behind session authentication. If the requirement is to hide the actual static page assets from unauthenticated HTTP clients, serve the frontend through the authenticated Express host (or a server-side access gateway) instead of public GitHub Pages.

## API routes

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/login` | Public, rate-limited login; issues bearer session |
| GET | `/api/auth/session` | Authenticated session check |
| POST | `/api/auth/logout` | Authenticated logout and token revocation |
| GET | `/api/health` | Public health, schema and storage metadata |
| POST | `/api/chat-logs` | Authenticated, validated, rate-limited, idempotent write |
| GET | `/api/chat-logs` | Authenticated admin session |
| POST | `/api/interactions` | Authenticated, validated, rate-limited write |
| GET | `/api/interactions` | Authenticated admin session |

## Extension modules

- **Network Tools:** `layout.html?page=tools` shows the local knowledge index, a guided ISP troubleshooting wizard, and backend network status. With `NETWORK_TARGETS_JSON=[]` the API clearly labels demo router/OLT and bandwidth values as simulated. When targets are configured, the API performs allowlisted TCP connect checks only; it does not claim ICMP ping, RouterOS login, OLT optical levels, or real throughput. Example target configuration is documented in `backend/.env.example`.
- **Troubleshooting wizard:** browser-only decision trees for slow internet, ONU LOS and billing mismatch. The wizard does not change router/ONU configuration or perform billing operations.
- **Admin Analytics:** `layout.html?page=analytics` requests `/api/admin/analytics` with `Authorization: Bearer <session-token>`; the login gateway issues a short-lived session token stored in `sessionStorage`. The API returns aggregate chat/session/interaction counts, categories, daily totals and fallback/unanswered messages. Never publish the session token or password in frontend code.
- **Banglish synonyms:** `js/knowledge/synonyms.js` expands common Banglish/Bengali phrases into intent tokens before the existing local IDF-weighted search. It is deterministic and does not call an AI service.
- **Router & OLT Config:** `layout.html?page=network-config` provides an on-demand configuration form. Values are not persisted in browser storage or SQLite. MikroTik API-SSL on port 8729 performs TLS-validated RouterOS login and reads `/system/resource/print`; port 8728 is reachability-only and does not transmit credentials. OLT supports an SNMPv2c `sysDescr.0` response check; SNMPv3 is explicitly marked not tested pending its security credential fields. See `backend/README.md` for security boundaries and firewall guidance.

## Offline/online sync

With the API origin configured, chat-log writes enter a bounded local retry queue and retry on network recovery and each 30-second health cycle. Client event IDs plus unique SQLite indexes prevent duplicate inserts after uncertain retries. Browser storage is best-effort, not a server backup. If the API origin is empty, local knowledge/history remain available and the status reports that the backend URL is not configured.

## Security and monitoring

Helmet, exact-origin CORS, a 16 KB JSON limit, allowlisted fields, bounded text, control-character rejection, API/IP/session rate limits, hashed admin sessions, scrypt password hashes with constant-time verification, login/session expiry and logout revocation, structured request latency/status logs, SQLite quick-check/storage metadata and graceful WAL checkpoint on shutdown. Rate-limit state is in-memory and per process; do not horizontally scale this SQLite deployment.

## GitHub Pages

Workflow `.github/workflows/pages.yml` tests modules and knowledge search, stages only `index.html`, `layout.html`, `css/` and `js/`, uploads the Pages artifact and deploys it. In repository Settings → Pages select GitHub Actions. A successful build is not proof of successful deployment; inspect the deploy job and test the live URL.

## Project scope

Local knowledge assistant with optional logging API; not an AI inference service, billing system, customer account portal or multi-role IAM system.

## Professional ISP knowledge expansion v1

- The professional ISP pack is maintained in `js/knowledge/professional-isp.js` and indexed by `js/knowledge/index.js`.
- It currently defines **940 searchable knowledge cards** across 15 ISP support categories, built from **188 curated topics** and five support intents per topic (recognition, possible causes, safe checks, safe actions, escalation).
- **610 cards** contain general technical/support guidance. **330 cards** are explicitly marked as requiring verified company/customer data (company details, packages, billing, connection availability, customer accounts, payment status and contractual policy). Those cards must not invent live values.
- These are structured retrieval cards, not 940 independently researched facts or a generative AI model. Content quality and Bengali/Banglish query coverage still require a representative question/answer benchmark.
- CI validates the card count, unique IDs, metadata counts and representative retrieval queries. CI success does not establish live ISP device connectivity, billing verification, customer-data access or production browser E2E success.
