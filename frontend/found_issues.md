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

## 10. `getClassInstances` was mistyped, causing silent bugs in web's Add-to-Classes dialog (now fixed)

While building the real Add-to-Classes save (Phase 3), `getClassInstances` (`packages/api/src/resources/classes.ts`, backing `/app/lesson_instances`) turned out to be declared as returning `ClassInstance[]`, but the backend actually serializes `CalendarEvent`-shaped rows via `serialize_calendar_event` (`padel_app/serializers/calendar_event.py:29` — the same helper the main calendar-events endpoint uses): `title` not `name`, `participantCount` not a `participants` array, plus `model`/`originalId` which `ClassInstance` doesn't even have.

Consequence: web's existing `AddToClassesDialog.tsx` had two silent dead-code bugs from this mistype — every class in the dialog always showed the "Unnamed class" fallback (reading `cls.name`, which was always `undefined`), and both the "already in this class" badge and the capacity/full check never fired (reading `cls.participants`, also always `undefined`).

**Status: fixed on this branch.** `getClassInstances` (`packages/api/src/resources/classes.ts`) and its web wrapper (`apps/web/src/api/classes.ts`) now correctly return `Promise<CalendarEvent[]>` — `CalendarEvent` (`packages/types`) already matched the real serialized shape field-for-field, so no new type was needed. `useClassInstancesForWeek` (`apps/mobile/src/features/players/hooks.ts`) was updated to match. Both `AddToClassesDialog.tsx` (web) and `add-to-classes-dialog.tsx` (mobile) were updated to use the corrected type directly (no more local re-typing/casting) and to read `.title`/`.participantCount`.

All call sites of `getClassInstances` were grepped and accounted for — there were only five: the shared definition, the web re-export wrapper, and the three consumers above (no other callers exist anywhere in web or mobile). The web wrapper's `USE_MOCK_DATA` branch (`apps/web/src/api/classes.ts`) still returns the old `ClassInstance`-shaped `mockClassInstances` cast to the new type, since `VITE_USE_MOCK_DATA=false` in `apps/web/.env` means that branch doesn't run in practice — retrofitting `mockData.ts` itself was left out of scope since `mockClassInstances` is also used correctly, unchanged, by two other mock branches (`getClassInstance` singular and `apps/web/src/api/dashboard.ts`).

## 11. "Already in this class" indicator can't be rebuilt without a backend change

The web bug described in #10 also killed the only signal `AddToClassesDialog` ever had for "this player is already enrolled in this class instance" — `/app/lesson_instances` only ever returned `participantCount` (a number), never a per-player list, so there was never a way to check membership from that response on either platform, even before the type was fixed. The indicator has not been reintroduced on either platform as part of the Phase 3 fix.

Instead, duplicate adds are guarded server-side: `player_in_lesson_instance` has `UniqueConstraint(player_id, lesson_instance_id)` (`padel_app/models/Association_PlayerLessonInstance.py`), so attempting to add a player already in a class fails that one class's `editClass` call; both dialogs' save loops call `editClass` per selected class independently inside a try/catch and surface per-class failures in an aggregate error toast, without blocking the classes that did succeed.

**Decision needed:** If the product wants the "already in" indicator back (so a coach sees it up front instead of via a failed-add toast), `/app/lesson_instances` needs a new field — e.g. a `containsPlayerId` check param, or a per-instance participant-id list — added on the backend.
