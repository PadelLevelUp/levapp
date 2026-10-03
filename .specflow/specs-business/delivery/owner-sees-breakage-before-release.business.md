---
id: delivery.owner-sees-breakage-before-release
status: draft
implemented_by:
  - ../../specs/delivery/pr-e2e-subset.spec.md
---

# The owner sees a broken screen on its change, not at the release

## Outcome

When a change breaks one of the web app's tested flows, whoever opened the change sees it on that
change, within minutes, before it is merged. Today the full browser test suite only runs at the
release gate, hours later, where one broken check (B-282, 2026-10-02) held a production release for
an hour. Catching it on the change keeps releases on time and puts the fix with the person who has
the context.

## Who This Is For

The owner and every session that opens a change into `staging`; indirectly coaches and students,
who get releases that are not held back.

## User Journey

1. A change into `staging` is opened or updated.
2. A check runs only the browser tests that exercise what the change touched, and says how many
   of all the tests it ran and why each was picked.
3. If one fails, the check shows which, and whether it also fails on its own (a real break) or
   only after other tests (a test-order problem, not the change's fault).
4. The change author fixes a real break before merging; the full suite still runs at the release.

## Business Rules

1. The check is advisory: a failure is shown on the change and never blocks the merge. Making it
   blocking is the owner's decision, after two weeks with no false alarm.
2. It never replaces the full suite at the release gate.
3. It stays short: a typical change runs in a few minutes, the largest in about twenty.
4. A test known to fail for reasons unrelated to the change (a recorded bug) is left out until
   that bug is fixed, unless the change edits that test.

## Success Metrics

- A broken tested flow is seen on its change, not at the release gate.
- No false alarm in the first two weeks (a failure that passes on its own or is unrelated to the
  change).

## Out of Scope

- Backend-only changes (the backend test lanes cover them).
- The iOS and Android apps (their own lanes).

## Notes

- Design and phase-0 measurements: PAD-511, PR #534.
