---
id: admin.personal-data-is-kept-only-as-long-as-needed
status: draft
implemented_by:
  - ../../specs/admin/data-retention.spec.md
---

# Personal data is kept only as long as it is needed

## Outcome

LevApp removes personal data it no longer needs on a fixed schedule, and the Privacy Policy says how
long each kind is kept (PAD-638, from the PAD-602 privacy review).

## Who This Is For

Students and coaches, whose old data does not linger; the owner, who can state real retention periods.

## User Journey

1. The owner decides a period for each kind of data.
2. The operator switches each one on; until then nothing is removed.
3. Once a day the app removes what is past its period and records what it removed.

## Business Rules

- Each kind of data has its own switch and period; all start off.
- A student a coach added who never created an account is removed only after a long quiet period, and
  only if no other coach has them.
- A deleted message keeps its place in the conversation but loses its text.
- Audit records of deletions and staff actions are kept long enough to answer a dispute.

## Success Metrics

- Every period stated in Privacy Policy §10 has a switch that is on.

## Out of Scope

- nginx log rotation on the VM (an infrastructure change).

## Notes

- OPEN: the seven periods (owner, asked 2026-10-12).
