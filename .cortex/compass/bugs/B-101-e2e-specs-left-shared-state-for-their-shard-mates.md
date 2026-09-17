---
id: B-101
title: "E2E specs left classes, accepted class requests and answered reminders in the shared database, and whichever spec shared their shard paid for it"
type: test-defect
severity: medium
status: resolved
affects:
  - frontend/apps/web/e2e/attendance/pad288-early-cancellation.spec.ts
  - frontend/apps/web/e2e/attendance/pad315-come-back.spec.ts
  - frontend/apps/web/e2e/availability/unavailable-student-notifications.spec.ts
  - frontend/apps/web/e2e/class-requests/class-request-booking.spec.ts
  - frontend/apps/web/e2e/class-requests/class-request-counter-proposal.spec.ts
  - frontend/apps/web/e2e/class-requests/pad282-cancel-requested-class.spec.ts
  - frontend/apps/web/e2e/dashboard/student-dashboard-home.spec.ts
  - frontend/apps/web/e2e/dashboard/upcoming-class-deeplink.spec.ts
proposed_fix: "R-040. Every spec that writes to the shared E2E database removes what it wrote (e2e/helpers/cleanup.ts), and an assertion addresses the rows its own test created rather than counting a table."
opened: 2026-09-13T21:11:30Z
---

# B-101 — specs left state behind, and their shard-mates paid for it (PAD-341)

Number self-assigned from Session C's reserved range, unconfirmed (2026-09-16).

**Symptom.** Two specs failed inside shard 1 and passed alone on a fresh database, on staging
as much as on every batch:

- `class-requests/class-request-booking.spec.ts:37` expected exactly one
  `data-status="accepted"` row and found two, then three when PAD-315 added a spec.
- `dashboard/upcoming-class-deeplink.spec.ts:74`: "E2E Academy Class" never appeared in the
  coach dashboard's upcoming list.

**Why it moved.** `--shard=N/M` cuts the *sorted spec file list* into contiguous slices, so
which specs share a database changes whenever a release adds or removes a spec file. The
polluters were isolated only by accident of today's grouping, and the failure surfaced in a
file nobody had touched.

## Root cause — two cleanup traps nobody could see

1. **Removing a class never closed its class request.** `remove_class` deletes the lesson;
   `ClassRequest.lesson_id` is `ondelete="SET NULL"`, so the request stays `accepted`
   forever. No class-requests route closes an accepted request (withdraw and decline refuse
   with `not_open`). Every spec that accepted a request — pad288, pad315, pad282,
   counter-proposal and booking itself — left one row behind.
2. **Removing a materialised one-off class takes two passes.** When the student cancels, the
   class gets a `LessonInstance`. `remove_class` on that instance deletes it and, because the
   parent `Lesson` is not recurring, leaves the Lesson — which projects itself again on the
   same date. Every `finally` read the day once, so pad282's private class *tomorrow 08:00*
   survived its own cleanup.

Plus three specs that did not clean up at all:

- `dashboard/student-dashboard-home.spec.ts` — the debug reminder class two days out (shown
  twice on the coach's calendar: the debug endpoint's instance is not keyed to its Lesson's
  occurrence), the coach's reminder timing rewritten to 48 h, and a waiting-list entry on the
  seeded academy instance.
- `availability/unavailable-student-notifications.spec.ts` — "PAD-107 Blocked Class" and
  "PAD-107 Free Class" on the academy class's Monday.

The coach dashboard's `schedule_7d` shows 5 rows (`SCHEDULE_ROWS`). On Wednesday
2026-09-16 the rows ahead of the academy class were pad282's leftover, the two seeded
classes and the debug class twice — the academy class was row 6.

## Fix

- `e2e/helpers/cleanup.ts`: `removeClassesOnDay` re-reads the day until nothing matches,
  `deleteClassRequests` deletes by id through the superadmin editor (the seeded coach is
  superadmin), `editorIds` / `deleteNewEditorRows` snapshot-and-delete rows a spec cannot
  address by id. Cleanup failures are `expect.soft`, so a leak fails the leaking test without
  masking the error that sent it into `finally`.
- The seven specs above call them from `finally` (or `afterAll` for a serial file).
- `class-request-booking` now reads its own request id from its POST and follows that row
  from pending to accepted, instead of counting every row in the table.

