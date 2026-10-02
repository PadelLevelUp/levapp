---
id: B-257
title: "An eligibility or wave level rule with an operation the evaluator does not know passed every student"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - backend/padel_app/services/notification_service.py
  - .specflow/specs/eligibility/rules.spec.md
proposed_fix: "Fail closed with reason `unknown_operation`; refuse an unknown level operation when eligibilityRules is saved."
opened: 2026-10-02T13:16:04Z
resolved: 2026-10-02T13:16:04Z
---

# B-257: an unknown level operation bounded nothing

**Source:** PAD-481's investigation (2026-10-02). Adding two level operations meant asking what today's
server does with one it doesn't know.

**What happened:**
- In `_group_rule_failures` (`notification_service.py`), the `attr == "level"` branch dispatched on
  the operation through `if/elif` with no `else`.
- A level rule whose operation matched none of the twelve branches recorded no failure, so the
  student passed.
- A coach's bar, a class override or an invitation-group rule holding such an operation therefore let
  everyone through: invitations, the waiting list, open spots, join requests, and the
  class-edit/impact reports all said "eligible".
- Saving accepted any operation (`update_config` and `edit_class` checked only "list or null").
- No such row existed in prod. Read-only reads by the coordinator, 2026-10-02 13:08 and 13:11 UTC,
  covered `eligibility_rules` on all three tiers and `invitation_groups`; they found only known
  operations. The defect was latent, and it would have become live the moment a newer client wrote
  a new operation to an older server.

**Rule gap:** eligibility.rules rule 6 listed the operations but never said what an unlisted one
does.

### Change Plan / Resolution (PAD-481)
- Rule 6 now says that a level rule whose operation is not among the seven fails every student with
  reason `unknown_operation`, and that saving refuses one (`400`, naming `eligibilityRules`).
- The evaluator has an `else` branch that fails closed with `reason="unknown_operation"`, in both the
  eligibility path and the wave path. The wave path's own vocabulary (five `*_vacancy` operations)
  is untouched.
- `unknown_eligibility_level_operations` guards `update_config` (`abort(400)`) and `edit_class`
  (`invalid_fields: ["eligibilityRules"]`). Invitation-group rules are not validated on save: that is
  a wider change, because old builds post those lists too.
- Tests (`test_pad481_level_direction.py`):
  - an unknown operation fails everyone, with the reason;
  - the impact scan names those students;
  - both save paths refuse an unknown operation;
  - a client's round-trip of a list holding the new operations still saves.
  These were watched red against the old evaluator, where every student passed.
- **Rollback note:** a server without PAD-481 fails open on `within_n_above_class` /
  `within_n_below_class`. The PR carries the read-only query that finds such rules.
