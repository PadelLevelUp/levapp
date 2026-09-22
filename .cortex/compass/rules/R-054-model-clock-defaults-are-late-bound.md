---
id: R-054
title: "A model column's clock default is late-bound: `default=lambda: utcnow_naive()`, never a function object"
source:
  - ../bugs/B-146-model-clock-defaults-bound-at-import-escape-the-pinned-clock.md
governs:
  - "backend/padel_app/models/**"
check:
  kind: grep
  pattern: "(default|onupdate)\\s*=\\s*(datetime\\.utcnow|datetime\\.now|utcnow_naive|utcnow)\\b(?!\\s*\\()"
  expect: absent
confidence: MEASURED
status: active
---

# R-054 — A model column's clock default is late-bound

Number from Session-E's reserved range (R-054–055), used for the Coordinator's PAD-397 brief of 2026-09-22.

The tests pin time with `pin_clock` (`backend/padel_app/tests/helpers.py`, B-100), which rebinds the
**name** `utcnow_naive` in every loaded module. A `Column(default=<function object>)` —
`datetime.utcnow`, `datetime.now`, or `utcnow_naive` itself — holds the original function and never
sees the pin. The consequence was measured on 2026-09-22 (`test_pad364_records_api`): a row written
through such a default landed on the **real** day's record beside rows written at the pinned instant,
red every night from 00:00 UTC and green all day.

1. **Every clock default and `onupdate` on a model column is `lambda: utcnow_naive()`** — looked up
   at write time, so the pin reaches it. The instant written in production is unchanged (naive UTC).
2. **`server_default=func.now()` stays where it is**: a server-side default is not a clock the tests
   pin and is not what the ORM writes; it is the backstop for raw SQL.
3. **The guard is a test, and it fails on the pattern, not on a name list:**
   `backend/padel_app/tests/test_pad397_clock_defaults_are_late_bound.py` greps the models for an
   import-bound clock default; `test_pad397_pinned_clock_reaches_defaults.py` calls every such
   column's default under the pin and expects the pinned instant, and proves one family through a
   real INSERT.
4. **A pinned test derives every fixture from the pinned instant** (B-100); this rule is what makes
   that possible for rows the code writes through a default.
