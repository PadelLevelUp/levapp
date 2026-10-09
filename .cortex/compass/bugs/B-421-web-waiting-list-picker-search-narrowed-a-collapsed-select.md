---
id: B-421
title: "Web add-to-waiting-list dialog: the name search narrowed a collapsed native select's options, so typing visibly changed nothing beside a second control that duplicated it"
type: test-defect
severity: medium
status: resolved
resolved: 2026-10-09T20:57:00Z
affects:
  - calendar.event-detail
  - frontend/apps/web/src/components/calendar/ClassWaitingListSection.tsx
  - frontend/apps/web/src/components/calendar/ClassWaitingListSection.search.test.tsx
  - frontend/apps/web/e2e/notification-engine/class-waiting-list.spec.ts
proposed_fix: "The web picker renders the offered students as a list of rows (as iOS does), the search above it; no native select. The unit test and the Playwright spec assert the visible rows, not hidden option elements."
opened: 2026-10-09T18:55:00Z
---

# B-421: the web waiting-list picker's search narrowed a collapsed select (id unconfirmed, wave-13 range)

**Source:** PAD-560 item 1 (owner report, 2026-10-09): "a search bar that does not work, and a
dropdown below it that duplicates the search bar".

**What happens:** `AddToClassWaitingListDialog` (PAD-558, fee2ff7f9) put a search `Input` above a
native `<select data-testid="class-waiting-list-player">`. The search does filter: it narrows the
`<option>` elements the select holds. But a collapsed select shows only its chosen value, so typing
changes nothing the coach can see, and the dropdown next to it is the actual picker — two controls
for one choice, one of them apparently dead.

**What should happen:** calendar.event-detail rule 20: "a name search above the list". One search
field, one visible list of the offered students that narrows as the coach types (what iOS already
renders: `class-waiting-list-candidate-<id>` rows).

**Evidence (code reading + the existing test; not reproduced in a browser):**
- `ClassWaitingListSection.tsx` 208–245 on 4757c13d9: `<Input data-testid="class-waiting-list-search">`
  then `<select data-testid="class-waiting-list-player">` whose options are `offered.map(...)`.
- `ClassWaitingListSection.search.test.tsx` passes on 4757c13d9 (2 tests, 2026-10-09 19:52 local):
  its `offered()` helper reads the select's `option` elements, so it proved the filter and never
  asked whether the coach could see the result. The Playwright spec (lines 80–88) asserts the same
  hidden options.
- The handoff's "section mounted twice" hypothesis is wrong: one mount per app —
  web `ClassDetailSheet.tsx:1798`, iOS `app/class/[id].tsx:1700`. The duplication is inside the dialog.

**Root cause:** type 7 (test-defect). Rule 20 and its criterion ("only Álvaro Sousa is offered")
are right; the tests encoded "offered" as hidden `<option>` elements, so a picker that showed
nothing on search passed them.

**Affected specs:**
- Dev: `.specflow/specs/calendar/event-detail.spec.md` rule 20
- Business: `.specflow/specs-business/notifications/coach-fills-vacancies-automatically.business.md` (unchanged)

### Change Plan

**Spec:** calendar.event-detail rule 20 — say the picker is a list of rows on both shells, the
search above it, with no second control.
**Tests:** rewrite the web unit test's `offered()` to read `class-waiting-list-candidate-<id>` rows;
the Playwright spec clicks a candidate row instead of `selectOption`; `class-waiting-list-player`
is removed, so grep e2e + maestro for it (none on iOS).
**Code:** web `AddToClassWaitingListDialog` renders the offered rows as buttons, the chosen one
pressed, with the ineligibility reasons inline as iOS does.

### Resolution
- Spec changes: `calendar.event-detail` rule 20 (one search above a list of rows, no second control) and its criterion; rule 19 (scope per row, PAD-560).
- Tests: `ClassWaitingListSection.search.test.tsx` rewritten to assert the visible rows and that no select exists; `e2e/notification-engine/class-waiting-list.spec.ts` clicks a candidate row and asserts the row count under search.
- Code: web `AddToClassWaitingListDialog` renders the offered students as buttons (`class-waiting-list-candidate-<id>`, `aria-pressed`), ineligibility reasons inline; the `<select>` and `waitingListPickStudent` are gone.
- Verified: unit test 3 passed; Playwright spec 1 passed (37.6 s) on an isolated DB at d4a899c87, 2026-10-09 20:57 WEST.
- Resolved: 2026-10-09 (PAD-560 part A).
