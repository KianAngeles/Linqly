# Linqly Refactor File Structure Plan

**Purpose:** Maintain a single source-of-truth migration roadmap so future sessions can execute a move-first, refactor-later file-structure migration without changing runtime behavior or contracts.

## Migration Strategy Summary

- Use a move-first, refactor-later roadmap.
- Keep runtime behavior fixed by using compatibility shims at old paths during migration.
- Split work into small gated phases; no phase advances without passing its exit criteria.
- Separate frontend-heavy and backend-heavy phases to reduce blast radius.
- Delay monolith/high-coupling files until foundations and low-risk moves are done.
- Do not delete legacy files until a later verification phase explicitly proves they are unused.

## Global Invariants

- Frontend route paths must not change from current behavior (`/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/app/*`, `/call`).
- Backend mount prefixes must not change (`/auth`, `/users`, `/friends`, `/notifications`, `/message-requests`, `/chats`, `/messages`, `/hangouts`, plus `/health`).
- Socket event names must remain unchanged (including `auth:*`, `chat:*`, `message:*`, `typing:*`, `call:*`, `group_call:*`, `friends:*`, `hangout:*`, `notifications:*`, `presence:update`).
- Auth/token/cookie behavior must remain unchanged.
- Request/response payload shapes must remain unchanged.
- No implementation refactors inside feature logic during migration phases.
- Any uncertain legacy file is marked needs verification before quarantine/deletion decisions.

## Phase 1: Scaffold-Only Foundation

- **Objective:** Create target directory skeleton only.
- **Scope:** Frontend + backend, scaffold-only.
- **Exact files/folders involved:**
  - `client/src/app/{router,providers,layout}`
  - `client/src/features/{auth,home,chats,hangouts,friends,profile,notifications,calls,search,settings}`
  - `client/src/shared/{api,realtime,constants,lib,ui,assets}`
  - `client/src/legacy`
  - `server/src/app/{routes,middleware}`
  - `server/src/modules/{auth,users,friends,chats,messages,messageRequests,hangouts,notifications,calls}`
  - `server/src/realtime/{events,state}`
  - `server/src/shared/{security,integrations,utils}`
  - `server/src/scripts/maintenance`
- **What moves in this phase:** Nothing; create folders and tracking markers only (for example `.gitkeep`).
- **What must remain unchanged:** All code files, routes, API mounts, socket behavior.
- **Compatibility shim need:** No.
- **Import/path rewiring expectation:** None.
- **Risk level:** Very low.
- **Why this phase is placed in this order:** Enables safe destination paths before any move.
- **Rollback plan:** Remove newly created scaffold folders/files.
- **Verification checklist:** `git status` shows only new scaffold artifacts; frontend build still succeeds; backend still boots; `/health` still responds.
- **Exit criteria before moving to the next phase:** Zero modified runtime files and all baseline smoke checks passing.

## Phase 2: Frontend Legacy Quarantine

- **Objective:** Quarantine likely legacy files without deleting them.
- **Scope:** Frontend-only.
- **Exact files/folders involved:**
  - `client/src/pages/AppShell.jsx` (needs verification)
  - `client/src/pages/Chats.jsx` (needs verification)
  - `client/src/pages/ChatRoom.jsx` (needs verification)
  - `client/src/store/authStore.js` (needs verification)
  - destination `client/src/legacy/{pages,store}`
- **What moves in this phase:** Move the four candidate files into `client/src/legacy/...`.
- **What must remain unchanged:** Active route table behavior in `client/src/App.jsx`; active chat flow via `ChatsPanel`.
- **Compatibility shim need:** Yes; keep old paths as pass-through exports to new legacy paths for safety.
- **Import/path rewiring expectation:** None immediately if shims are used; mandatory reference scan first.
- **Risk level:** Low.
- **Why this phase is placed in this order:** Removes obvious clutter early and safely.
- **Rollback plan:** Move files back to original paths and remove shims.
- **Verification checklist:** Run import/reference search; build frontend; smoke-test `/app`, `/app/chats`, `/app/map`.
- **Exit criteria before moving to the next phase:** No unresolved imports and no route/runtime regression.

## Phase 3: Shared Platform Relocation

