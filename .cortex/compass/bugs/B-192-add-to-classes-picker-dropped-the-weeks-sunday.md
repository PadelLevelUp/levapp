---
id: B-192
title: "The \"Add to classes\" picker never listed a class on the week's Sunday (date-only `to` read as Sunday 00:00)"
type: missing-criterion
severity: high
status: resolved
affects:
  - players.profile
  - backend/padel_app/modules/frontend_api.py
  - frontend/apps/web/src/components/players/detail/AddToClassesDialog.tsx
  - frontend/apps/mobile/src/features/players/add-to-classes-dialog.tsx
proposed_fix: "GET /api/app/lesson_instances reads a date-only `to` as the end of that day; a full timestamp keeps its meaning."
opened: 2026-09-29T14:23:00Z
resolved: 2026-09-29T14:23:00Z
---

# B-192: the "Add to classes" picker dropped the week's Sunday

**Source:** Session-C, diagnosing PAD-466 (2026-09-29). The ticket asked why the PAD-439 E2E fails on Mondays. The probe for that question showed a real Sunday class missing from the picker. (B-188's text mentions an earlier "B-192" that was never filed; this is the first entry with this id.)

**What happens:** a coach opens a player's profile, then "Add to classes". A class on the week's Sunday at any time after 00:00 is not offered, on web, on iOS, or on the App Store builds already installed. The calendar shows it, but the picker never lists it, so the player cannot be added to it from there.

**What should happen:** `players.profile` rule 5 lists "every non-cancelled instance in the selected week", and that includes its Sunday.

**Root cause (observed):**
- Every picker sends the week as date-only bounds: `to = format(endOfWeek(weekStart), "yyyy-MM-dd")`. The callers are:
  - web `AddToClassesDialog.tsx:61-63`;
  - iOS `add-to-classes-dialog.tsx:93-96`;
  - the App Store builds `6b48f79e3` and `6f5d0c1ce` (`add-to-classes-dialog.tsx:75`).
  All of them go through `packages/api` `classes.ts:22`.
- `get_lesson_instances` parsed that as Sunday **00:00** (`frontend_api.py`, `parser.isoparse(end)`), and both loaders filter `start <= range_end` (`calendar_helpers.py`: instances, and virtual occurrences through `occurrences_between`).
- The calendar is unaffected, because its clients send `…T23:59:59`. `/calendar` has the same parse and is safe only by that client convention.

**Evidence:**
- On an isolated stack with `E2E_SEED_TODAY=2026-09-28` (Mon), "E2E Upcoming Class" is in the DB at Sun 2026-10-04 09:00 (id 14). Yet the picker's `?from=2026-09-28&to=2026-10-04` answered only the Thursday and Tuesday classes.
- With the fix, the same probe lists id 14.

**Why the criterion was missing (Type 1):** rule 5 already promised the whole week. No criterion placed a class on the week's last day, and no backend test called the route.

**Caller audit** (before choosing the server-side fix): no caller relies on the exclusive reading.
- Every client call sends a date-only `to` meaning "through Sunday".
- The App Store endpoint lists (`ep_*.txt`) miss this route, because its query string is inside a template literal. The builds' source was read instead.
- No backend test hit the route. The E2E spec mocks it.

### Change plan (executed)
- `players.profile` rule 5: the week runs through its Sunday, and a date-only `to` is the end of that day.
- New criterion: "The picker offers the week's Sunday classes (B-192)".
- `backend/padel_app/tests/test_b192_week_picker_includes_sunday.py`, red first on staging `0e40e3a6`: the one-off Sunday class and the weekly series' Sunday occurrence both failed. It has two controls: a Monday 00:00 class stays out, and a full-timestamp `to` keeps its meaning.
- `frontend_api.py` `get_lesson_instances`: `re.fullmatch(r"\d{4}-\d{2}-\d{2}", end)` becomes `…T23:59:59.999999`, before the same parse. The fix is on the server, so the installed App Store clients are fixed too.

### Resolution
- Backend: 4 passed on the fix (2 failed and 2 passed on staging).
- E2E probe (Monday seed): the picker's current week now lists "E2E Upcoming Class" on Sunday.
- iOS parity: the fix is server-side. The iOS picker sends the same date-only bounds (`add-to-classes-dialog.tsx:93-96`), which is the hooks-level check. Maestro was not run, because the simulator is blocked on Xcode 26.6.
- Resolved: 2026-09-29T14:23:00Z
