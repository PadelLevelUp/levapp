---
id: B-422
title: "iOS class screen opened by deep link offered only \"Só esta aula\": the class payload had no isRecurring, only the calendar event did"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - calendar.event-detail
  - backend/padel_app/serializers/lesson.py
  - frontend/apps/mobile/app/class/[id].tsx
  - frontend/apps/mobile/.maestro/flows/219-class-waiting-list-scopes.yaml
proposed_fix: "serialize_class_instance emits isRecurring; the iOS screen reads it and falls back to a non-null recurrenceEnd; flow 219 re-run on the simulator."
opened: 2026-10-10T00:05:00Z
---

# B-422: a deep-linked class screen hid the series scopes (id unconfirmed, wave-13 range)

**Source:** Maestro flow 219 (PAD-560 part B) on the simulator, 2026-10-10 00:46 local, at 71f04ef2d:
`tapOn class-waiting-list-scope-series` → element not found; the screenshot shows the add sheet with
"This class only" as the only scope.

**What happens:** `app/class/[id].tsx` computes `isRecurring = event.isRecurring || instance?.isRecurring`.
Opened by deep link (`levelup://class/<instanceId>` — a push, a link, flow 219), the rebuilt event has
no `isRecurring`, and the class payload (`POST /api/app/class_instance`) carried `recurrenceEnd`
but **no `isRecurring`** (verified on the live API, 2026-10-10: payload keys for a weekly series —
`isRecurring` absent, `recurrenceEnd` 2026-11-20; the calendar event — `isRecurring` true,
`recurrenceEnd` absent). So `waitingListScopeOptions(false)` offered this class only.

**What should happen:** calendar.event-detail rule 15 (an instance id is enough to open a class) with
rule 20: the three scopes are offered for a recurring class however the screen was reached.

**Root cause:** type 2 (incomplete rule) — rule 15 listed the fields a deep-linked open needs and
`isRecurring` was not among them; the serializer never emitted it because the calendar-opened
paths got it from the event.

**Not affected:** web (the sheet receives the calendar event) and iOS opened from the calendar.
PAD-560 part B's Playwright journey and flow 170 passed; the gap is the deep-link entry only.

### Change Plan
Rule 15 names `isRecurring` as part of the payload; `serialize_class_instance` emits it (coach and
student views); the iOS screen reads it and keeps a `recurrenceEnd != null` fallback; backend test
on the payload; iOS source-grep test; flow 219 re-run. Follow-up PR after the wave-13 batch, before
promotion (coordinator 2026-10-10).

### Resolution
_Pending._
