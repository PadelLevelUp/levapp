---
id: B-197
title: "A student who just joined by QR sees \"No coach yet?\" on their first dashboard"
type: missing-criterion
severity: high
status: resolved
affects:
  - players.join-token
  - frontend/apps/web/src/pages/JoinCoachPage.tsx
  - frontend/apps/mobile/src/features/players/JoinCoachScreen.tsx
  - frontend/apps/web/src/components/players/ClaimRequestsList.tsx
  - frontend/apps/mobile/src/features/players/claim-requests.tsx
proposed_fix: "Re-read /me (refreshUser) as soon as a join or a claim is accepted, on web and iOS (players.join-token rule 8a)."
resolved: 2026-09-25T13:25:12Z
opened: 2026-09-25T13:13:35Z
---

# B-197: the first dashboard after a QR join says "No coach yet?"

**Source:** PAD-444 (founder report, iPhone, 2026-09-24). A new student who signed up through the coach's QR code saw "Ainda sem treinador? Ligar-me a um treinador" on her first dashboard. After signing out and back in, the card was gone. The id comes from Session-D's range B-196–200.

**What happens:** rule 8's "has no coach" is read from the client's copy of `/api/auth/me` (`me.coaches`). That copy is loaded at sign-up, when the student has no coach yet. The join then succeeds on the server, but neither the web `JoinCoachPage` nor the iOS `JoinCoachScreen` re-reads `/me`. Every dashboard shown in that session still says there is no coach. A coach's claim accepted on the dashboard banner leaves the same stale copy: iOS invalidates the dashboard and calendar queries, but not the user.

**What should happen:** once the join or claim is accepted, the dashboard knows the student has a coach.

## Evidence
- **Reproduced on web** (2026-09-25, isolated E2E stack, staging 86a9ab42f). US-212 extended: sign up from the QR link, confirm the join, then reach the dashboard in-app through the sidebar link (no reload). `student-connect-prompt`: expected 0, received 1, held for the whole 5 s wait. It is stale, not a race.
- **The code, on both platforms:** `handleJoin` sets its own state after `acceptJoinToken` and nothing else. `StudentDashboard` (web `:70`, iOS `:40`) computes `looksUnconnected` from `useAuth().user.coaches`.
- **iOS:** not yet reproduced on the simulator (the lane was busy); the same code path. Maestro runs on the fix.

## Diagnostic tree
1. Dev spec: `players.join-token`. Yes.
2. Rule 8 ("no coach" comes from `/me`) is correct.
3. Criterion: "Connected student is not prompted to connect" covers a student who is already connected. Nothing covers the session in which the link is made, so nothing required the client's `/me` to follow the join. **Missing criterion.**

Drift: none. The business spec wants the QR path to land the student on their coach.

## Change plan
- **Spec:** `players.join-token` rule 8a, plus two criteria (join, and claim).
- **Tests (red first):**
  - The web E2E US-212 extension (above).
  - An iOS JoinCoachScreen unit test (`refreshUser` called after accept).
  - Web and iOS claim-accept tests.
  - Maestro on the fix.
- **Fix:** call `refreshUser()` after a successful `acceptJoinToken` and a successful `acceptClaimRequest`, on web and iOS.

### Resolution

- **Spec:** `players.join-token` rule 8a, plus the criteria "A student who just joined is not prompted to connect (PAD-444)" and "A student who accepts a coach's claim is not prompted to connect (PAD-444)".
- **Code:** `refreshUser()` runs once the server accepts:
  - web `JoinCoachPage`, awaited before the success card, and a failed refresh never fails the join;
  - iOS `JoinCoachScreen`, the same;
  - web `ClaimRequestsList` and iOS `claim-requests`, each after an accepted claim.
- **Tests:**
  - E2E US-212 extended: red on staging (the prompt was held for 5 s), green on the fix. Full file plus claim-existing-account: 6/6.
  - iOS `join-coach-screen.test.tsx` 3/3: accept then refresh; a failed join refreshes nothing; a failed refresh keeps the success card.
  - iOS `claim-requests.test.tsx` 2/2 and web `ClaimRequestsList.test.tsx` 2/2: red first on the accept cell.
- **Still open:** the iOS simulator run of the QR journey. The pinned-simulator lane was held by Session-E.

The ticket also asked what happens if the student taps "Ligar-me a um treinador" in the stale state. It opens /connect, and pasting the same link again is harmless: accept is idempotent (`alreadyMember`).
