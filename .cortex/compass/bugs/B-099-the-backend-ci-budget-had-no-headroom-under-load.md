---
id: B-099
title: "The backend CI budget of 30 minutes had no headroom: a healthy sqlite run was cancelled at 96% under runner load"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - .github/workflows/backend-tests.yaml
proposed_fix: "timeout-minutes 45 on both pytest jobs; the header states the real duration (about 10 minutes, up to ~30 under load) instead of 'about two minutes'."
opened: 2026-09-16T16:05:00Z
---

# B-099 — The backend CI budget had no headroom under runner load

**Source:** the coordinator saw #281's `pytest (sqlite, FK on)` job cancelled at exactly 30 minutes
(run 35113696732, job 104853649492, 2026-09-16 15:12:06 → 15:42:24 UTC). Session B read the log.
Bug number self-assigned from Session B's reserved range B-096..B-100 (unconfirmed).

**What happened:** the job was not stalled. Its last dot-line at 15:41:36 reported 1,728 of 1,799
tests; the cancel came 44.8 s later, while earlier gaps in the same run reached 111 s and each
72-test chunk was taking 54–100 s. The unreported tail (`test_standing_waiting_list_readd`,
`test_student_availability_blockers`, `test_verification_rate_limit`,
`test_waiting_list_offer_response`) is untouched by the PR. The postgres job on the same run
passed in 990 s.

**Why:** ten Backend-tests runs from parallel sessions were in flight 15:12–15:45. Sibling
sqlite jobs launched outside that burst took 8–10 minutes; the two launched inside it ran ~3×
slower — #283's passed in 27m30s, 91 s short of the same wall, #281's lost by 1–2 minutes.

**What should happen:** the budget is a hang detector with headroom above the slowest healthy
run, not a race the suite can lose on a busy afternoon. The workflow header said "the suite
takes about two minutes", which is the belief the 30-minute budget was sized on.

**Root cause:** the workflow's rule (30 minutes, "about two minutes") was never re-sized as the
suite grew to 1,799 tests; no rule said what the budget is for.

**Affected specs:** none (CI configuration). Related: [[ci-hang-log-forensics]] (memory) — a
cancel at the budget is read from the last dot-line's age, not assumed to be a hang.

### Change Plan

**File to modify:** `.github/workflows/backend-tests.yaml`
**Change type:** `timeout-minutes: 45` on both pytest jobs; header comment states the measured
duration and what the budget means.

### Resolution

- Code changes: `.github/workflows/backend-tests.yaml` (this PR)
- Resolved: pending merge
