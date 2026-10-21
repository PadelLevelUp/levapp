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

1. The owner decided a period for each kind of data (2026-10-21).
2. Those periods are the defaults; the operator can change a period, switch an item off or keep it.
3. Once a day the app removes a bounded amount of what is past its period and logs what it removed;
   what is left goes the next day.

## Business Rules

- Invitations, join links and expired verification or reset codes go 30 days after they expire.
- Notification and reminder history goes after 12 months.
- Audit records of deletions and of staff actions go after 5 years; until then nothing changes them.
- A student a coach added who never created an account is never deleted by the schedule (owner);
  the coach removes them.
- A deleted message keeps its place in the conversation forever; its text is erased when it is
  deleted.
- Web server access logs rotate after about 14 days.

## Success Metrics

- Every period stated in Privacy Policy §11 is the period the daily job applies.

## Out of Scope

- Changing the nginx rotation (already 14 generations on the VM).

## Notes

- Owner, 2026-10-21 (PAD-638 comment): the periods above. Owner, 2026-10-13: never-activated
  students are never deleted. The policy section is §11 since PAD-649 renumbered §9–§15 (the
  ticket says §10).
