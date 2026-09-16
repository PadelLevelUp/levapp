---
id: B-103
title: "E2E assertions on rendered copy: they break when a string is translated, and they can pass while the feature is broken"
type: test-defect
severity: medium
status: triaged
affects:
  - frontend/apps/web/e2e/**/*.spec.ts
  - frontend/apps/mobile/.maestro/**/*.yaml
  - frontend/apps/web/src/lib/e2e-rendered-text-scan.ts
  - frontend/apps/web/src/lib/e2e-rendered-text-backlog.ts
proposed_fix: "Assert on a data-testid and on state values (data-state / data-status / data-variant), never on copy in either language; the ratcheted guard (e2e-rendered-text-assertions.test.ts) fails on any new rendered-text assertion and on any ratchet left above its file's count."
opened: 2026-09-12T10:30:00Z
---

# B-103 — assertions on rendered copy (PAD-320)

Number from Session C's reserved range, unconfirmed (2026-09-16). Beside B-079, whose
2026-09-12 addendum first named the family.

The web app renders **Portuguese** under Playwright and the mobile app renders **English**
under Maestro. An assertion that matches visible text is therefore an assertion that the copy
never changes and that the page came up in the language the author happened to type. It has
two failure modes, and the second is the dangerous one.

## Failure mode 1 — it breaks when a string is translated

The spec is right about the product and wrong about the string. PAD-313 renamed "Present"
and the "Cancel attendance" trigger; `attendance-save`, `cancel-attendance-class-view` and
`proactive-decline` went red on a correct product. The failure surfaces in a file nobody
touched, on the day a translator does their job, and reads as a regression.

## Failure mode 2 — it passes while the feature is broken

An English literal on the Portuguese app can only match text that was **never translated**.
So the assertion is green exactly while the i18n is broken, and goes red when it is fixed:

- `attendance-save` asserted "Present" — green only because that badge had no translation.
- Maestro flow 12 asserted the English "Language preference saved." to confirm a switch **to
  Portuguese** — a check that could only pass while the switch did not work (PAD-320's report).
- `duplicate-username-warning` asserted "This email is already taken" — green because the
  message is backend English that no locale file holds (B-102).

A green run on either kind is not evidence about the behaviour it names.

## The guard, and what it cannot see

`src/lib/e2e-rendered-text-assertions.test.ts` scans both test trees, resolves every literal
against the app's own locale values in both languages (which is what separates copy from
test-created data), and ratchets a generated backlog in both directions: a new violation
fails, and a count below its ratchet fails until the ratchet is lowered. Role names
(`getByRole({ name })`, R-013 as amended by PAD-342) and bilingual `/a|b/` alternations
(PAD-322) have their own generated lists, written by the same run.

The first scanner matched only literals that were **exactly** a locale value, and the
conversions proved it was a floor: anchored regexes, trailing punctuation, substrings of a
value and interpolated copy ("2 players" against "{{count}} players") were all filed as test
data. The final slice widened the matcher for all four; the re-grown counts are the new
ratchet baseline, recorded in B-079's addendum (2026-09-16).

**Still invisible, by construction:**
- copy that is in **no** locale file — backend prose passed through verbatim (B-102), backend
  constants such as "LevelUp Assistant";
- values under three characters for the text scan ("No"), a separate open decision;
- the regex forms of `getByPlaceholder` / `getByLabel`, which the text scan does not read.

A green guard means "no assertion on copy the guard can resolve", not "no assertion on copy".

## How to convert (the pattern PAD-320's slices used)

- Prefer an existing `data-testid`; add one named for what the element **is**, never for what
  it says. Where a mobile `testID` exists for the same element, reuse its name.
- A state word is a **value**: `data-state`, `data-status`, `data-variant`, `data-block-type`
  carrying the state the label was chosen from. On a Radix trigger `data-state` is taken
  (open/closed) — use a specific attribute (`data-selected-level-id`, `data-theme-value`).
- A toast is rarely the observable: prefer the endpoint's response (registered **before** the
  action) plus the persisted effect after a reload; when the toast IS the behaviour, the
  shared Toast root carries `data-testid="toast"` and `data-variant` (TOAST_LIMIT is 1).
- Never weaken an accessibility check into a data attribute: keep "has a non-empty accessible
  name" (the recurring-icon case in `mobile-day-view`).
- Removing or renaming a test id obliges a grep of both trees.
