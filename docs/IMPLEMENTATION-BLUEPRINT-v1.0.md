# Unique Network BD & Hacking Helpline — Implementation Blueprint v1.0

**Repository:** `uniquenetworkbd/Chatbot` · **Branch:** `main` · **Version:** 1.0 · **Date:** 2026-11-08

This is the single source of truth for the integrated Chat Interface System. Do not create a competing blueprint. Review this document before changing module boundaries or API contracts.

## 1. Objective

Deliver one integrated assistant interface with New Chat, server-persisted conversation history, topic selection through the composer Plus menu, knowledge routing, search, rename, archive/restore, export, backup and recovery. No automatic conversation deletion and no permanent-delete endpoint.

## 2. Existing platform constraints

- Static frontend: GitHub Pages at `https://uniquenetworkbd.github.io/Chatbot`.
- Backend: Node.js 20.11+ / Express 5 / better-sqlite3.
- Existing frontend uses ES modules and a local Bangla knowledge matcher; it is not a hosted generative AI model.
- Existing admin authentication is a separate, fixed administrator session. It must not be reused as customer identity.
- Backend hosting currently relies on a Codespaces-published HTTPS endpoint in `backend-url.json`. The process must be restarted/redeployed for changed backend code to become live.
- SQLite and backup directories must be on persistent mounted storage.

## 3. Integrated component map

### Frontend
- `js/app.js`: existing chat rendering, local knowledge lookup, voice, local retry log.
- `js/chat-workspace.js`: guest identity bootstrap, conversation list, New Chat, history search, rename, archive/restore, export and Plus topic menu.
- `js/navigation.js`: sidebar and workspace navigation.
- `js/knowledge/index.js` plus `company.js`, `internet.js`, `billing.js`, `security.js`, `professional-isp.js`: local knowledge registry and search.
- `css/chat.css`, `css/navigation.css`: responsive chat, sidebar and topic menu.

### Backend
- `backend/server.js`: Express startup, CORS, rate limiting, middleware and route mounting.
- `backend/database/connection.js`, `migrations.js`: SQLite connection and versioned migrations.
- `backend/middleware/guest-session.js`: guest-session bearer verification and ownership context.
- `backend/routes/conversations.js`: conversation, message, search, rename, archive, restore and export API.
- `backend/routes/admin-backups.js`: administrator-only backup creation, integrity verification and download.
- `backend/scripts/restore-backup.js`: offline restore with integrity validation and pre-restore safety copy.

## 4. Topic registry

| ID | User-facing topic | Knowledge scope |
|---|---|---|
| `network` | Internet & Network | connectivity, router, Wi-Fi |
| `mikrotik_isp` | MikroTik & ISP | RouterOS, PPPoE, RADIUS, OLT, ONU |
| `cybersecurity` | Cyber Security | account, website and online safety |
| `computer` | Computer & Technology | hardware, software, troubleshooting |
| `webdev` | Web Development | HTML, CSS, JavaScript, backend |
| `ai_automation` | AI & Automation | AI tools, chatbot, APIs, automation |
| `company` | Unique Network BD Services | company services and packages |
| `general` | General Questions | general information |

Topic selection adds a visible prefix and topic ID. It routes into the current local knowledge matcher; it does not itself create new knowledge or a generative model. Unsupported/low-confidence questions must use the existing honest fallback.

## 5. Data model

Versioned SQLite migrations preserve all legacy tables. New entities:

- `guest_sessions(id, token_hash, created_at, last_seen_at)`
- `conversations(id, guest_session_id, title, topic_id, status, created_at, updated_at, last_message_at)`
- `messages(id, conversation_id, sender, content, topic_id, client_event_id, created_at)`
- `conversation_events(id, conversation_id, event_type, event_data, created_at)`
- `backup_records(id, file_name, file_size, checksum, status, created_at)`

Foreign keys are enabled. Conversation/message ownership is checked on every request. Messages use per-conversation idempotency keys. Archive is a status transition; no row or message is deleted. Search is limited to the authenticated guest session.

### Identity limitation — explicit

v1.0 uses an opaque random guest token stored in this browser profile; only its SHA-256 hash is stored in SQLite. This provides server-side ownership isolation for a browser profile, **not registered-user accounts or cross-device sync**. Clearing browser storage or losing the token makes the guest history inaccessible. A later account/credential recovery design requires a separate reviewed change; do not claim that this guest model is full user account recovery.

## 6. API contract

All routes use `/api`.

| Method | Route | Access |
|---|---|---|
| POST | `/conversations/guest-sessions` | create guest token |
| GET / POST | `/conversations` | guest-owned list / create |
| GET | `/conversations/search?q=` | guest-owned search |
| GET | `/conversations/archived/list` | guest-owned archive list |
| GET | `/conversations/:id/messages` | owner only |
| POST | `/conversations/:id/messages` | owner only, idempotent |
| PATCH | `/conversations/:id` | owner only, rename |
| POST | `/conversations/:id/archive` | owner only |
| POST | `/conversations/:id/restore` | owner only |
| GET | `/conversations/:id/export` | owner only |
| GET / POST | `/admin/backups` | admin only |
| POST | `/admin/backups/:id/verify` | admin only |
| GET | `/admin/backups/:id/download` | admin only |

