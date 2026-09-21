---
id: B-137
title: "The legacy evaluation save is not atomic: when one score fails, the scores before it stay written"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - evaluations.entries
  - backend/padel_app/services/coach_service.py
proposed_fix: "Not on the legacy endpoint without a decision — it is frozen for App Store 1.0 / 1.1.0. PAD-364's new PUT /evaluation_record is atomic from the start."
opened: 2026-09-21T18:23:53Z
---

# B-137: a save that half-happens

**Source:** found by Session-C in PAD-362 while checking a sentence it was about to write into
another ledger entry ("a refusal mid-list would leave a partial save") — the sentence was
inferred, so it was run. Linear: PAD-368. Id from Session-C's range, assigned by the Coordinator.

**What happens:** `coach_service.add_evaluation_entry_service` creates one `EvaluationEntry` per
score, and each `create()` commits. When a later score in the same body fails, the request fails
and the earlier scores are already saved; the strengths and weaknesses that follow the scores in
the same body are never reached.

**Evidence (origin/staging 00e53375f, 2026-09-21 18:23 UTC, sqlite AND Postgres; pinned on PR #346
as `test_pad362_evaluation_contract.py::test_3_a_save_is_not_atomic_the_scores_before_a_failing_one_stay_written`):**
posting `[{Forehand: 5}, {Volley: 0 as a number}]` raises `IntegrityError` (B-136's numeric 0 on
the NOT NULL `score`; `NotNullViolation` on Postgres). Afterwards Forehand holds a new `5.0` and
Volley holds nothing.

**The observation that selected the type:** `evaluations.entries` has rules about what a save
writes (rules 6–7) and none about what a failed save leaves behind. The code does something
definite and nobody chose it.

**Why it matters more than it looks:** today the only known ways to make a score fail are B-136's
numeric 0 and a non-numeric string. The moment anyone adds validation to this endpoint — B-126's
range check — a partial save becomes an everyday outcome, on clients that post every category in
one body and ignore the response (App Store 1.0 / 1.1.0).

### Change Plan

**Not fixed, on purpose.** `/add_evaluation_entry` is frozen while those builds live. Wrapping it
in one transaction changes what they leave behind after a failure (nothing, instead of some of
it) — arguably better, still a behaviour change on a frozen endpoint, so Session-B / the owner
decide. The PAD-362 pin fails by design if it changes.

- PAD-364's `PUT /evaluation_record` is one transaction from the start, with a test that a failing
  rating writes nothing.
- B-126's range check never lands on the legacy endpoint (its own entry says why; this is the
  evidence behind that sentence).

### Resolution

_Open._