## Evidence (R-034), 2026-09-16, isolated DB `levelup_e2e_2263116d`

Polluters = pad288, pad315, PAD-107, `class-requests/`, student-dashboard-home; victims =
booking and deeplink.

|                     | spec files at `80a377091`       | `c098dbabe` (cleanup)                 |
|---------------------|---------------------------------|---------------------------------------|
| polluters first     | **2 failed** (booking:37, deeplink:74), 18 passed | 20 passed; afterwards 0 `class_requests`, only seeded future lessons, 0 waiting-list rows |
| victims alone       | 4 passed                        | 4 passed                              |

Unfixed shard 1 on `80a377091`: 112 passed, 2 failed (the same two).

## Left as it is, on purpose

Shards are contiguous slices of the sorted file list (`workers: 1`, `fullyParallel: false`),
so a spec can only pollute specs that sort **after** it. The specs below still leave state,
none of it reaching these two victims in any shard composition, and are recorded here so the
next victim is quicker to trace:

- `notification-engine/cancel-attendance`, `cancel-attendance-class-view`, `proactive-decline`
  leave the seeded academy presence declined; `blank-template-fallback`, `auto-reminder`,
  `reminder-flow`, `waiting-list-offer` leave debug reminder classes. All sort after
  `dashboard/` and `class-requests/`.
- `dashboard/coach-dashboard` B-030 snoozes a needs-you card for 24 h; there is no route or
  editor model to delete a snooze.
- `availability/student-blockers` leaves two blockers; `auth-onboarding/*` and `clubs/*`
  create users, coaches and memberships by design.
- `attendance/presences-validation` answers the silent student on a *past* validation class.

B-079's batch-6 table lists `class-request-booking` as a load flake; given this ledger entry,
that failure was more likely this pollution than load.

**How to recognise the next one:** passes alone on a fresh database, fails in the shard at
the same line every time. Ask what ran against the database first, then bisect by running
the victim after halves of the specs that sort before it.

## Addendum, 2026-09-16 — hazards the cleanup does not cover

Recorded after #291 landed (batch 1, `7ce6b7b0c`). None of these is a leak a `finally` can fix;
they are listed so the next failure of this shape is recognised rather than re-diagnosed.

**1. An ambiguous locator that a shard-mate can satisfy.**
`notification-engine/class-cancellation-notification.spec.ts:30` picked the student in the
add-class sheet with `getByText('E2E Student', { exact: true }).first()`. With `class-requests/`
ahead of it, it failed intermittently (1 of 2 runs on `b4415507c`; neither half of the folder
triggered it alone) with the click intercepted by the sheet's overlay — `.first()` had
resolved to an element with the student's name *behind* the sheet, not the picker's option.
After the failing run the database held no leftover class, block or request, so this is not a
leak: it is a locator that anything titled with the student's name can capture. Session B
scoped the click to the sheet's dialog on #300. Full attribution table: #295's comment.
**Shape:** a locator that is unique only in a clean database. **Fix:** scope it to the
container it means.

**2. Parallel workers sharing one fixture** (coordinator, batch 1 shards run with
`--workers=2`; every one passes serially after a fresh reset):
- shard 1: `attendance/pad315-come-back` timed out at 240 s because
  `attendance/pad288-early-cancellation` ran concurrently — both book the first free block 8–14
  days out for E2E Student with E2E Coach and click the first "E2E Student" card; pad315's
  instance already showed `cancelledByStudent` before its own cancel click.
- shard 2: `messaging/conversation-paging` read "pad224 85…" as the thread's last rows (the
  pad224 spec writes the same conversation); `notification-engine/auto-reminder` received the
  PAD67 template that `blank-template-fallback` sets on the same coach, and
  `blank-template-fallback` received auto-reminder's "coming" confirmation;
  `eligibility-manual-add` and `manual-notify-selection` did not find their dialog rows.

**Shape:** two specs mutating the same coach, student or conversation *at the same time*.
**Fix:** distinct fixtures per spec (a different day, student or coach), not cleanup —
cleanup runs after the collision. **Limit of R-040's reasoning:** "a spec can only pollute
specs that sort after it" holds for `workers: 1` (the config's default); with more than one
worker, any two specs in a shard can overlap in time.
