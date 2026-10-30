---
id: B-712
title: "Opening a class's never-filled spots re-read every student's facts for every spot and group, so one engine tick cost minutes of processor time and starved the app"
type: missing-criterion
severity: high
status: triaged
affects:
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
proposed_fix: "invitations rule 12a: the facts the eligibility bar and the group rules read (the coach's occurrence set, unjustified-absence and make-up counts, the level ladder) are read once per evaluation for the whole roster, not once per student; the per-student evaluator stays for callers without the bundle."
opened: 2026-10-30T09:50:00Z
---

# B-712: opening many spots re-read every student's facts for every spot and group

**Source:** Linear PAD-788 (High), from Session H's read-only reading of production on 2026-10-29:
at each class start of a coach with a 16-place class nobody had joined, the engine opened next
week's 16 never-filled spots and the machine's processor stayed saturated for several minutes, during
which the app answered coaches slowly. Expiring the old spots cost nothing; opening them was the cost.

**What happens:** the first 2-minute engine tick after the spots open evaluates every spot against
every invitation group, and inside each evaluation the eligibility bar (unjustified absences) and the
`has_makeups` and level-step rules query the database once per roster student. The absence and
make-up counts also reload the coach's whole set of occurrences on every call.

**What should happen:** an evaluation reads each of those facts once for the whole roster, as PAD-276
already did for the roster, the availability blockers and the ranking (rule 12).

**Root cause:** rule 12 (PAD-276) says a wave costs a bounded number of statements whatever the
roster size, but its criterion and test used the default groups only (level and side). The rules
that read per-student facts were never batched, and no criterion covered them. That makes it a
missing criterion: the rule is right, and a case it governs had no Given/When/Then.

**Evidence (local, reproducible):** `backend/scripts/opening_cost_probe.py --students 166
--prod-shape --history 0 --past-instances 347 --ticks 7`. This is a 166-student roster with 2 active
accounts, eight invitation groups using level, side, `has_makeups` and account status, a bar of fewer
than 3 unjustified absences, 3 simultaneous and 5 total invitations, 363 occurrences on the coach's
books, and one class with 16 free places, on the staging engine. The first tick issued 24,668 SQL
statements: `coach_instance_ids` 13,280, `_unjustified_absence_count` 5,312, `get_level_ladder`
2,688, `makeups_owed_for` 2,656. It took 30.4 s of Python CPU and 30.2 s inside SQL on a developer
laptop, and sent 0 invitations; the next tick sent 5, all at round 4. That is the same pattern
production showed: nothing for ten minutes, then 5 invitations from one round, which is what one long
tick looks like on a small shared-core machine. 16 spots × 8 groups = 128 evaluations, each with
about 190 statements on a 166-student roster.

**Affected specs:**
- Dev: `.specflow/specs/notifications/invitations.spec.md` (rule 12, new rule 12a)
- Business: `.specflow/specs-business/notifications/coach-fills-vacancies-automatically.business.md`

### Change Plan

**Spec to modify:** `notifications.invitations`.
- Add rule 12a: the facts a rule reads are read once per wave.
- Add the criterion "A wave whose rules read per-student facts costs the same for a big roster (rule 12a, PAD-788)".

**Then:**
1. `test_pad788_rule_facts_cost.py`: statements at roster 20 vs 40 over every group (red before the fix: 322 vs 610), plus the verdicts against the per-student evaluator.
2. `_RosterFacts` in `notification_service.py`, read lazily and built once per `evaluate_candidates`. `makeups_owed_for` and the new `_unjustified_absence_counts_for` take the occurrence ids, and the level-step helpers take the ladder.
3. Re-run the probe and check the same outcome before and after (invitations, round, spots, students).

### Resolution

(pending)