- **Objective:** Move shared infrastructure to `client/src/shared`.
- **Scope:** Frontend-only.
- **Exact files/folders involved:**
  - `client/src/api/http.js`
  - `client/src/socket.js`
  - `client/src/constants/featureFlags.js`
  - `client/src/utils/notificationSoundManager.js`
  - destination `client/src/shared/{api,realtime,constants,lib}`
- **What moves in this phase:** The four shared platform files above.
- **What must remain unchanged:** API base resolution, auth refresh flow, socket initialization, feature flag values, notification sound behavior.
- **Compatibility shim need:** Yes; keep old file paths as re-export shims.
- **Import/path rewiring expectation:** None immediately with shims; canonical rewiring deferred.
- **Risk level:** Low.
- **Why this phase is placed in this order:** Stabilizes core infra paths before domain migrations.
- **Rollback plan:** Move files back; remove shims.
- **Verification checklist:** Frontend build; login/refresh; realtime socket connection; chat notification sound behavior.
- **Exit criteria before moving to the next phase:** Platform behavior unchanged and build/runtime checks pass.

## Phase 4: Auth/Public Feature Packaging

- **Objective:** Group authentication/public-entry files under `features/auth`.
- **Scope:** Frontend-only.
- **Exact files/folders involved:**
  - `client/src/pages/{Landing.jsx,Landing.css,Login.jsx,Register.jsx,ForgotPassword.jsx,ResetPassword.jsx}`
  - `client/src/components/auth/*`
  - `client/src/validators/*`
  - `client/src/api/auth.api.js`
  - destination `client/src/features/auth/{pages,components,validators,api}`
- **What moves in this phase:** Auth/public pages, auth UI components, validators, auth API client.
- **What must remain unchanged:** Public URLs and auth runtime semantics.
- **Compatibility shim need:** Yes for all old paths.
- **Import/path rewiring expectation:** None immediate if shims are preserved.
- **Risk level:** Low to medium.
- **Why this phase is placed in this order:** Clear feature boundary with limited backend coupling.
- **Rollback plan:** Move files back and restore old import entry points.
- **Verification checklist:** `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`; form validation; auth login/register/logout flow.
- **Exit criteria before moving to the next phase:** All auth/public pages behave exactly as before.

## Phase 5: Social + Notifications + Search + Settings Packaging

- **Objective:** Relocate medium-coupling user-facing domains.
- **Scope:** Frontend-only.
- **Exact files/folders involved:**
  - `client/src/pages/{Friends.jsx,Friends.css,Notifications.jsx,Notifications.css,SearchResults.jsx,SearchResults.css,Settings.jsx,Settings.css}`
  - `client/src/components/notifications/NotificationsList.jsx`
  - `client/src/hooks/useNotificationsDropdownData.js`
  - `client/src/api/{friends.api.js,notifications.api.js}`
  - destination `client/src/features/{friends,notifications,search,settings}`
- **What moves in this phase:** The files listed above.
- **What must remain unchanged:** `/app/friends`, `/app/notifications`, `/app/search`, `/app/settings` behavior and payload handling.
- **Compatibility shim need:** Yes.
- **Import/path rewiring expectation:** None immediate with shims.
- **Risk level:** Medium.
- **Why this phase is placed in this order:** Moderate complexity, but still lower risk than map/chat/call monoliths.
- **Rollback plan:** Revert moved files and shim layers.
- **Verification checklist:** Friend request actions; notifications actions; search results and profile navigation; settings save paths.
- **Exit criteria before moving to the next phase:** All four `/app/*` sections are behavior-identical.

## Phase 6: App Shell + Home Packaging

- **Objective:** Separate app-level shell/layout from feature pages.
- **Scope:** Frontend-only.
- **Exact files/folders involved:**
  - `client/src/components/layout/{AppShell.jsx,AppShell.css,HeaderBar.jsx,Sidebar.jsx}`
  - `client/src/pages/{Home.jsx,Home.css}`
  - destination `client/src/app/layout` and `client/src/features/home/pages`
