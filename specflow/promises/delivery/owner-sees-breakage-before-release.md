---
id: P-DELIVERY-4
title: "The owner sees a broken screen on its change, not at the release"
status: draft
---
# The owner sees a broken screen on its change, not at the release

## Outcome

When a change breaks one of the web app's tested flows, whoever opened the change sees it on that change within minutes, before it is merged, instead of at the release gate hours later (PAD-511).

- The check is advisory: a failure shows on the change and never blocks the merge. Making it blocking is the owner's decision, after two weeks with no false alarm.
- It never replaces the full suite at the release gate.
- A typical change runs in a few minutes, the largest in about twenty.
- A test known to fail for an unrelated, recorded bug is left out until that bug is fixed, unless the change edits that test.

It does not promise this check for backend-only changes or the iOS and Android apps, which have their own lanes.
