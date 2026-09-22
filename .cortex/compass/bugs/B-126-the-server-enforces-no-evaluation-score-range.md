---
id: B-126
title: "The server enforces no evaluation score range although the spec says it does"
type: test-defect
severity: medium
status: triaged
affects:
  - evaluations.entries
  - backend/padel_app/services/coach_service.py
  - backend/padel_app/services/import_service.py
proposed_fix: "Range check on the NEW write endpoint only (PAD-364's PUT /evaluation_record). Never on /add_evaluation_entry while App Store 1.0 / 1.1.0 live."
opened: 2026-09-21T18:22:40Z
---

# B-126: any number is a score

**Source:** read from code by Session-E (static, `evaluations-current-state.md` §0.4), never run.
Reproduced by Session-C in PAD-362 before filing. Id reserved from Session-B's range.

**What happens:** `evaluations.entries` rule 4 — "Score must be within category's
scale_min/scale_max range". Only the client controls enforce it (web slider, iOS stepper). The
server writes whatever number arrives, and so does the import.

**Evidence (origin/staging 00e53375f, 18:19 UTC sqlite and 18:21 UTC Postgres,
`test_3_the_server_enforces_no_score_range`):** on a 0–10 category, `value: 99`, `value: -3` and
`value: 2.5` each answer 200 and are written; `/player_profile` then serves `score: 2.5`. Seen
while probing, not pinned: a non-numeric string (`"abc"`) is an unhandled `ValueError`, not a 400.
The import's `float(value)` has no range check either (`import_service.py`, read, not run with an
out-of-range value).

**The observation that selected the type:** the rule exists and is right; no criterion under it
and no test ever exercised the server side, so the gap went unseen. Walked to step 4–5 of the
tree: rule correct, criterion and test missing. Filed as `test-defect` (missing test) because the
criterion PAD-362 appends states today's behaviour, not the rule's.

**What should happen:** a score outside the category's scale is refused.

### Change Plan

**Not fixed in PAD-362, on purpose.** App Store 1.0 / 1.1.0 post every category, the unrated
ones at a midpoint they compute themselves. A range check on `/add_evaluation_entry` could start
refusing that body — and the save is not atomic: observed on sqlite and Postgres (18:23 UTC,
`test_3_a_save_is_not_atomic_the_scores_before_a_failing_one_stay_written`), when one score fails
the scores before it in the same body are already committed. A refusal mid-list would leave a
partial save on a client that ignores the response.

- The range check lands on the NEW write endpoint only — PAD-364's `PUT /evaluation_record`
  (Session-B's decision 2026-09-21). `/add_evaluation_entry` stays as it is while those builds
  live; the PAD-362 pin keeps it that way.
- Whether the import should refuse or clamp is PAD-364's spec to say.
- Out-of-range rows already on production: Session-E's prod counts query reports them.

### Resolution

_Open — resolved by PAD-364._
