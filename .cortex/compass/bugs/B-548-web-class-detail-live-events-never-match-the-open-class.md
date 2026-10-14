---
id: B-548
title: "The web class detail never matched a live event to the open class: it compared the calendar-event id with the event's instance number, so B-542's reminder refresh and PAD-659's regroup never fired"
type: test-defect
severity: medium
status: resolved
resolved: 2026-10-14T19:30:00Z
affects:
  - .specflow/specs/calendar/event-detail.spec.md
  - .specflow/specs/attendance/confirm.spec.md
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
  - frontend/apps/mobile/app/class/[id].tsx
  - frontend/packages/config/src/participant-groups.ts
  - backend/padel_app/services/presence_events.py
proposed_fix: "One shared reading of the open class's instance id (liveInstanceIdOf: a presence's lessonInstanceId, else a lessoninstance-<n> event id, else an instance event's originalId), used for every live-event match on web; presence_changed also names lessonId and the occurrence date, so a sheet opened before its occurrence was materialised still matches."
opened: 2026-10-14T19:00:00Z
---

# B-548: the web class detail's live events never matched the open class

**Source:** PAD-659, found by its Playwright spec (US-PAD-659c, the live regroup) on the first run.

**What happens:** the web sheet computes the open class's id as `classInstance.id ??
(event is an instance ? originalId : null)`. `getClassInstance` returns `{ id: event.id, ...payload }`
and the payload has no `id`, so `classInstance.id` is always the CALENDAR EVENT id —
`"lessoninstance-12"` or `"lesson-5-2026-10-17"` — and the fallback is never reached. Both live
predicates compare it with a payload's numeric `lessonInstanceId` as strings, so neither ever
matched:
- B-542's (PAD-600) "the reminder lands in an open class detail" refresh has never fired on web.
  Its only test pins the source (`ClassDetailSheet.liveReminder.test.ts`), which is why it
  passed — a claim outliving its evidence.
- PAD-659's `presence_changed` regroup did not fire either (US-PAD-659c: the row stayed in
  "Por responder" after the student cancelled).

A second case on both shells: an occurrence the coach opened before it was materialised has no
instance id at all, and the write that materialises it (a cancellation, a mark) names only the
new instance.

**What should happen:** a live event about the open class refreshes it, whichever id form the
sheet holds.

**Evidence:** red-first `participant-groups.test.ts` "the open class's live identity (B-548)":
`expected 'lessoninstance-12' to be 12` against the old reading, and the lesson-and-date match
`expected false to be true`. End to end: US-PAD-659c red (`Expected: "not_going"`, `Received:
"pending"`) before the fix, green after (3/3 on levelup_e2e_1410c1, 2026-10-14).

**Fix:** `liveInstanceIdOf` in `@levelup/config` for every web live match (reminder and
presence); `presence_changed` carries `lessonId` and `date`, and `presenceChangedFor` matches an
unmaterialised occurrence by them (web and mobile).
