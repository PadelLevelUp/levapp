---
id: B-140
title: "Working hours: 'add window' on an untouched day created 22:00–22:00, which the server refuses"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - settings.coach-working-hours
  - frontend/packages/config/src/availability.ts
  - frontend/apps/web/src/components/settings/WorkingHoursSection.tsx
  - frontend/apps/mobile/src/features/settings/working-hours-section.tsx
proposed_fix: "One shared addWorkingWindow() in @levelup/config, used by both editors: room after the last window, else split it around a one-hour break, else the control is disabled. Never a day rule 2 refuses."
opened: 2026-09-21T18:12:00Z
resolved: 2026-09-21T18:27:00Z
---

# B-140 — "add window" produced a window the server refuses

**Source:** Session D, 2026-09-21, while closing PAD-357's iOS verification gaps (PR #344). Flow 85
needed an invalid day and found that one tap on "add window" makes one. Ruled a defect by the
coordinator: the error path behaved to spec, and a control whose first output is refused is
still a defect. Ticket PAD-361. Number from Session D's reserved range.

**What happened:** on a day still holding the default 08:00–22:00, "add window" appended
`[end of the last window, 22:00]` = **22:00–22:00**. Save was refused with
`400 INVALID_WORKING_HOURS`, `day: "mon"` (rule 2, `start < end`).

**What should happen:** "add window" always gives a day the server accepts, the same on web and iOS.

**Evidence (all on staging 00e53375f's code, times UTC):**
- iOS, 17:58–17:59: Maestro flow 85 as first written; the backend log shows the `PUT` answered 400
  at 17:59:54, the editor showed `working-hours-error-mon`, `GET` still answered `null`.
- Web, 18:10–18:11: a Playwright probe read the new row as `22:00`/`22:00`, and the `PUT` carried
  `mon: [["08:00","22:00"],["22:00","22:00"]]` → 400, message "mon: a window is start < end on a
  15-minute grid". This observation, not the matching code, is what selected the layer: the wrong
  value first appears in the editor's click handler, before any request.
- `git log`: both handlers arrived with the feature (#338); not a regression.

**Root cause:** `settings.coach-working-hours` rule 3 describes the editor but no rule said what
"add window" produces, so each shell carried its own copy of `[last end, default end]`, which is
zero-length exactly when the day is untouched — the most common state.

**Affected specs:**
- Dev: `.specflow/specs/settings/coach-working-hours.spec.md`
- Business: `.specflow/specs-business/settings/coach-configures-preferences-and-access.business.md` (no drift: it does not describe the control)

### Change Plan

**Spec to modify:** `.specflow/specs/settings/coach-working-hours.spec.md`
**Change type:** Add rule 5 + criterion "Add window gives a day that saves".
Then: unit tests for the shared function, the web E2E test (fails on the old code), iOS flow 87, fix both editors.

### Resolution

- Spec changes: rule 5 and its criterion in `settings.coach-working-hours`.
- Tests added/modified: `packages/config/src/availability.test.ts` (6 tests, one a sweep against
  rule 2); `apps/web/e2e/settings/coach-working-hours.spec.ts` (PAD-361 test: failed on the old code
  at `Received: "22:00"`, passes on the fix); Maestro flow 87 (new); flow 85 re-triggered — the fix
  removed its way of making an invalid day, so it now pushes the morning window's end into the
  afternoon window on the iOS hour wheel, and is tagged `ios-only`.
- Code changes: `addWorkingWindow()` in `@levelup/config`; both editors call it and disable the
  control when it answers null.
- Not covered: Android has not run flows 85–87 (the PR lane runs four smoke flows only).
- Resolved: 2026-09-21 (PAD-361).
- **Reopened by review, same day (Session-B on #347, verified by a failing unit test before the
  change):** the first fix read only the LAST ROW, and the editors never sort, so
  `[[08:00,13:00],[14:00,17:30],[06:00,07:00]]` — a day the server accepts — got 08:00–22:00
  appended over the other two → 400 "windows overlap", against this entry's own claim. It also left
  an evening-only coach (20:00–22:00) with a disabled control. `addWorkingWindow` now reads the whole
  day: largest free gap less an hour's break per neighbour, else split the longest window, else
  null; null too for a day rule 2 refuses as it stands. The sweep test now starts from over 2,000
  single, multi-window and unsorted days. Shipped on #350 (the top of the stack) by the
  coordinator's ruling, so #344 and #347 were not re-pushed.

