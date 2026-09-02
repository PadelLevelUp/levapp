# LevelUp iOS — App Store Readiness Plan

## Context

The iOS app (React Native / Expo, `apps/mobile`) now runs on a physical device and feels good, so the next goal is **App Store approval**. A three-part code audit (push wiring, mocked/dead UI, backend capabilities) established the real state of the app against Apple's most-cited rejection reasons. This plan addresses each gap "one by one" and hides everything not implemented/mocked so nothing incomplete ships.

Confirmed decisions (from planning Q&A):
- **Push:** wire real native push now (requires the paid Apple Developer Program).
- **Account deletion:** soft-delete + anonymize PII + kill sessions (not hard delete — hard delete would cascade-destroy the counterpart's chat history).
- **Messaging:** add Report + Block **and** restrict who can start conversations — **a coach may message players in their club(s); a student may message any coach**. Also fix the conversation-access (IDOR) gap.
- **Cleanup scope:** iOS **and** web; log every hidden/mocked item as a future to-do in `found_issues.md`.

Verified facts the plan relies on (with paths):
- Push is **100% non-functional end-to-end**: `apps/mobile/src/lib/push/expoPushRegistrar.ts:15` (`PUSH_TOKEN_ENDPOINT = null`) fetches an Expo token + requests OS permission (called from `apps/mobile/src/auth/AuthContext.tsx:60,100`) then discards it. Backend has only browser Web-Push/VAPID (`padel_app/utils/push_notifications.py`, `padel_app/models/push_subscriptions.py`) — no native device-token model, endpoint, or sender.
- Account deletion: no endpoint. Reusable: `User.status` enum `active/inactive/disabled` (`padel_app/models/users.py:41-45`) already filters `/app/users` (`frontend_api.py:378`) and drives `isActive`. Session revocation is jti-only (`padel_app/models/token_blocklist.py`, loader `padel_app/auth.py:18-21`) — no per-user revoke.
- Report/Block: nothing exists. Messaging is currently open to **all** active users (`create_conversation_service` `messaging_service.py:154` does no relationship check; picker `GET /app/users` `frontend_api.py:375` returns all active users). `GET /app/conversation/<id>` (`frontend_api.py:328`) does not verify the caller is a participant. Reusable template: `MessageReaction` table + `toggle_reaction_service` (`messaging_service.py:116`). Club membership: `Club.coaches` / `Club.players` (`padel_app/models/clubs.py`).
- Mocked/dead UI is **almost entirely web-only** (`apps/web/src/pages/SettingsPage.tsx`). On iOS only two dead surfaces exist: dashboard KPI tiles with no route render as tappable no-ops (`apps/mobile/src/features/dashboard/DashboardBlocks.tsx:41-82`; coach: "Pending validation"/"Revenue", student: "Attended"/"Missed"/"Invites"), and the push permission prompt.

---

## Phase 1 — Hide/neutralize mocked & dead UI (no backend; do first)

**iOS (`apps/mobile`):**
- `DashboardBlocks.tsx` `KpiGrid` (`:52-82`): when `mapHref()` returns `null`, render the tile as **non-interactive** (plain `View`, no `Pressable`/`active:` affordance) instead of a dead-but-tappable card. Keeps the stat visible, removes the "tap does nothing" feel. (Do NOT add fake routes.)

**Web (`apps/web/src/pages/SettingsPage.tsx`):** hide the mocked sections/controls so nothing fake ships:
- Billing tab (`:739-760`) — hide entirely.
- Security: fake change-password (`:273-289`) and fake logout-in-settings (`:291-297`) — remove (real logout stays in `AppLayout.tsx:337`).
- Profile avatar upload (`:168-271`) + non-persisting Profile fields (`:217-245`) — hide the upload + make fields read-only (or hide), since `updateMe` only persists `language`.
- Preferences theme/timeFormat/weekStart/analytics (`:458-570`), Notifications toggles (`:660-733`), Calendar defaults (`:572-652`) — hide (all local-state-only). Keep only what persists (language; the real `NotificationsEngineSection`).
- `apps/web/src/components/messages/ChatHeader.tsx:54-56` dead kebab — either wire it (Phase 3 gives it Report/Block) or hide until then.

**Log-as-future:** append each hidden item to `found_issues.md` under a new "Hidden for App Store submission — rebuild later" section (Billing, password change, avatar upload, editable profile, preferences, notification toggles, calendar defaults, dashboard deep-links to /validations/revenue/presences/invites).

## Phase 2 — In-app account deletion (Apple 5.1.1(v))

**Backend:**
- New `DELETE /api/auth/me` in `padel_app/modules/api_auth.py` (mirror the `@jwt_required` + `current_user()` style already there). Service: set `user.status="disabled"`; anonymize PII (`name`→"Deleted user", `email`→null, `phone`→null, detach `user_image_id`); leave the row so message authorship still resolves (bubbles show "Deleted user" rather than destroying the counterpart's history).
- **Session kill (reuse-friendly):** extend the JWT revocation check in `padel_app/auth.py` so any token for a `status="disabled"` user is rejected — invalidates all devices at once without adding per-user token tracking.
- Test: pytest in `padel_app/tests/` — delete → `/auth/me` 401, user hidden from `/app/users`, existing messages still load with anonymized sender.

**Shared API + apps:**
- `packages/api/src/resources/auth.ts`: add `deleteAccount()` → `DELETE /auth/me`.
- Mobile `apps/mobile/app/settings.tsx`: destructive "Delete account" row → `AlertDialog` confirm (type-to-confirm or password re-entry) → call `deleteAccount()` → clear tokens → `/login`. Reuse the existing logout/AlertDialog patterns.
- Web `SettingsPage.tsx` Security card: matching "Delete account" destructive action.

## Phase 3 — Report/Block + messaging scoping (Apple 1.2 UGC) — largest phase

**Backend models** (mirror `MessageReaction`): `BlockedUser(blocker_id, blocked_id, unique)` and `MessageReport(reporter_id, message_id, reason, created_at)`. Alembic migration.
**Backend services/endpoints:**
- Block/unblock (toggle, reuse `toggle_reaction_service` shape) + report → new routes under `frontend_api.py` (`POST /app/users/<id>/block`, `DELETE .../block`, `POST /app/messages/<id>/report`).
- **Enforce messaging scope in `create_conversation_service` (`messaging_service.py:154`)**: coach caller → target must be a player in one of the coach's clubs (`Club.players` via the coach's clubs); student caller → target must be a coach. Reject otherwise. Block check: refuse conversation/message if either party blocked the other; hide blocked users from pickers.
- **Recipient picker**: replace `GET /app/users` (all active) for the new-conversation flow with a scoped list (coach→club players, student→coaches), consumed by `apps/mobile/app/conversation/new.tsx` and the web equivalent.
- **Fix IDOR**: `GET /app/conversation/<id>` (`frontend_api.py:328`) must verify the caller is a participant.
**Shared API:** `packages/api/src/resources/messages.ts`: `blockUser/unblockUser/reportMessage`; scoped recipient query.
**UI:** add a thread-header "more options" menu on mobile (`apps/mobile/app/conversation/[id].tsx` — currently none) and wire web's dead kebab (`ChatHeader.tsx`) → **Report / Block** actions with confirm + toast. Blocked-state affordance in the thread.
**Tests:** pytest (scope enforcement, block prevents messaging, report persists, non-participant 403 on GET conversation) + Maestro flow (open thread → menu → block/report).

## Phase 4 — Privacy policy, permission strings, privacy manifest (Apple 5.1.1)

- **Privacy Policy + Terms**: publish a hosted policy (static page or a `/privacy` + `/terms` route served by the backend/web). Link from web register/settings and mobile settings; supply the URL in App Store Connect. (Content is a product/legal task — plan wires the links + placeholder page.)
- **Info.plist purpose strings** (`app.json` `ios.infoPlist`, the source of truth since `ios/` is gitignored): `NSFaceIDUsageDescription` already present; add strings only for permissions actually used. Push needs none. (Photo/camera strings deferred with avatar upload.)
- **Privacy manifest / App Privacy label**: fill the App Store Connect questionnaire accurately (name, email, phone, message content, coarse usage). Verify the app's `PrivacyInfo.xcprivacy` matches.

## Phase 5 — Real native push notifications (needs paid Apple Developer Program)

**Backend:**
- New `DeviceToken(user_id, token, platform, unique(token))` model + `POST/DELETE /api/notifications/device` register/unregister endpoints (distinct from the existing browser Web-Push routes).
- Expo Push sender (`exponent_server_sdk` or raw Expo HTTP push API) — Expo handles APNs, so no direct cert management. Wire it into the existing delivery helper `_send_system_message` / `send_class_reminders` / `send_manual_notifications` (`padel_app/services/notification_service.py`) alongside the current in-app `Message` + SSE (keep those).
**Mobile:**
- Point `expoPushRegistrar.ts:15` `PUSH_TOKEN_ENDPOINT` at the new endpoint; send the token post-login (registrar already fetches it). Wire `unregister()` into `AuthContext.logout()`.
- `app.json`: add the `expo-notifications` plugin + `aps-environment` (via the plugin/entitlement) — **requires the app signed by the paid team** (`com.levelup.mobile`, not the local `com.ppc.levelupdev` hack).
- Handle received/tapped notifications (route to the relevant conversation/class).
**Prereq:** paid Apple Developer Program membership + APNs key registered with Expo/EAS.

## Phase 6 — Submission prep

- **Bundle ID**: real submission uses the org's `com.levelup.mobile` under the paid team (the `com.ppc.levelupdev` + emptied-entitlements were only local-device hacks — revert those for the store build).
- **Demo account** in App Store Connect review notes (a seeded coach + student on the production/staging backend the reviewer can reach).
- App Store metadata: screenshots (all required device sizes), description, keywords, support URL, the privacy policy URL from Phase 4.
- Release build verification on device (not just debug).

---

## Sequencing & dependencies
- Phase 1 is independent — do first (fast, visible win, unblocks a clean reviewer experience).
- Phases 2 and 3 are the hard Apple blockers; 3 is the biggest (models + scope + UI both platforms).
- Phase 4 can run in parallel with 2/3.
- Phase 5 (push) is gated on the paid account; it's the feature you chose to add — sequence it after the blockers unless the account is already in hand.
- Phase 6 is the final gate.
- Each phase = its own branch + PR off `main`, following the repo's ticket workflow; keep the `feature/mobile-web-parity` work either merged first or rebased under these.

## Verification (per phase)
- **Device**: the physical iPhone is already set up (LAN backend on `192.168.1.8:5055` → dev DB, Metro on `:8081`); exercise each new flow live (delete account, report/block, scoped messaging).
- **Backend**: pytest under `padel_app/tests/` for every new endpoint (deletion, block/report, scope enforcement, IDOR fix, device-token register).
- **Mobile E2E**: new Maestro flows under `apps/mobile/.maestro/flows/` (account-deletion, message-report-block) following the existing numbered convention; keep the suite green (`scripts/e2e.sh`).
- **Web E2E**: Playwright specs for the Settings changes + account deletion + report/block.
- **Shared `packages/*`**: re-run `npm run test:packages`; spot-check web since it re-exports the same client.
