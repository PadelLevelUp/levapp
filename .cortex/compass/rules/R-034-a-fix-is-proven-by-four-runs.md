---
id: R-034
title: "A fix is proven by four runs, not one"
source:
  - ../../atlas/decisions/2026-09-13-adopting-unowned-work.md
governs:
  - "backend/padel_app/tests/**/*.py"
  - "frontend/apps/web/e2e/**/*.ts"
  - "frontend/apps/mobile/.maestro/**/*.yaml"
  - ".cortex/compass/bugs/*.md"
confidence: MEASURED
status: active
---

# R-034 — A fix is proven by four runs, not one

Running the fix and seeing green proves nothing on its own. A fix is proven by a 2×2 — the old
code and the new code, each with the triggering condition present and absent:

|                          | old code                        | new code                       |
|--------------------------|---------------------------------|--------------------------------|
| **trigger present**      | must FAIL — reproduces the bug   | must PASS — the fix works      |
| **trigger absent**       | must PASS — the baseline is sane | must PASS — nothing else broke |

**The two cells nobody asks for are the ones that make it conclusive.** Without the top-left,
a green after the fix proves only that the test passes, not that it ever failed or that this
change is why it passes. Without the bottom-right, you have fixed the triggering case and not
checked you kept everything else.

**A check that does not fail against the code with the defect has not been validated** — it has
never been seen catching the thing it exists to catch. Its later pass is no evidence, not a
fix. Strengthen the check, with more iterations or a different trigger, before concluding
anything from either run. A symmetrical pair of passes is the most flattering possible way to
learn nothing, because it reads exactly like a clean bill of health.

**Why:** PAD-312 reported a backend test failing; the fix (#258) changed how a seeded calendar
block derived its recurrence day. Four runs of one file settled it — old code at hour 0 UTC
failed with `assert 'invited' == 'unavailable'`, old code at a normal hour passed, the fix
passed at both. The same four runs also closed a live doubt: the seeded block still spans UTC
midnight after the fix, which is the exact shape of B-058, so the fix could have been right
about the cause and wrong about the outcome. One run answered that; left unrun it would have
shipped as a caveat.

**Four runs, one file, seconds of machine time.** The cost of doing it properly is almost
nothing, which is usually true and almost never believed.

**How to apply:**
- **Reproduce first.** "I have now seen it fail" and "I read that it fails" are different
  claims, and only the first supports a verdict. A source's report — a ticket, another
  session's PR, an unattended job — is the input to the 2×2, not a substitute for a cell.
- **Make the trigger controllable.** No time-freezing library is installed for the backend
  suite, so a clock-dependent case is reproduced by pinning the seed's own anchor (adding
  `hour=0` to an existing `.replace(...)` reproduces the 00:00–00:59 UTC window exactly) and
  restoring the tree with `git restore` afterwards. Whatever the trigger is — a clock, a
  locale, a roster size, an empty list — find the switch before you claim a cause.
- **The reproduction cell is usually seconds and sometimes is not.** Where the old behaviour
  only exists in a build — a mobile binary, a deployed image — producing it means a throwaway
  branch cut at the commit before the fix, carrying the instrument and nothing else from after
  it, plus a second CI run. That branch exists to be measured and never to be merged. Budget it
  rather than skip the cell for being unexpectedly expensive: an unrun reproduction is the one
  omission that makes the other three runs meaningless.
- **When a cell cannot be run, say which and why** rather than reporting three runs as four;
  "not run: <reason>" is the standard, and an unrun cell is an open question, not a pass.
- The scope is any change claiming to fix something: a bug fix, a flake pin, a test correction,
  a resolution written into the bug ledger.
- Rule number 34 assigned by the coordinator on 2026-09-13.