- **What moves in this phase:** Layout shell files and Home page files.
- **What must remain unchanged:** Nested `/app` outlet behavior, top navigation behavior, sidebar/header interactions.
- **Compatibility shim need:** Yes.
- **Import/path rewiring expectation:** None immediate if shims remain.
- **Risk level:** Medium.
- **Why this phase is placed in this order:** Shell is central but manageable after medium domains are stabilized.
- **Rollback plan:** Move files back and restore prior import boundaries.
- **Verification checklist:** Navigate all `/app/*` pages; header dropdowns; sidebar links; theme toggle.
- **Exit criteria before moving to the next phase:** App-shell navigation parity with no layout regression.

## Phase 7: Hangouts Feature Packaging

- **Objective:** Relocate map/hangout files intact into `features/hangouts`.
- **Scope:** Frontend-only.
- **Exact files/folders involved:**
  - `client/src/pages/{HangoutsMap.jsx,HangoutsMap.css}`
  - `client/src/components/hangouts/*`
  - `client/src/api/hangouts.api.js`
  - destination `client/src/features/hangouts/{pages,components,api}`
- **What moves in this phase:** Hangouts page, CSS, components, API client.
- **What must remain unchanged:** `/app/map` route behavior; map interactions; hangout CRUD/join flows.
- **Compatibility shim need:** Yes.
- **Import/path rewiring expectation:** None immediate with shims.
- **Risk level:** High.
- **Why this phase is placed in this order:** Map module is large; moved after core/shared stabilization.
- **Rollback plan:** Restore original file locations and remove corresponding shims.
- **Verification checklist:** Map load; feed list; details drawer; create/edit; join/leave; location sharing.
- **Exit criteria before moving to the next phase:** Hangouts user flows fully match baseline.

## Phase 8: Profile Feature Packaging

- **Objective:** Relocate profile domain files intact.
- **Scope:** Frontend-only.
- **Exact files/folders involved:**
  - `client/src/pages/{Profile.jsx,Profile.css}`
  - `client/src/pages/profile/{BasicInfoModal.jsx,EditProfileModal.jsx,EditInterestsModal.jsx,UploadAvatarModal.jsx,PrivacySelectorModal.jsx}`
  - `client/src/api/users.api.js`
  - destination `client/src/features/profile/{pages,components,api}`
- **What moves in this phase:** Profile page and profile modal subpages plus users API client.
- **What must remain unchanged:** `/app/profile/:username` behavior, edit/profile privacy behavior.
- **Compatibility shim need:** Yes.
- **Import/path rewiring expectation:** None immediate with shims.
- **Risk level:** High.
- **Why this phase is placed in this order:** Profile is large and cross-cuts friends/hangouts/settings, so after those stabilize.
- **Rollback plan:** Move profile files and users API back.
- **Verification checklist:** Own profile and external profile views; avatar upload; basic info update; interests/about update; privacy reads/writes.
- **Exit criteria before moving to the next phase:** Profile parity across owner and visitor scenarios.

## Phase 9: Chats Domain Packaging

- **Objective:** Relocate chat domain as-is, no internal refactor.
- **Scope:** Frontend-only.
- **Exact files/folders involved:**
  - `client/src/pages/{ChatsPanel.jsx,ChatsPanel.css}`
  - `client/src/components/chats/*`
  - `client/src/components/chats/room/*`
  - `client/src/components/AccordionSection.jsx`
  - `client/src/hooks/chats/*`
  - `client/src/utils/chats/*`
  - `client/src/utils/chatSettings.js`
  - `client/src/store/chatsStore.js`
  - `client/src/api/{chats.api.js,messages.api.js,messageRequests.api.js}`
  - destination `client/src/features/chats/{pages,components,hooks,utils,store,api}`
- **What moves in this phase:** Entire chat feature set above.
- **What must remain unchanged:** `/app/chats` and `/app/chats/:chatId`; message send/receive semantics; read-receipt behavior; reactions; attachments.
- **Compatibility shim need:** Yes, mandatory.
- **Import/path rewiring expectation:** None immediate due mandatory shims.
- **Risk level:** Very high.
- **Why this phase is placed in this order:** Largest dependency graph, delayed until most app structure is stable.
- **Rollback plan:** Revert full chat move as a single unit.
- **Verification checklist:** Chat list; open chat; send text/image/file/voice; reactions/unreact; delete message; group settings and members.
- **Exit criteria before moving to the next phase:** End-to-end chat parity and stable realtime updates.

## Phase 10: Calls + Universal Chat Packaging

