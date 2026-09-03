---
path: frontend/apps/mobile/app/class/[id].tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 1139
size_tokens: 10463
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7d78126209177d104eef11679a2075821598613b6d6c6a93f86be63f2c071e34"
---

## Purpose

The largest screen in the app: class/event detail, combining view mode, coach-only inline edit mode (name/date/time/capacity/level/color/auto-notifications), attendance marking + confirm, training-plan attach/confirm, invited-list (live via SSE), notify/remind/delete actions, and the student-only cancel-my-spot flow. Handles BOTH "class" and non-class calendar-event types (`event.type === "class"` gates class-only actions like Notify/Remind/training).

## Connections

Uses:
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for the `isCoach` role gate (unresolved alias).
- `frontend/apps/mobile/src/lib/sse.ts`: `useAppEvents()` for live `notification_responded` / `notify_sent` updates to the open instance's invitations (unresolved alias).
- `frontend/apps/mobile/src/lib/utils.ts`: `cn()` for the edit-mode color-swatch selection ring (unresolved alias).
- `@/features/calendar/*` (`ParticipantRow`, `class-scope-dialog`, `edit-class-diff`, `hooks`, `notify-modal`, `params`, `planning-section`): outside this scope (mobile-components) — these carry most of the domain logic (attendance mutation hooks, edit diffing, notify UI, training planning UI).
- `@levelup/config` (`effectiveFilledSpots`, `lightTheme`), `@levelup/hooks` (`queryKeys`, `useAutoInviteEnabled`, `useClassInstance`, `useCoachLevels`), `@levelup/types` (`ClassInstance`, `PresenceStatus`): outside this scope (packages).

Used by: no file within this scope (routed via expo-router file convention).

## File map

Lines 1–90: imports, `COLORS` palette, `formatDay` helper.
Lines 92–260: hook wiring — route params → `event` (via `paramsToEvent`), `useClassInstance` fetch, attendance-draft state seeded from server presences, edit-mode/notify/planning local state, and the SSE handler for live invitation updates.
Lines 260–402: derived values (title, canceled/recurring flags, `filled`/`maxPlayers`, date/time labels, level lookup) and the action handlers: edit start/cancel/save/commit, remind, planning start/cancel/save, confirm-attendance, delete, student cancel-attendance.
Lines 404–456: header render (back button, inline-editable title `Input` in edit mode, canceled badge) and the pending/error states.
Lines 457–719: the 2×2 info-card grid (date, time, capacity, level) each with a view-mode Text and an edit-mode input variant; recurring badge; auto-notifications toggle; edit-mode color picker.
Lines 721–875: participants + attendance list (`ParticipantRow` per participant, confirm-attendance button), the collapsible "Invited (N)" list (coach-only, driven by SSE), and the student's own attendance status + cancel-attendance button.
Lines 883–1039: training-planning section (coach-only, `PlanningSection` + save/cancel), and the coach action row (edit/notify/remind/delete) plus the edit-mode save/cancel row.
Lines 1043–1138: modals — `ClassScopeDialog` (single vs future edit scope), `NotifyModal`, delete confirmation `AlertDialog` (single vs future for recurring classes), and the student cancel-attendance confirmation `AlertDialog`.

## Insights

- `event` is memoized from route params via `paramsToEvent`, NOT derived from the fetched `instance` — the screen can render a header/skeleton from just the params before `useClassInstance` resolves, and `active = draft ?? instance ?? null` is the single source of truth for every displayed field (draft during edit, else the fetched instance).
- The SSE handler for `notify_sent` deliberately invalidates only the CURRENTLY open instance's own query key (`queryKeys.classInstance(event)`), unlike web's `ClassDetailSheet` which re-points its fetch at the event's raw `lessonInstanceId` — a comment notes this avoids a class of instance-id mismatch that web is exposed to.
- Attendance for students reads only `(instance?.presences ?? [])[0]` — the API only ever returns the calling student's own presence row, never the full roster, so indexing `[0]` is safe specifically because of that backend contract, not because the array happens to be short.
- Delete and edit both branch on `isRecurring`/`canApplyScope` (`event.isRecurring === true`) to offer a single-vs-future scope choice — recurring-scope UX (`ClassScopeDialog`) is shared between the two actions.

## Query pointers

If you need to add a new editable field, add it to `EDITABLE_CLASS_FIELDS` in `@/features/calendar/edit-class-diff` (outside this scope) AND to the `draft` state shape here — `diffInstance` only reports changes for fields listed there.
If you're chasing a stale invited-list after a manual notify, read the `notify_sent` SSE branch (lines ~202–207) — it both invalidates the query and force-opens `invitationsOpen`.
