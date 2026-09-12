---
id: B-081
title: "A filled vacancy kept inviting: three of four closers left live invitations, and one retired nothing at all"
type: incomplete-rule
severity: high
status: triaged
affects:
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/services/class_join_request_service.py
  - .specflow/specs/notifications/invitations.spec.md
proposed_fix: "Close every vacancy through _close_vacancy, which retires every non-terminal invitation and its message; make the sibling broadcast work from the list that close returns."
opened: 2026-09-12T10:05:00Z
---

# B-081 — A filled vacancy kept inviting

**Source:** found by Session G reviewing PR #241 (PAD-313), asking whether the bug in front of
it was an instance or a class. The reviewed fix introduced `_close_vacancy` for one caller; the
question was what the other callers did.

**What happens:** a spot is taken, and candidates are still invited to it — or still hold a
live "A spot opened up" message with working Yes/No buttons for a class that is full.

**What should happen:** when a vacancy is filled, every invitation still offering it stops
being live, on every path, in every non-terminal state.

**Root cause:** four paths closed a vacancy, each in its own hand-written way, and none of the
four agreed with the others:

| Path | Sets `filled` | Retires events | Retires the invite message |
|---|---|---|---|
| `respond_to_notification` (student accepts) | inline | `sent` only | via the broadcast |
| `coach_respond_to_notification` (coach accepts for them) | inline | `sent` only | **no** |
| `_fill_from_waiting_list` (waiting-list placement) | inline | **nothing** | **no** |
| `class_join_request_service` (coach accepts a request) | inline | `sent` only, via the broadcast | via the broadcast |
| `reconcile_vacancies` (capacity) | `_close_vacancy` | `sent` + `queued` | yes |

Two consequences are live in production (`origin/main` carries the same shape, checked
2026-09-12):

1. **A `queued` invitation survives every close but the reconciliation's.** `queued` is a
   non-terminal state in the `notification_event_status` enum; the two-minute tick sends it
   *after* the close, so a candidate is invited to a seat that is already taken.
2. **A waiting-list placement retires nothing at all.** Every invitation for that seat stays
   live in its candidates' inboxes, and one of them can still accept a spot that no longer
   exists — the accept then hits the capacity guard and the student is told the spot is filled,
   which is the "why was I invited then?" the founders' report describes from the other side.

The class of defect, not the instance: one fact — "this vacancy is taken" — written in four
places, so a fifth writer (or a fifth event state) is one omission away from the same bug.

### Change Plan

**Spec:** `notifications.invitations` — a new rule stating that a vacancy is closed in exactly
one place and that closing retires every non-terminal invitation and its message.

1. `_close_vacancy(vacancy, filled_by_player_id, *, except_event_id=None, now=None) -> list` is
   the only writer of `status = "filled"`; it retires every event in
   `LIVE_INVITATION_STATES` and returns them.
2. All four callers go through it. `_broadcast_spot_filled` takes that list, because rows the
   close has expired can no longer be found by a query for live ones.
3. One test per caller, asserting no event survives in a live state and no invite message stays
   actionable, in both `sent` and `queued`.

### Resolution

- Spec: `notifications.invitations` rule 15 (PAD-317) — 14 is PAD-303's, open on PR #228.
- Code: the four closers consolidated; `_broadcast_spot_filled` works from the returned list and
  its own fallback query no longer misses `queued`.
- Tests: `backend/padel_app/tests/test_pad317_one_vacancy_close.py` — six, red before, green after.
- Resolved: 2026-09-12 (PAD-317).
