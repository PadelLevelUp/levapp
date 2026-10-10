---
id: B-442
title: "E2E pending-confirmations.spec counts the invitations the engine sweep adds on the seeded tomorrow class, so it reds after any run of two minutes or more"
type: incomplete-rule
severity: low
status: resolved
affects:
  - delivery.pr-e2e-subset
  - frontend/apps/web/e2e/dashboard/pending-confirmations.spec.ts
  - frontend/apps/web/e2e/scripts/seed.py
  - backend/padel_app/helpers/dashboard/pending.py
proposed_fix: "Seed the pending class with no open Vacancy, or make the spec count the seeded pair only (its own class, or a filtered reply)."
opened: 2026-10-09T20:00:00Z
resolved: 2026-10-10T02:30:00Z
---

# B-442: pending-confirmations.spec reds after any run of two minutes or more

**Source:** Session C's Playwright run for PAD-570 (#602, a319a8cd5), 2026-10-09, isolated DB,
workers=1. "PAD-78: manual notify reaches only the still-pending students" expected `sent: 2`.

**The 2×2 that separated pollution from code:**

| Before the spec | Result |
|---|---|
| nothing (fresh reseed) | 3/3 passed |
| `dashboard/needs-you-deep-links` (~50 s) | 5/5 passed |
| `attendance/pad288-early-cancellation` (staging's own, ~1.1 min) | received 4 |
| `attendance/pad570-vou-after-reminder` (~1.6 min) | received 6 |
| nine specs (~3.7 min) | received 9 |

The count follows the time elapsed, not the spec: the E2E Flask starts the scheduler, whose
invitation sweep (`process_invitation_batches`, every two minutes) fans out further `sent`
NotificationEvents on the seeded "E2E Pending Confirm Class" (tomorrow, which carries an open
vacancy), and `_pending_pairs` counts every `sent` event on tomorrow's classes.

**Why incomplete-rule:** the spec's premise — "2 seeded students are pending for tomorrow" — holds
only until the first sweep; nothing in the seed or the spec pins the pending set against the
engine. CI's shard order happened to run it early.

**Fix (not applied in #602, by the coordinator's instruction; Linear PAD-597, Low):** the seeded
pending class carries no open Vacancy, or the spec counts the seeded pair only.

### Resolution (PAD-597, 2026-10-10)

The seeded pending-confirm instance carries `auto_invites=False` (`e2e/scripts/seed.py`), so the
never-filled-places scan skips it; manual notifications check `notifications_enabled` only, so the
notify endpoint still reaches the two pending fillers, and the class keeps its open spots for
`class-join-request.spec` and `open-spot-visibility.spec`. Rule 7a and a criterion added to
`delivery.pr-e2e-subset`. Filling the class instead was rejected: those two specs need its free
places; asserting `sent` against the dashboard's pending count was rejected as tautological (both
read `_pending_pairs`).
