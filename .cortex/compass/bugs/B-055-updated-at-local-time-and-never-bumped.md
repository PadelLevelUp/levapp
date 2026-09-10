---
id: B-055
title: "updated_at was written in local time by save() and never bumped by a plain commit"
type: test-defect
severity: low
status: resolved
affects:
  - backend/padel_app/model.py
  - backend/padel_app/models/token_blocklist.py
  - R-023
proposed_fix: "onupdate=datetime.utcnow on the mixin, save() stamps UTC, token_blocklist defaults naive UTC; pinned by tests."
opened: 2026-09-10T13:00:00Z
resolved: 2026-09-10T13:30:00Z
---

# B-055 — `updated_at` was local time via `save()` and never bumped by a plain commit

**Source:** data-model audit 2026-09-02, finding M13 (ticket PAD-273). Reproduced on staging
`96560cc6` on 2026-09-10.

**What happened:**
1. `Model.save()` set `updated_at = datetime.now()`, which is local time. Every other timestamp is
   naive UTC (compass R-023). On a Lisbon machine in September the value was **3600 s** off UTC,
   as measured by the new test.
2. The mixin's `updated_at` had no `onupdate`. About 34 service call sites commit directly
   instead of calling `save()`, and for those rows `updated_at` stayed at the creation time.
3. `token_blocklist.created_at` defaulted to `datetime.now(timezone.utc)`, a timezone-aware value
   written into a naive column.

**Root cause:** type 7, a correct rule without a test. R-023 already requires UTC in the backend,
but no test covered `save()`, `updated_at` or `token_blocklist`, so the drift went unseen.

### Change plan
- The mixin gets `updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)`.
- `save()` stamps `datetime.utcnow()`.
- `token_blocklist.created_at` defaults to `datetime.utcnow`.
- Tests: `test_pad273_schema_hygiene.py` checks that save() stamps UTC, that any commit bumps
  `updated_at`, and that `token_blocklist` stores naive UTC. All three failed on staging first.

### Resolution
- Code: `backend/padel_app/model.py`, `backend/padel_app/models/token_blocklist.py`. No schema
  change: `onupdate` lives in the ORM.
- Resolved in PAD-273.
