---
id: B-714
title: "A student the coach put on a class's waiting list had no side, so a right player could be the first asked for a left spot"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - notifications.waiting-list
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/modules/notification_engine_api.py
  - frontend/apps/web/src/components/calendar/ClassWaitingListSection.tsx
  - frontend/apps/mobile/src/features/calendar/class-waiting-list-section.tsx
proposed_fix: "waiting-list rule 18a: the coach's add (occurrence, series, period, change of scope) takes a side, the profile side pre-selected as Habitual and mandatory without one; clients that do not declare waiting-list-side get the profile side (assumed, pending the owner); old rows with no side stay."
opened: 2026-10-30T17:15:00Z
---

# B-714: coach-added waiting-list entries had no side

**Source:** Linear PAD-803 (sub-ticket 1 of PAD-802, owner priority).

**What happens:** `POST /api/app/notify/class_waiting_list` never reads a side.
- `add_to_class_waiting_list` writes the class's row with `side` NULL.
- The series and period scopes create the standing entry with no side, and so do the rows it fans out.
- A change of scope does the same.

Rule 4e treats a row with no side as "any spot", and the waiting list is asked before everyone else (rule 4). So a right player the coach queued can be the first asked for a left spot.

**What should happen:** the coach names Direita, Esquerda or Ambos, as a student does on their own request. The profile side is pre-selected as "Habitual", and the choice is mandatory when the profile has no side.

**Root cause:** PAD-672 gave a side to the student's own join (join-requests rule 20) and to the standing list (rule 6, Q4). Rule 18, the coach's add from the class, was never extended: an incomplete rule.

**Evidence:** `backend/padel_app/tests/test_pad803_coach_picks_the_waiting_list_side.py` on staging bbe80c331, 2026-10-30 15:31:12Z: 5 failed (pasted in PAD-803).

**Affected specs:**
- Dev: `.specflow/specs/notifications/waiting-list.spec.md` (new rule 18a, two criteria)
- Business: none. `coach-fills-vacancies-automatically` does not describe sides.

### Change Plan
1. Spec: rule 18a and the criteria.
2. Backend:
   - `side` on the route, and in `add_to_class_waiting_list` and `change_class_waiting_list_scope`;
   - `waiting_list_side_for` (the capability gate and the profile-side default, decided by the owner 2026-11-03);
   - `side` on the class list's rows.
3. Web and iOS: the side picker in the class's add dialog, the side chip on rows, and the `waiting-list-side` capability.