There is deliberately no permanent-delete API. Existing `/api/auth/*` remains administrator authentication and is not used for guest conversations.

## 7. Persistence and recovery

- Primary storage is backend SQLite on a persistent volume.
- Browser storage holds only the guest bearer token and temporary legacy/local state; it is not the canonical transcript store.
- Failed backend writes must be surfaced as unsaved, not falsely confirmed.
- Admin backup endpoint creates a SQLite snapshot; verification checks SQLite integrity and SHA-256.
- Restore is an offline maintenance operation. Stop the API, set `ALLOW_OFFLINE_RESTORE=1`, run `node scripts/restore-backup.js <backup-file>`; it validates the source and preserves a pre-restore copy.
- Backup retention, off-host copies and scheduled backup automation require hosting-specific persistent storage and scheduling; do not assume GitHub Pages stores database files.

## 8. Security

- Random high-entropy guest tokens; persist only SHA-256 hashes server-side.
- Enforce guest ownership in every conversation/message/search/export operation.
- Separate guest identity from admin authentication.
- CORS allowlist, Helmet, request-size limits, rate limits and strict field validation.
- No credentials in frontend code or public repository files.
- No user-supplied network target is passed to server-side device probes.
- No automatic deletion or retention expiry.

## 9. UX requirements

- Sidebar: New Chat, active history, search, Archived view, rename, archive/restore, export.
- Composer: Plus button, eight topic choices, selected topic prefix, message input, voice input and send.
- Mobile sidebar remains a drawer; conversation area scrolls independently; composer stays fixed and topic menu remains viewport-safe.
- Provide explicit status when backend is offline or server persistence fails.
- Guest identity scope must be visible to avoid implying cross-device account sync.

## 10. Test plan and release gates

### Backend
- guest token issue and invalid token rejection
- owner isolation (guest A cannot read/write guest B conversations)
- create/list/load/rename/search/archive/restore/export
- duplicate message idempotency
- migration from existing schema without changing legacy admin tables
- no permanent-delete endpoint
- backup creation, checksum and SQLite integrity verification
- offline restore and pre-restore safety copy

### Browser
- plus menu opens/closes and topic inserts correct prefix
- topic is persisted with messages
- New Chat creates a distinct conversation
- switch conversation restores only its own transcript
- search, rename, archive, restore and export
- mobile/desktop layout and runtime error checks

### Production
1. GitHub Actions backend tests pass.
2. GitHub Actions Pages syntax, unit and browser tests pass.
3. Backend changes are deployed to the actual HTTPS backend runtime and `/api/health` confirms the new schema version and routes.
4. GitHub Pages deployment completes.
5. Live HTTPS browser tests exercise the deployed UI against the deployed backend.
6. Backup verification and a controlled restore drill pass before claiming disaster recovery is verified.

A GitHub Actions green check for static frontend deployment does not prove the Codespaces backend process has been restarted or updated.

## 11. Development governance

- Design before development; this document is the sole v1.0 blueprint.
- Preserve existing login, local knowledge, voice, admin analytics and network tooling.
- No unverified feature is marked complete.
- Report BUILT, PARTIALLY BUILT, MOCK/DEMO, NOT BUILT and UNVERIFIED separately.
- Never call a mock API test a live production test.
- No production success claim without GitHub Actions run evidence and live HTTPS browser evidence.


## 12. Production release and verification record — 2026-11-08

- Pull Request #16 was merged into `main` as commit `e200702c3dfb0cf39af4119f8ec3b1f719a8aa21`.
- The later release-gate and backend-manifest safety updates are on `main`; the latest workflow change commit is `43efa99716358e96d1d3795eccda0380a3e633b1`.
- Backend CI on the final feature commit passed **22/22 tests in three separate runs**.
- Workspace/Profile Playwright browser CI passed in **three separate runs**, including topic insertion, message persistence, new conversation, search, archive and restore.
- GitHub Pages production build and deployment passed. Live HTTPS homepage/profile/assets and mobile browser verification passed in three checks.
- The production Codespaces backend did **not** pass the live API gate. Its published URL returned HTTP 404 during two checks. The manifest was therefore changed to `status: "inactive"` so the frontend does not treat an unreachable endpoint as active.
- The backend is not declared production-ready until the Codespace `urban-robot-97vwgxrr4vqr2xjwj` is stopped and started again. Its `.devcontainer/devcontainer.json` post-start hook runs `scripts/auto-publish.sh`, which must start the backend, confirm `/api/health`, confirm `/api/conversations` returns the expected unauthenticated 401, and only then publish an active manifest.
- After the Codespace restart, verify `/api/health` returns HTTP 200 with `schemaVersion: 5`, and verify `/api/conversations` returns HTTP 401 with `Guest session required`. The GitHub Pages workflow then performs the live release gate again.
- Until those checks pass, server-backed chat history, archive/restore, and backup operations are **implemented and CI-tested but not production-live**. Existing local knowledge replies remain available; they are not a hosted generative AI model.
