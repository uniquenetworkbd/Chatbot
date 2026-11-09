# Frontend Source Audit & Module Mapping v1.0
Project: Unique Network BD & Hacking Helpline
Repository: uniquenetworkbd/Chatbot
Branch: main
Audit snapshot: 2026-11-10 (UTC+06)
Latest audited commit: b4ef39df0809211d7ad210ea8b31c114fef70172

## Audit status and scope

Status: PARTIAL SOURCE AUDIT — Phase 0 is not complete.

This report is based on source files fetched directly from the GitHub main branch, the current Pages workflow, README/backend documentation, and the most recent available workflow logs. A recursive repository tree listing was not available through the connected GitHub operations during this audit. Therefore, this is a verified mapping of the inspected files, not a claim that every repository file has been inventoried.

Do not interpret a file existing as proof that its UI is reachable, its backend is running, or its live device integration works. Mocked browser responses are not physical-device tests.

## Evidence rules

- VERIFIED IN SOURCE: the implementation is present in the inspected main-branch source.
- BROWSER TESTED: a named browser test passed in a recorded workflow.
- LIVE TESTED: a workflow accessed the deployed GitHub Pages site over HTTPS.
- MOCKED: the test supplied simulated API responses; no real backend/device was contacted.
- PENDING: a new commit has not yet had its resulting workflow run and logs inspected.
- NOT FOUND IN INSPECTED SOURCE: no implementation was found in the inspected files; this is not a claim that no similarly named code exists anywhere in the repository.

## Current production/deployment evidence

Last available workflow evidence before the current audit changes:
- Pages build/deploy run 42624708280: build, status report and deploy jobs succeeded.
- Custom deploy/live verification run 42624708545: test, browser-e2e, build and deploy succeeded; verify-live failed.
- In that verify-live log, homepage/profile assets, mobile chat layout, Profile browser checks, and live menu/history/admin-profile route checks passed.
- Backend verification stopped while validating backend-url.json because the manifest was inactive. The workflow did not make a new /api/health request in that run.
- backend-url.json last inspected on main was status=inactive. Its statusReason recorded an earlier HTTP 404. This is historical manifest state, not proof of a new HTTP 404 on the audit date.

The above runs used commit 77464c0f5d809aebd32c70e0bc3733214687a944. They do not verify the later Network Config changes in commit b4ef39df0809211d7ad210ea8b31c114fef70172.

## Blueprint-to-source mapping

| Blueprint area | Inspected implementation | Current assessment |
|---|---|---|
| Application Shell | index.html, layout.html, js/navigation.js, css/main.css, css/navigation.css | Partial. Responsive shell, sidebar, skip link, keyboard focus handling and theme exist. |
| Main Chat | js/app.js, js/chat-workspace.js, css/chat.css | Partial. Local chat, typing indicator, quick replies, autocomplete, copy, text export, scroll control, speech input and speech synthesis are present. |
| Topic Selector | js/chat-workspace.js | Present: 8 fixed topics. Not a searchable hierarchical topic directory. |
| Workspace | js/navigation.js, js/chat-workspace.js | Partial. New Chat, local History search, Archive/Restore, backend conversation list/search and conversation export are represented. Favorites, pinning, date filters, bulk actions and import are not found in inspected source. |
| Knowledge Center | js/knowledge/index.js, company.js, internet.js, billing.js, security.js, synonyms.js, professional-isp.js | Partial. Browser-local deterministic IDF-weighted keyword search, Banglish synonym expansion and 940 professional ISP cards across 188 topics are present. It is not a remote AI inference/RAG service. |
| Profile | profile.html, js/profile.js, css/profile.css | Partial. Knowledge document browser, search, category filtering, preview and quality/system panels exist. Selected live browser test passed on the earlier deployed commit. |
| Admin Center | admin-profile.html, js/admin-profile.js, js/auth-session.js, js/admin-analytics.js, backend/routes/auth.js | Partial. Password login, short-lived bearer session, session verification/logout and protected analytics are implemented in source. Production login is not verified while backend discovery is inactive. Full user/role management is not found in inspected source. |
| Network Tools | js/tools-page.js, js/wizard.js, backend/services/network-service.js | Demo/local tools. The Tools page explicitly labels sample router/OLT/bandwidth values as simulated. Configured server targets perform allowlisted TCP reachability only. |
| Network Config | js/network-config.js, backend/routes/network-config.js | Source implementation exists for admin-gated on-demand RouterOS API-SSL and SNMPv2c probes. SNMPv3 is explicitly not tested. Before this audit the route was not mounted in navigation and the frontend failed to await async backend discovery. |
| System Center | js/config.js, js/app.js, js/profile.js, backend/routes/health.js, backend/controllers/api-controllers.js | Partial. Health v5 checks status, database, service name and schemaVersion=5. A complete dedicated diagnostics center with all Blueprint components is not present in inspected source. |
| Offline/Online Sync | js/app.js, js/chat-workspace.js | Partial. A bounded retry queue with client event IDs exists for chat-log writes. Conversation message writes use the API directly and report failures; they do not use the same durable pending queue. |
| PWA | Inspected root/workflow files | Not found in inspected source: no verified service-worker/installable PWA implementation. |
| Attachments | Inspected chat UI/source | Not found in inspected source: no verified image/PDF upload and secure parsing flow. |
| Advanced Message Actions | js/app.js | Partial. Copy and speech playback exist. Edit/delete/share/like/dislike/report/regenerate/summary were not found in inspected chat source. |

