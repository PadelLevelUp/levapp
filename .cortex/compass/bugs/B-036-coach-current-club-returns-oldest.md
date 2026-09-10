---
id: B-036
title: "Coach.current_club returns the oldest club, not the most recently joined"
type: missing-criterion
severity: medium
status: resolved
affects:
  - clubs.crud
  - backend/padel_app/models/coaches.py
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "Pick the coach_in_club row with the latest created_at (undated rows count as oldest, ties to the higher id) instead of clubs[-1]; add the missing clubs.crud criterion and make rule 3 independent of how the database orders NULLs."
opened: 2026-09-10T10:20:00Z
resolved: 2026-09-10T10:20:00Z
---

# B-036 — Coach.current_club returns the oldest club, not the most recently joined

**Source:** 2026-09-02 data-model audit, finding M3, re-verified 2026-09-10 and filed as PAD-266.

**What happens:** a coach who belongs to two clubs gets the club they joined FIRST as their
current club. Every club-scoped route (`require_club` in `modules/frontend_api.py`, `GET
/api/app/coach`, the claim-request serializer) resolves through it, so new classes and players
would land in the old club.

**What should happen:** the most recently joined club is current (`clubs.crud` rule 3, and the
business spec: "whichever one they joined most recently is their default working context").

**Root cause:** Type 1 — missing acceptance criterion. Rule 3 exists and is correct, the business
layer agrees, but no criterion covers it and no test exercises a coach with two clubs, so the
property has taken `self.clubs[-1]` over a `desc(created_at)` relationship since the original
implementation (`git log -S "clubs[-1]"` → 7c59e1cb). Masked because every coach has one club.

**Evidence (observed, scratch test on SQLite, 2026-09-10):**
1. Old Club joined 2026-01-01, New Club joined 2026-09-01 → relationship order `[New, Old]`,
   `current_club` = **Old Club**.
2. `coach_in_club.created_at` is nullable (initial migration `e5442f6c568d`). SQLite sorts NULL
   last in a DESC order, Postgres sorts it FIRST — so the audit's one-character fix
   (`clubs[0]`) would make an undated legacy row the "most recent" club in production. Rule 3
   therefore also needs to say how an undated membership ranks.

**Affected specs:**
- Dev: `.specflow/specs/clubs/crud.spec.md` — rule 3 precision + one criterion.
- Business: `.specflow/specs-business/clubs/coach-runs-a-club-and-its-team.business.md` — unchanged
  (already says "joined most recently"); no drift.

### Change Plan

**Spec to modify:** `.specflow/specs/clubs/crud.spec.md`
**Change type:** add acceptance criterion (+ rule 3 precision)

1. Rule 3: the `coach_in_club` row with the latest `created_at`; an undated row counts as the
   oldest; ties go to the higher `id`; never dependent on the database's NULL ordering.
2. Criterion "Current club is the most recently joined".
3. Test `backend/padel_app/tests/test_pad266_current_club.py` — must fail before the fix.
4. Fix `Coach.current_club` in Python over `clubs_relations` (no relationship-order change).
5. Regression: backend suite, `e2e/clubs` + `e2e/settings`, tsc web + mobile.

### Resolution

- Spec changes: `.specflow/specs/clubs/crud.spec.md` — rule 3 precision (undated = oldest, ties to the
  higher id, independent of the database's NULL ordering) and criterion "Current club is the most
  recently joined".
- Tests added: `backend/padel_app/tests/test_pad266_current_club.py` (7; 5 failed on the unfixed code).
  An explicit `created_at=None` is stamped with `utcnow` by the model mixin's Python-side default, so
  the helper writes a real NULL with an UPDATE to reproduce legacy rows.
- Code changes: `Coach.current_club` ranks `clubs_relations` in Python by
  `(created_at is not None, created_at, id)` instead of taking `clubs[-1]`; the relationship order and
  the `clubs` property are unchanged.
- Verified: backend suite 1062 passed; Playwright `e2e/clubs` + `e2e/settings` 96 passed; tsc web and
  mobile clean.
- Resolved: 2026-09-10 (PAD-266).