- **Objective:** Relocate call stack and mini-chat runtime files.
- **Scope:** Frontend-only.
- **Exact files/folders involved:**
  - `client/src/pages/{Call.jsx,Call.css}`
  - `client/src/components/calls/*`
  - `client/src/components/universal-chat/*`
  - `client/src/store/CallContext.jsx`
  - destination `client/src/features/calls/{pages,components,store}` and `client/src/features/chats/components/universal`
- **What moves in this phase:** Call page/components/context and universal chat component bundle.
- **What must remain unchanged:** `/call` query-parameter contract; call popup behavior; direct/group call socket events.
- **Compatibility shim need:** Yes, mandatory.
- **Import/path rewiring expectation:** None immediate due shims.
- **Risk level:** Very high.
- **Why this phase is placed in this order:** WebRTC/call lifecycle is sensitive and should be near the end of frontend migration.
- **Rollback plan:** Restore original call/universal-chat paths and shims.
- **Verification checklist:** Incoming call modal; direct call start/end; call controls; group-call notification/join flow.
- **Exit criteria before moving to the next phase:** Call flows stable with unchanged socket behavior.

## Phase 11: Frontend Canonical Rewire + Shim Audit

- **Objective:** Rewire active imports to new canonical paths while keeping shims.
- **Scope:** Frontend-only.
- **Exact files/folders involved:**
  - All active frontend source files under `client/src` except `client/src/legacy`
  - all shim files introduced in phases 2-10
- **What moves in this phase:** No file moves; import path rewiring only.
- **What must remain unchanged:** Runtime behavior and route behavior.
- **Compatibility shim need:** Yes; keep shims for at least one stabilization cycle.
- **Import/path rewiring expectation:** High volume rewiring expected, but path-only.
- **Risk level:** Medium.
- **Why this phase is placed in this order:** Done after all frontend moves so rewiring happens once.
- **Rollback plan:** Revert rewiring commit; shims keep old imports functional.
- **Verification checklist:** Build passes; no unresolved import paths; no active imports from quarantined legacy entrypoints except allowed shims.
- **Exit criteria before moving to the next phase:** Frontend canonical imports stabilized and runtime unchanged.

## Phase 12: Backend Scripts Quarantine

- **Objective:** Relocate maintenance scripts only.
- **Scope:** Backend-only.
- **Exact files/folders involved:**
  - `server/tmp/{checkUploads.js,encryptExistingMessageData.js,listLocalUploads.js,migrateLocalUploads.js}`
  - destination `server/src/scripts/maintenance`
- **What moves in this phase:** The four scripts above.
- **What must remain unchanged:** Backend API runtime and boot path.
- **Compatibility shim need:** Recommended yes; keep wrappers under `server/tmp` forwarding to new locations.
- **Import/path rewiring expectation:** None for runtime; optional doc/script-path updates later.
- **Risk level:** Very low.
- **Why this phase is placed in this order:** Cleans non-runtime items first on backend.
- **Rollback plan:** Move scripts back.
- **Verification checklist:** Backend boot unaffected; maintenance scripts runnable from old and new paths if wrappers used.
- **Exit criteria before moving to the next phase:** Runtime untouched and scripts accessible.

## Phase 13: Backend Shared Foundations Relocation

- **Objective:** Move shared backend infra/helpers without changing behavior.
- **Scope:** Backend-only.
- **Exact files/folders involved:**
  - `server/src/config/db.js`
  - `server/src/middleware/{authRequired.js,validateRegister.js}`
  - `server/src/validators/register.validator.js`
  - `server/src/utils/{avatar.js,cloudinary.js,jwt.js,location.js,mailer.js,messageCrypto.js,pairKey.js,passwordRules.js,resetToken.js,username.js}`
  - destination under `server/src/app`, `server/src/shared/{security,integrations,utils}`
- **What moves in this phase:** Foundational config/middleware/validators/shared utilities listed above.
- **What must remain unchanged:** Token validation, password rules, username rules, crypto behavior, cloudinary/mailer behavior.
- **Compatibility shim need:** Yes at old paths.
- **Import/path rewiring expectation:** None immediate with shims.
- **Risk level:** Low to medium.
- **Why this phase is placed in this order:** Prepares backend base dependencies before module route moves.
- **Rollback plan:** Restore original paths and remove shims.
- **Verification checklist:** Backend boots; auth endpoints still work; file upload and password reset endpoints still function.
- **Exit criteria before moving to the next phase:** Shared infra parity confirmed.

