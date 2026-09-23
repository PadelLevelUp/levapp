---
id: R-054
title: "A model column's clock default is late-bound: `default=lambda: utcnow_naive()`, never a function object"
source:
  - ../bugs/B-146-model-clock-defaults-bound-at-import-escape-the-pinned-clock.md
governs:
  - "backend/padel_app/models/**"
  - "backend/padel_app/model.py"
check:
  kind: grep
  pattern: "\\b(default|onupdate)\\s*=\\s*(?:(?:lambda\\s*:\\s*)?datetime\\.(?:utcnow|now)\\b|(?:lambda\\s*:\\s*)?(?:utcnow_naive|utcnow|func\\.now)\\b(?!\\s*\\()|(?:utcnow_naive|utcnow)\\s*\\()"
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
   The only accepted spelling is that one: `lambda: datetime.utcnow()` is late-bound but the wrong
   clock (the pin rebinds `utcnow_naive` only), and `utcnow_naive()` at class-body time is one
   instant for the process's whole life.
2. **`server_default=func.now()` stays where it is**: a server-side default is not a clock the tests
   pin and is not what the ORM writes; it is the backstop for raw SQL.
3. **The guard is a test, and it fails on the pattern, not on a name list:**
   `backend/padel_app/tests/test_pad397_clock_defaults_are_late_bound.py` greps the models for an
   import-bound clock default; `test_pad397_pinned_clock_reaches_defaults.py` calls every such
   column's default under the pin and expects the pinned instant, and proves one family through a
   real INSERT.
4. **A pinned test derives every fixture from the pinned instant** (B-100); this rule is what makes
   that possible for rows the code writes through a default.
5. **Which instrument runs the `check:` above, measured 2026-09-22.** `cortex validate` validates
   this file's *shape* only (`check.rule`) and never runs the pattern — a planted
   `default=datetime.utcnow` in `models/vacancy.py` produced no rule line in its output. The pattern
   runs in the **PreWrite hook** (`cortex hook pre-write`, JS `RegExp`, lookahead honoured) on a
   Write/Edit to a governed path: fed the same planted line it answered "R-054 may apply";
   `default=lambda: utcnow_naive()` and the same offender on a non-governed path were silent. The
   pytest guard is the enforcing instrument; the hook is the prompt at write time. Both hold the
   same pattern string, and the guard's own parametrised cases are the positive control.
6. **The `Model` mixin is in scope (PAD-405).** `backend/padel_app/model.py` declares the
   `created_at`/`updated_at` columns most models inherit, so it is governed and the guard scans it.
   Its `save()` assigns `self.updated_at = utcnow_naive()` — a call at write time, which the pin
   reaches, but which the `check:` pattern (it matches `default=`/`onupdate=` only) does not see.
   That line is held by a behavioural test instead (`test_save_stamps_the_pinned_instant`); the
   pattern is deliberately not widened to bare calls, which would sweep in every service's clock.
