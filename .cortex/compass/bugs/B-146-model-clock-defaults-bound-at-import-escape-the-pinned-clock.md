---
id: B-146
title: "Model clock defaults bound at import (`default=datetime.utcnow` / `utcnow_naive`) escape the pinned clock — a row lands on the real day beside pinned rows"
type: test-defect
severity: medium
status: resolved
affects:
  - backend/padel_app/models/*
  - backend/padel_app/tests/helpers.py
  - R-054
proposed_fix: "Every model column's clock default and onupdate becomes `lambda: utcnow_naive()` (looked up at write time); a grep guard and a per-column pinned test keep it so (PAD-397)."
opened: 2026-09-22T00:25:00Z
resolved: 2026-09-22T13:05:00Z
---

# B-146 — Model clock defaults bound at import escape the pinned clock

**Source:** test failure — `test_pad364_records_api.py::test_a_legacy_save_after_a_v2_re_rating_compares_against_the_v2_value`, red on every branch carrying it from 2026-09-22 00:00 UTC (Session-C's report from #361's sqlite job; reproduced by Session-E at 00:25 UTC: `[4.0, 5.0, 5.0] == [5.0]`).

**What happens:** `pin_clock` (B-100) pins time by rebinding the NAME `utcnow_naive` in every loaded module. A `Column(default=datetime.utcnow)` — or `default=utcnow_naive` — holds the original function object, bound at import, so a row written through that default carries the REAL instant. Inside the pinned test, a legacy row's `evaluated_at` was 2026-09-22 00:25 while the pinned v2 write was 2026-09-21 12:00: two club-days, two records, three rows. Green all day on the 21st (real clock and pinned day agreed), red every night from 00:00 UTC.

**What should happen:** every clock default a test can reach is the pinned instant; no fixture depends on the wall clock (B-100's rule).

**Root cause:** Type 7 — the test's instrument (`pin_clock`) cannot reach a function object handed to SQLAlchemy at import; 15 `default=` and one `onupdate=` across 14 model files were bound that way. Diagnosis traced at `~/levapp-wt-j3`, 2026-09-22 00:25–00:29 UTC (Phase 1: the failing test re-run; the rows' `evaluated_at` and `record_id` printed through the sequence; the column default read).

**Affected specs:** none of the domain leaves — a testing convention; governed by compass R-054.

### Change Plan
1. `EvaluationEntry.evaluated_at` → `default=lambda: utcnow_naive()` — done in PAD-364 (`89bcc2ceb`), with the test pinned before its first save.
2. The other 13 files (15 sites) the same way, keeping `server_default=func.now()` where present; no migration (a Python-side default; `flask db check` on a fresh Postgres DB at head: "No new upgrade operations detected") — PAD-397.
3. Guard: `test_pad397_clock_defaults_are_late_bound.py` greps the models for an import-bound clock default; `test_pad397_pinned_clock_reaches_defaults.py` calls every such column's default under the pin (16 cases) and proves one family through a real INSERT.
4. Compass R-054 with a `check:` grep.

### Resolution
- Tests: the two files above — 18 failed on `origin/staging`'s models (the guard listing 16 sites; every pinned case writing the wall clock), 18 passed on the fix (2026-09-22 ~13:03 UTC, sqlite).
- Code: 14 model files, `default=` / `onupdate=` late-bound; imports adjusted.
- Spec/compass: R-054 filed; this entry.
- Resolved: 2026-09-22 (PAD-397).
