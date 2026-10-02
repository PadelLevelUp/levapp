---
id: B-275
title: "A cleared class time was sent empty and the server answered 500"
type: incomplete-rule
severity: high
status: resolved
opened: 2026-10-02T19:23:16Z
resolved: 2026-10-02T19:23:16Z
updated: 2026-10-02T19:23:16Z
affects:
  - classes.create
  - classes.edit
  - frontend/apps/web/src/components/calendar/AddClassSheet.tsx
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
  - backend/padel_app/services/lesson_service.py
proposed_fix: "The sheets never send a time that is not HH:MM; the server refuses one with a 400 naming the field."
---

# B-275: a cleared class time reached the server as "" and broke the save

**Source:** PAD-508 (the desktop class time picker "reverts to zero" and the save fails), reproduced on
2026-10-02 with Playwright and real key presses on staging de0a25482.

**What happens:** the web sheets use the browser's native `<input type="time">`. Clearing a segment
(Backspace on the hour, as a coach correcting it does) makes the whole value `""`, and it stays `""`
after any pause. The new-class sheet stored it and sent `"startTime": ""`;
`lesson_service.add_class_service` → `build_datetime(date, "")` raised `ValueError`, and the coach got a
500 that named nothing. A pause after one digit is not the cause: Chrome shows `01:00` at once and keeps
completing the hour. The edit sheet and the edit route had the same gap.

**Root cause (diagnostic tree):** `classes.create` rule 8 refused an empty name and capacity but said
nothing of the times; neither sheet checked them. Type 2, incomplete rule.

### Change Plan
- Spec: `classes.create` rule 8a and one criterion; `classes.edit` rule 7 cites it.
- Code: `_refused_class_fields` refuses a time that is not HH:MM (create and edit); both web sheets
  check `isHhMm` (`@levelup/config`) before sending and name "Hora".

### Resolution (PAD-508)

- **Server:**
  - Fix: `lesson_service._refused_class_fields` refuses `start_time` and `end_time` unless they are `HH:MM`, so the request answers 400 and writes nothing. The create path passes both times, so an absent one is refused too.
  - Test: `test_pad508_class_times.py`, 30 tests. Red first: 26 failed, as 500s or crashes.
- **Web:**
  - Fix: `AddClassSheet` flags the time box and names "Hora". `ClassDetailSheet.saveEdit` refuses with the same message. Both use the shared `isHhMm`, which is unit-tested.
  - Test: `e2e/schedule-calendar/pad508-class-time-never-empty.spec.ts` presses real keys. It is red with the check removed: the request is sent and nothing is flagged.
- **iOS:** `TimePickerInput` always emits `HH:MM`. No change.
