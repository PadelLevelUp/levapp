---
name: calendar-visual-state
---

# calendar-visual-state

The rule set that turns a class's coach-picked color (arbitrary user data) plus its schedule/status into what the calendar grid actually renders: fill/fade/border, computed text contrast, and which of `block`/`canceled`/`past`/`next`/`future` a class is in right now. Unified into one platform-neutral module after web and mobile independently reimplemented "is this the next class" and drifted (`weekDays.some(isToday)` vs `isToday(selectedDay)`).

**Implementing files:**
- `frontend/packages/config/src/calendar-status.ts` — all the color math, contrast decisions, and state resolution (`resolveEventState`, `findNextEventId`).
- `frontend/packages/config/src/calendar-status.test.ts` — asserts the CSS `color-mix()` path and the native arithmetic path agree, against the 8 real coach-pickable swatches.

**Related concepts:** [[design-tokens]] — supplies the resolved surface colors the native emitters blend against.