## Phase 14: Backend Low-Risk Module Route Relocation

- **Objective:** Move lower-risk route modules first.
- **Scope:** Backend-only.
- **Exact files/folders involved:**
  - `server/src/routes/{auth.routes.js,users.routes.js,friends.routes.js}`
  - destination `server/src/modules/{auth,users,friends}`
- **What moves in this phase:** The three route files above.
- **What must remain unchanged:** Exact mount prefixes `/auth`, `/users`, `/friends`; response payloads.
- **Compatibility shim need:** Yes; keep old `server/src/routes/*.routes.js` as forwarders.
- **Import/path rewiring expectation:** None immediate with shims.
- **Risk level:** Medium.
- **Why this phase is placed in this order:** Lower coupling than notifications/chats/messages/hangouts.
- **Rollback plan:** Restore moved route files.
- **Verification checklist:** Register/login/refresh/logout/me; users search/profile/privacy; friends request/accept/reject/cancel/remove/block flows.
- **Exit criteria before moving to the next phase:** Prefix and behavior parity confirmed.

## Phase 15: Backend Medium-Risk Module Route Relocation

- **Objective:** Move notifications and message-request routes.
- **Scope:** Backend-only.
- **Exact files/folders involved:**
  - `server/src/routes/{notifications.routes.js,messageRequests.routes.js}`
  - destination `server/src/modules/{notifications,messageRequests}`
- **What moves in this phase:** The two route files above.
- **What must remain unchanged:** `/notifications` and `/message-requests` semantics; notification payload shape.
- **Compatibility shim need:** Yes.
- **Import/path rewiring expectation:** None immediate with shims.
- **Risk level:** Medium to high.
- **Why this phase is placed in this order:** More cross-model complexity, but still below chat/message/hangout risk.
- **Rollback plan:** Restore original route files and shim state.
- **Verification checklist:** Notifications list/read/read-all/clear-read; message-request send/list/get/accept/decline/ignore.
- **Exit criteria before moving to the next phase:** Notification/request behaviors unchanged.

## Phase 16: Backend High-Risk Domain Route Relocation

- **Objective:** Move heavy route monoliths last.
- **Scope:** Backend-only.
- **Exact files/folders involved:**
  - `server/src/routes/{chats.routes.js,messages.routes.js,hangouts.routes.js}`
  - `server/src/utils/messageRequests.js`
  - destination `server/src/modules/{chats,messages,hangouts}` and shared domain utility location
- **What moves in this phase:** The three high-risk route files and `messageRequests` utility.
- **What must remain unchanged:** `/chats`, `/messages`, `/hangouts` prefix semantics; event emission behavior; attachment/upload behavior.
- **Compatibility shim need:** Yes, mandatory.
- **Import/path rewiring expectation:** None immediate with shims.
- **Risk level:** Very high.
- **Why this phase is placed in this order:** Largest backend risk; delayed until all lower-risk backend moves pass.
- **Rollback plan:** Revert the full phase as one unit.
- **Verification checklist:** Direct/group chat lifecycle; message send/list/react/delete/download; hangout create/feed/join/leave/update/location share.
- **Exit criteria before moving to the next phase:** End-to-end domain parity and stable realtime side-effects.

## Phase 17: Backend Realtime + App Entry Relocation

- **Objective:** Re-home backend entry/realtime structure without changing runtime contract.
- **Scope:** Backend-only.
- **Exact files/folders involved:**
  - `server/src/{app.js,server.js,realtime.js}`
  - destination `server/src/app` and `server/src/realtime/{events,state}`
- **What moves in this phase:** App/server/realtime orchestration files.
- **What must remain unchanged:** Socket event names/payloads, connection lifecycle, disconnect cleanup, call/group-call flows, npm script behavior.
- **Compatibility shim need:** Yes; keep `server/src/server.js` and `server/src/app.js` entry shims if scripts still point there.
- **Import/path rewiring expectation:** Minimal immediate rewiring if shim-first is used.
- **Risk level:** Very high.
- **Why this phase is placed in this order:** Realtime orchestration is most sensitive and must be last.
- **Rollback plan:** Restore original orchestrator files and shim routing.
- **Verification checklist:** Server boot; REST health; socket auth online/offline; typing/read updates; direct call and group call full lifecycle.
- **Exit criteria before moving to the next phase:** Realtime parity confirmed under representative load.