## Health Contract finding

The current js/config.js already validates all four required fields:
- status === ok
- database === ok
- service === unique-network-chatbot-api
- schemaVersion === 5

The current backend health controller returns the same service name and migration-derived schemaVersion. The previous Blueprint statement that frontend config checked only status/database was outdated relative to the inspected main source.

## Network Config changes committed during this audit

Commits pushed to main:
- fb948d744d8acbdd91baebaee92b7703cc2a9af3 — add Network Config browser regression test.
- 16bca9a1d4386a7b989d596349751212b3406499 — await getApiBaseUrl() before using the API origin.
- f40a19c506b09ad6f2f4d2dbef6e010d50159e45 — mount the Network Config page behind the admin authentication gate.
- 3bf3a1141d6f5f385328712bd8b388b03c0cd9e5 — add a link from Network Tools to the admin-only configuration page.
- b4ef39df0809211d7ad210ea8b31c114fef70172 — add the new browser regression test to the three-iteration browser-e2e workflow loop.

The new test uses mocked health, login and device-probe API responses. It is designed to verify route mounting, admin login, async backend discovery, bearer authorization, Router API-SSL request payload, secret clearing and explicit SNMPv3 not-tested behavior. It does not contact a physical router or OLT.

Verification state for these five commits: source re-fetched from main and confirmed present. Resulting GitHub Actions run/logs and deployed live behavior: PENDING; do not mark these changes tested until the new workflow evidence is inspected.

## Important backend facts

- backend/server.js mounts modular Express routes.
- backend/package.json uses Express 5 and better-sqlite3.
- backend/database/connection.js enables SQLite WAL, foreign keys and migrations.
- backend/database/migrations.js contains schema migrations through version 5.
- backend/routes/conversations.js implements guest-session-protected conversations/messages.
- backend/routes/auth.js implements password login and 8-hour bearer sessions.
- backend/routes/network-config.js requires admin authentication and restricts target IP/ports.
- GitHub Pages serves static frontend assets only; it does not host the Node API or persistent SQLite.
- Production backend availability remains unverified while backend-url.json is inactive.

## Immediate next gates

1. Obtain and inspect the Actions run created by commit b4ef39df0809211d7ad210ea8b31c114fef70172. Verify the new Network Config test completed all 3 iterations.
2. If it fails, fix from the actual failing log and repeat the workflow.
3. Perform the complete recursive file inventory and import/dependency graph; this report is not that exhaustive inventory.
4. Reconcile chat-log queue versus conversation-message persistence and add a durable, idempotent pending queue for conversation messages only after designing the migration safely.
5. Restore a healthy production backend endpoint and verify /api/health plus guest-session-protected /api/conversations.
6. Only then test real Admin Login and, with explicitly authorized lab devices, real RouterOS API-SSL/SNMPv2c connectivity.
7. Continue the remaining Blueprint phases: message actions, workspace organization, knowledge management, admin permissions, diagnostics, attachments and PWA.

## Completion declaration

Blueprint v1.0 is an architecture proposal, not a completed product specification. Several core modules are implemented partially. The current audit does not certify the whole Blueprint as complete. Phase 0 remains open until a complete file tree, import graph, module inventory and endpoint map are recorded.
