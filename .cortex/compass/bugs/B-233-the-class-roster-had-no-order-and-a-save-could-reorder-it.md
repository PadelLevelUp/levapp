---
id: B-233
title: "The class roster had no defined order, so a save could swap two participants under the coach's finger"
type: incomplete-rule
severity: low
status: resolved
affects:
  - classes.instance-enrollment
  - backend/padel_app/serializers/lesson.py
  - backend/padel_app/serializers/presence.py
  - backend/padel_app/services/evaluation_api_service.py
proposed_fix: "Rule 12 (D163): order every roster read by account name, ignoring case and accents, then player id, on the server."
opened: 2026-09-29T14:31:37Z
resolved: 2026-09-29T14:31:37Z
---

# B-233: the class roster had no order

**Source:** found while diagnosing B-232 (PAD-465), 2026-09-29.

**What happens:** the class-detail participants list, and `GET /lesson_instance/<id>/presences`, came back in
whatever order the database returned the rows. Nothing ordered them:
- `LessonInstance.presences` has no `order_by`;
- `serializers/lesson.py` iterated it as-is;
- the presences route did `.all()`.

So on Postgres a write could change the order. In the PAD-465 failure screenshot, the student the coach had just
marked moved from first to second after the save and reload.

**What should happen:** one order, stable across writes. No spec stated one.

**Root cause (observed):** `classes.instance-enrollment` rule 6 names the class-detail participants list as a
presences read, but no rule gives it an order. Neither client sorts that roster:
- web `ClassDetailSheet.tsx:1289` maps `participants` as given;
- iOS `app/class/[id].tsx:449/1261` does the same.

So the database order reached the screen. The presences report and validate tables are separate screens, and
already sort by name with `localeCompare`.

**Decision:** D163, by the coordinator. It applies "nothing moves under the finger" to an order nobody had chosen:
account name (`users.name`), ignoring case and accents, then player id, set on the server.

### Change Plan (Type 2: incomplete rule)

1. `classes.instance-enrollment`: add rule 12, and the criterion "The roster keeps one order across a save",
   with Zé / ana / Álvaro / Bruno in creation order → Álvaro, ana, Bruno, Zé.
2. Red: `test_pad465_roster_order.py` inserts presences out of name order. The occurrence detail, the series
   detail and the presences list come back in creation order.
3. Add `services/roster_order.py` (NFKD, combining marks stripped, casefold, then player id), used by
   `serializers/lesson.py` for both occurrence and series rosters, and by the presences route.
4. Neither client re-sorts the class roster, at HEAD or in the pinned iOS builds read at `6b48f79e3` (1.1.0) and
   `6f5d0c1ce`. So the server order reaches every client.

### Resolution

- Spec changes: `classes.instance-enrollment` rule 12 and the criterion "The roster keeps one order across a
  save" (wording reviewed by the coordinator, D163).
- Tests added: `backend/padel_app/tests/test_pad465_roster_order.py`.
  - The occurrence detail and the presences list are checked before and after a save.
  - The series detail is checked.
  - A same-name tie is checked to break by player id.
  - Red 3/3 on the old code (creation order Zé, ana, Álvaro, Bruno), green 3/3 after the change.
- Code changes: `services/roster_order.py` (`roster_sort_key`, `in_roster_order`).
  - It's used by `serializers/lesson.py` for occurrence and series participants.
  - It's used by `serialize_presences`, whose callers each pass one occurrence. That orders every presences
    payload: the class detail's `presences`, `GET /lesson_instance/<id>`, `GET /lesson_instance/<id>/presences`,
    unvalidate and confirm.
  - It's used by `class_evaluations`, the evaluations panel. Its absent-last sort is stable over the roster
    order, and its comment now says so, following Session-C's review of #478.
- Added red case: `test_every_other_presences_payload_is_in_name_order`, red on creation order and green after.
- Resolved: 2026-09-29T14:31:37Z (PAD-465).
