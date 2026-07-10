# Found Issues — Mobile/Web Parity Audit (2026-07)

This file lists issues found during the 2026-07 cross-platform (web/mobile) parity audit that need product decisions or separate follow-up tickets, and were deliberately NOT built or fixed as part of the parity work itself.

## 1. Settings items mocked on web (never persisted)

Several web Settings fields are local-state only and are never sent to the backend: Profile fields beyond name (abbreviation, email, phone, bio, avatar), Theme, Time format, Week-start, Analytics opt-in, generic Notification toggles, Billing (placeholder card with a disabled button), Security password-change (mock `setTimeout`, no backend endpoint exists), and Import Data (a real, working API at `apps/web/src/api/import.ts`, but arguably desktop-only functionality). The backend's `PATCH /auth/me` currently only supports updating `language`, so none of the others can be persisted without backend work.

**Decision needed:** For each mocked item, decide build-for-real (add backend support + persistence) or remove-from-UI (stop presenting fake functionality to users).

## 2. Messages "More options" kebab is unwired on web

The "More options" kebab menu icon in `apps/web/src/components/messages/ChatHeader.tsx` has no `onClick` handler — it's dead UI on web, and mobile has no equivalent at all.

**Decision needed:** Define what the kebab menu should actually do (e.g. mute conversation, clear history, block user) before building it on either platform.

## 3. Calendar capacity-count mismatch (web desktop)

During the audit, the same class showed three different participant counts simultaneously on web desktop: the event-card badge ("2/6"), the detail-panel "Capacity" tile ("1/6 · 5 open, 9 pending"), and the "Participants" header ("2/6"). This points to inconsistent counting logic (confirmed vs. pending vs. capacity) across components rendering the same underlying data.

**Suggested action:** File a standalone bug ticket to audit and unify the capacity/participant-count calculation across the event-card, detail-panel, and header components.

## 4. Student dashboard counter mismatch (web)

On the student dashboard, the "Invites" KPI tile read "2" while the "Invites to confirm" section simultaneously showed "No pending invites" — suggesting the two widgets are counting different things (or one is stale/buggy).

**Decision needed:** Confirm whether "Invites" and "Invites to confirm" are meant to represent the same underlying set; if so, fix the discrepancy, if not, clarify labeling so they aren't confused as duplicates.

## 5. Web recurring-class delete scope not confirmed

On iOS, deleting a recurring class is recurrence-aware, prompting "only this class" vs. "this and future" scope. The audit did not confirm whether web's delete flow offers the same scope choice or silently deletes without asking.

**Suggested action:** Verify web's recurring-class delete behavior; if it lacks the scope dialog, add one matching the iOS pattern for parity and to avoid unintended bulk deletes.

## 6. Web player-list cards are not accessible

Web player-list cards are not exposed as buttons or links in the accessibility tree, unlike mobile where the equivalent cards are proper `Pressable` components with accessibility labels. This is an a11y gap specific to web.

**Suggested action:** Update the web player-list card markup (e.g. wrap in a `button`/`role="link"` with an accessible name) so it's reachable via screen readers and keyboard navigation, matching mobile's accessibility posture.

## 7. Auto-Invite Engine full sub-panel parity on mobile

Phase 6 of the parity plan ports only the basic Auto-Invite Engine controls (on/off, automatic/semi-automatic mode) to mobile. The seven web sub-panels — Reminders, InvitationGroups, Tiebreakers, Restrictions, NotificationGroups, MessageTemplates, and StandingWaitingList — were explicitly deferred and not built.

**Suggested action:** Scope a dedicated follow-up plan/ticket set to port each of the seven sub-panels to mobile once basic engine controls have shipped and been validated.

## 8. Mobile push notifications are stubbed

`PUSH_TOKEN_ENDPOINT` is `null` in `apps/mobile/src/lib/push/expoPushRegistrar.ts`. Notify/Remind actions sent *from* mobile work correctly (they're processed server-side), but mobile users cannot *receive* push notifications since no device token is ever registered with the backend.

**Decision needed:** Prioritize a backend endpoint to accept and store native push tokens (APNs/FCM via Expo) so mobile can receive pushes; this is adjacent to but outside the scope of the parity plan itself.

## 9. Mobile i18n retrofit of existing screens

Existing mobile screens still contain hardcoded English strings that were not migrated to the i18n system introduced as foundational infrastructure in Phase 0 of the parity plan. This retrofit was scoped out as a separate follow-up rather than done inline.

**Suggested action:** Create a follow-up ticket to sweep existing mobile screens and replace hardcoded strings with the `src/locales` i18n loader, consistent with the app-wide i18n work already shipped on web (PAD-40).