## Phase 18: Verification-Gated Shim and Legacy Consolidation

- **Objective:** Decide what can be cleaned up only after proof of non-use.
- **Scope:** Frontend + backend.
- **Exact files/folders involved:**
  - All compatibility shims
  - `client/src/legacy/*`
  - any backend wrappers under old paths
- **What moves in this phase:** No mandatory moves; this is verification-first.
- **What must remain unchanged:** Production behavior, route/API/socket contracts.
- **Compatibility shim need:** Yes by default; removal only for paths proven unused.
- **Import/path rewiring expectation:** Optional final rewiring cleanup if any old imports remain.
- **Risk level:** Medium (cleanup risk).
- **Why this phase is placed in this order:** Cleanup only after complete migration stability.
- **Rollback plan:** Reintroduce removed shims/legacy wrappers from VCS.
- **Verification checklist:** Reference scans prove no active imports; full regression suite passes.
- **Exit criteria before moving to the next phase:** Explicit sign-off on each shim/legacy removal candidate, or defer removal.

## Recommended Exact Order of Execution

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7
8. Phase 8
9. Phase 9
10. Phase 10
11. Phase 11
12. Phase 12
13. Phase 13
14. Phase 14
15. Phase 15
16. Phase 16
17. Phase 17
18. Phase 18

## Lowest-Risk First Moves

- Phase 1 scaffold creation.
- Phase 2 quarantine candidates marked needs verification.
- Phase 3 shared platform relocation with shims.
- Phase 12 backend maintenance scripts relocation.

## Highest-Risk Areas to Delay

- `client/src/pages/ChatsPanel.jsx` and chat domain bundle.
- `client/src/pages/Call.jsx`, `client/src/components/universal-chat/*`, `client/src/store/CallContext.jsx`.
- `server/src/routes/chats.routes.js`, `server/src/routes/messages.routes.js`, `server/src/routes/hangouts.routes.js`.
- `server/src/server.js` and realtime orchestration split.
- Any shim-removal/deletion steps before proof of non-use.

## Final Regression Checklist

- Frontend routes unchanged and reachable: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/app`, `/app/chats`, `/app/chats/:chatId`, `/app/map`, `/app/profile/:username`, `/app/friends`, `/app/search`, `/app/notifications`, `/app/settings`, `/call`.
- Backend mounts unchanged and functional: `/auth`, `/users`, `/friends`, `/notifications`, `/message-requests`, `/chats`, `/messages`, `/hangouts`, `/health`.
- Auth flow unchanged: register, login, refresh cookie path, logout, `/auth/me`.
- Chat flow unchanged: list chats, open chat, send text/media/file/voice, reactions, delete message, attachments/download.
- Message-request flow unchanged: send, list, open, accept/decline/ignore.
- Friends flow unchanged: request, accept/reject/cancel/remove, block/unblock, presence/location.
- Hangouts flow unchanged: create/edit/delete, feed/mine, join/leave, attendee actions, share location/note/stop.
- Notifications flow unchanged: list, mark read, mark all read, clear read.
- Socket behavior unchanged: `auth:*`, `typing:*`, `chat:*`, `message:*`, `call:*`, `group_call:*`, `friends:*`, `notifications:*`, `presence:update`.
- Call behavior unchanged: direct call and group call start/join/end and disconnect handling.
- Build/boot checks: frontend build passes, backend boots, health endpoint passes.
- Import integrity: no unresolved imports; shim targets valid.
- Legacy/shim cleanup only after explicit verification sign-off.

## Suggested Implementation Order Once Planning Is Approved

- Execute phases exactly in order with one commit per phase.
- Add a hard gate after each phase: do not continue until its exit criteria pass.
- Keep compatibility shims in place through at least one full regression cycle after each move.
- Defer canonical import rewiring until move phases in that stack are complete.
- Treat Phase 16 and Phase 17 as protected windows with expanded regression time.
- Treat Phase 18 as optional cleanup; only remove shims/legacy wrappers with proof and explicit approval.
