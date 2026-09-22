---
id: B-150
title: "A recurring calendar block edited to a one-off kept repeating — in the feed, and in the invitation engine for a student's unavailability"
type: incomplete-rule
severity: high
status: resolved
affects:
  - calendar.blocks
  - calendar.student-blockers
  - backend/padel_app/services/calendar_service.py
proposed_fix: "edit_event_service clears recurrence_rule and recurrence_end on an explicit isRecurring:false, and leaves flag, rule and end date alone when the key is absent. The shared form layer is not touched."
opened: 2026-09-21T18:54:00Z
resolved: 2026-09-21T19:40:00Z
---

# B-150 — "one-off" on the response, weekly on the row

**Source:** Session-C, 2026-09-21, from route-level pins written for PAD-367 (number assigned by C;
ticket PAD-377, given to Session D by the coordinator: same file and family as B-139).

**What happened (reproduced by Session D with its own route-level tests, 19:25 UTC, on
feature/pad-377 before the fix; `edit_event_service` unchanged from staging 00e53375f):**
- `PUT /api/app/calendar_block/<id>` with `isRecurring: false` answered 200, `isRecurring: false`;
  the row kept `recurrence_rule` and `recurrence_end`, and its rule still expanded to all four
  Mondays. In the web UI (19:28–19:29): repeat switched off and saved → the calendar route served
  **4** occurrences, expected 1. On iOS (19:30–19:37): the same, the PUT answered 200.
- `PUT /api/app/availability_blockers/<id>`: a student's weekly "Away" reduced to one day —
  `user_is_blocked_for_window` was still True two Mondays later. They were silently skipped for
  invitations every week.
- An edit whose body OMITS `isRecurring` flipped the flag of a block still meant to be weekly
  (`_build_payload` reads `data.get("isRecurring", False)`).

**Where the wrong value first appears:** `_build_payload` sends `recurrence_rule: ""` and
`recurrence_end: ""` for a one-off; the form layer drops empty values, so `update_with_dict` never
sees them. The feed and `blocked_user_ids_for_window` expand `recurrence_rule` and never read
`is_recurring` — so the flag said one thing and everything that acts said another.

**Classification:** no rule said what an edit does to recurrence → incomplete rule. Both shells
expose the repeat switch on edit and always send the key, so it was reachable from both.

**Affected specs:**
- Dev: `.specflow/specs/calendar/blocks.spec.md`, `.specflow/specs/calendar/student-blockers.spec.md`
- Business: `.specflow/specs-business/calendar/coach-blocks-personal-time.business.md` (no drift)

### Change Plan

Add `calendar.blocks` rule 10 + criterion and the sentence in `student-blockers` rule 3; route-level
tests on BOTH edit routes first (they fail); fix in `edit_event_service` only.

### Resolution

- Spec changes: as above.
- Tests added: `test_pad377_one_off_edit_ends_the_series.py` (7): 4 failed / 3 passed on the old
  code, 7/7 on the fix, 21/21 on Postgres with the PAD-371 and PAD-160 files; 314 passed across the
  23 neighbouring files. Web `pad377-event-made-one-off.spec.ts`: old service serves 4, fix serves 1.
  Maestro flow 94: fails on the old service, passes on the fix.
- Code changes: `edit_event_service`; three test ids on web's event sheet
  (`event-detail-edit`, `event-detail-recurring-switch`, `event-detail-save` — the ids iOS has).
- NOT done here, by decision: the shared form layer / adapter (PAD-367, Session-C's); the DATA
  repair of rows already carrying a leftover rule (held by the coordinator — an absent key must not
  be read as "clear", or real weekly unavailability would be deleted).
- Session-C's pins in #354 assert the old behaviour and are flipped by this PR's author once #354 is
  on staging: three flip, the fourth keeps its rule-and-end-date assertions and changes only its
  flag assertion (the flag now stays True when the key is absent).
- Resolved: 2026-09-21 (PAD-377).
