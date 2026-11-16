---
about: "The E2E seed dated the validation fixture by a Monday-based previous week, so on Sundays the validate view's Last week was empty"
permanence: stable
verified: "2026-11-15 (observed)"
origin:
  - commit:37ee05b06
need:
  - frontend/apps/web/e2e/scripts/seed_dates.py
  - frontend/apps/web/e2e/scripts/test_seed_dates.py
aliases:
  - 2026-11-15-e2e-validation-fixture-missed-the-apps-sunday-weeks
---

# The E2E validation fixture missed the app's Sunday-start weeks

**Source:** the attendance stream, 2026-11-15 (a Sunday). PR #987's "E2E subset" lane went red. It
is a sibling of [[2026-11-01-week-specs-failed-on-sundays]], which fixed the same mismatch in the
calendar specs but not in the seed.

**What happened:** six tests failed with `presences-class-card` not found, while the validate dialog
showed "Last week" with no pending classes. The failures were `pad442-completed-class-stays`,
`pad443-validation-highlight` and four in `presences-validation.spec.ts` (PAD-140 silent player,
PAD-140 validating a class, PAD-191 bulk run, PAD-413 two quick undos). They fail on Sundays only,
on any branch, since PAD-682 moved the app's week start to Sunday. Nothing in the PR caused them.

**What should happen:** "E2E Validation Class" sits in the week before the current app week on every
weekday, which is the week the specs open with the previous-week control (or `week=-1`).

**Root cause:** a test defect. `seed_dates.py` dated the fixture from
`prev_monday = today - (today.weekday() + 7)`, plus 2 and 3 days for Wednesday and Thursday. That is
a Monday-based previous week. The app's weeks start on Sunday (`calendar.view` rule 5a). On Monday to
Saturday the two give the same Wednesday and Thursday. On a Sunday the Monday-based previous week
began 13 days earlier, so the fixture landed two app weeks back. `test_seed_dates.py` asserted
against the same Monday-based week, so it could not catch this.

**Evidence:** a 2x2 run on the real clock, Sunday 2026-11-15, on an isolated E2E stack:
- Old seed: 6 failed, 6 passed. The failures were the same six as CI. The app asked for
  `pending_validation?from=2026-11-01&to=2026-11-07`, which is week -2; the fixture was on 4 and 5 Nov.
- New seed: all 12 tests that read the fixture passed (pad442, pad443, the 8 presences-validation
  tests, `dashboard/validation-count`).
- Not this defect: `semi-auto-approval` US-NSA-01 and 02 failed on both seeds. That is the engine
  stream's separate Sunday race in the spec's `openClassDetail`.
- The new seed test fails on the old seed for Sunday only. The old and new seeds give field-by-field
  identical dates for Monday to Saturday.
- A run with only `E2E_SEED_TODAY` set to a weekday proves nothing here. These specs do not call
  `pinBrowserToE2eToday`, so the browser stays on the real date while the seed moves.

### Resolution
- **Code:** `seed_dates.py` dates the fixture from the previous Sunday-start week:
  `prev_sunday = today - ((today.weekday() + 1) % 7 + 7)`, plus 3 and 4 days at 11:00. The lesson
  starts on that Wednesday.
- **Test:** `test_seed_dates.py` measures "earlier weeks" against the Sunday-start week. A new test,
  `test_validation_classes_sit_in_the_apps_last_week`, walks all seven weekdays and asserts that the
  fixture is inside the previous app week.
- **Not changed:** the other Monday arithmetic in the specs (next Monday, this week's Monday)
  computes future dates and is not this defect.
- Resolved: 2026-11-15 (commit 37ee05b06).

```yaml
type: test-defect
severity: medium
status: resolved
affects:
  - calendar.view
  - attendance.validation
  - frontend/apps/web/e2e/scripts/seed_dates.py
  - frontend/apps/web/e2e/scripts/test_seed_dates.py
proposed_fix: "Date every seed fixture that means 'last week' or 'this week' from the app's Sunday-start week (calendar.view rule 5a), and assert it in test_seed_dates.py across all seven weekdays."
resolved: "2026-11-15"
```
