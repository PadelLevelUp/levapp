---
id: B-542
title: "An open class detail does not learn of the coach's reminder live: both shells' live handlers are coach-only, so a student sees \"Vou\" only after the 30 s stale window or a re-open"
type: incomplete-rule
severity: low
status: resolved
resolved: 2026-10-10T03:25:00Z
affects:
  - .specflow/specs/attendance/confirm.spec.md
  - frontend/apps/mobile/app/class/[id].tsx
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
  - frontend/packages/config/src/reminder-answer.ts
proposed_fix: "Rule 27 gains a live clause: on the student's `message_created` live event whose message is a `notification_reminder` for the open occurrence, both shells refetch the class detail (iOS also the dashboard keys); one shared predicate names the event."
opened: 2026-10-10T03:05:00Z
---

# B-542: an open class detail does not learn of the coach's reminder live

> Ledger id **unconfirmed** (wave-14 Session C range B-541–560; B-541 is on feature/pad-579, so
> this index line sits after B-463 here).

**Source:** PAD-600 (Low), found by Session A's Maestro run of flow 229 on feature/pad-570 at
ccd74bb7d (2026-10-09), filed by Session C; decided out of PAD-570 by the coordinator (the flow
waits out the 30 s stale window instead).

**What happens:** a student has the class detail open; the coach sends the reminder
(`POST /api/app/notify/send_reminders` → 200); the student leaves and re-enters within seconds and
the screen renders the cached payload (`pendingConfirmation: false`), so the "Vou" action
(`attendance.confirm` rule 27) is missing until the react-query `staleTime` (30 s, iOS
`app/_layout.tsx`) passes. Flask received exactly one `GET class_instance` in the run.

**What should happen:** the ask reaches an open class detail the moment it is sent — the shells
already keep that screen live for the coach through the SSE stream.

**Evidence (Phase 1):**
- The run's request log (Session A, flow 229): one `GET class_instance` for the whole run, the
  reminder POST 200 — the server behaved.
- Where the event is dropped: iOS `app/class/[id].tsx:398–450` — `useAppEvents` handler opens
  with `if (!isCoach || !event) return;`, so a student's screen reacts to no live event at all.
  Web `ClassDetailSheet.tsx:469` — `if (!open || !canManage || !token) return;` before
  `subscribeAppEvents`, so a student never subscribes. Both handle `notification_responded`,
  `join_request_*`, `waiting_list_changed` and `notify_sent` for the coach only.
- What the server sends the student: `_send_system_message` (`notification_service.py:2160`)
  publishes `{"type": "message_created", "payload": serialize_message(msg)}` to the two
  participants; the payload carries `messageType: "notification_reminder"` and
  `metadata.lessonInstanceId` (`serializers/message.py:101–102`), so the client can already
  tell "a reminder for the open occurrence" from the event alone — no server change needed.
- Not reproduced on a device here (simulator slot not granted tonight); the code path is the
  observation that selected the type.

**Root cause (tree):** dev spec `attendance.confirm` rule 27 governs and is correct ("both shells
read the flag"), but it says nothing about an open screen learning that the flag flipped — the
other live updates of the class detail are specified for the coach's rows only
(`calendar.event-detail` rules 16–17) and no rule covers the student's side. First NO at the
rule node → **Type 2, incomplete rule**. Criterion added with it.

**Drift check:** business `attendance/player-confirms-and-manages-attendance.business.md` says the
student answers the reminder when it arrives; nothing contradicts a live refresh. No drift.

**Affected specs:**
- Dev: `attendance/confirm.spec.md` (rule 27 + criterion).
- Business: unchanged.

### Change Plan

**Spec to modify:** `.specflow/specs/attendance/confirm.spec.md` — rule 27 gains: "**The ask
reaches an open class detail live (B-542, PAD-600):** the student's live `message_created` event
whose payload is a `notification_reminder` (`messageType`) for the open occurrence
(`metadata.lessonInstanceId`) makes both shells refetch the class detail — iOS invalidates the
`class-instance` query and the dashboard queries (hero, schedule rows and the "Precisa de ti" card
read `pendingConfirmation` too), web re-reads the sheet's instance — so "Vou" appears without a
re-open or the stale window. The event is recognised by ONE shared predicate
(`reminderArrivedFor` in `@levelup/config`), never by each shell's own string match."

**Add this criterion:**
#### The ask reaches an open class detail live (rule 27, B-542)
- **Given** a student with the class detail of occurrence 42 open, `pendingConfirmation: false`
- **When** their live stream delivers `message_created` with `messageType: "notification_reminder"`
  and `metadata.lessonInstanceId: 42`
- **Then** the shell refetches the class detail (iOS also the dashboard queries) and the screen
  offers "Vou" from the fresh payload
- **And** a `message_created` for another occurrence, or of another message type, refetches nothing

**Then:**
1. `@levelup/config` `reminder-answer.ts`: `reminderArrivedFor(evt, instanceId)` — red-first unit
   cases (right type + id → true; other id / other type / missing metadata → false).
2. iOS `app/class/[id].tsx`: a student branch ahead of the coach-only early return; invalidates
   `queryKeys.classInstance(event)` and the dashboard keys. Source-reading test
   (`vou-after-reminder-render.test.ts` pattern).
3. Web `ClassDetailSheet.tsx`: subscribe when `open && token` (coach branches stay behind
   `canManage`); on the predicate, `getClassInstance(ev).then(setClassInstance)`. Source-reading
   test beside the existing `ClassDetailSheet.*.test.ts`.
4. Regression: packages reminder-answer, mobile class-screen tests, web calendar tests.
5. Maestro flow 229 keeps its 31 s wait until Session A re-cuts it (follow-up, not here).

### Resolution

- Spec changes: `attendance/confirm.spec.md` — rule 27 live clause + criterion "The ask reaches an
  open class detail live (rule 27, B-542)".
- Tests added/modified: `packages/config/src/reminder-answer.test.ts` (`reminderArrivedFor`, 2 red
  on a stub → green); mobile `reminder-live-refetch.test.ts` and web
  `ClassDetailSheet.liveReminder.test.ts` (source-pinned wiring, both red before the wiring).
- Code changes: `reminderArrivedFor(evt, instanceId)` in `@levelup/config`; iOS `app/class/[id].tsx`
  asks it ahead of the coach-only gate and invalidates the class-instance and dashboard queries;
  web `ClassDetailSheet.tsx` subscribes for students too, asks it first and re-reads the instance,
  coach branches unchanged behind `canManage`. Flow 229 keeps its 31 s wait (Session A's to re-cut).
- Resolved: 2026-10-10 (PAD-600; ledger id unconfirmed)
