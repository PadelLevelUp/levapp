---
path: backend/padel_app/services/student_availability_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 231
size_tokens: 2059
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "806ae761658b6c7c0e233e4a66f3bdd5c8b3e5fc3b6107ebe1511c5f082a0192"
---

## Purpose

Student-declared "I'm unavailable at this time" windows (PAD-28/PAD-107)
that suppress AUTOMATIC class invitations — never manual ones. Rather
than a dedicated table, blockers are `CalendarBlock` rows with
`type="unavailable"` and `blocks_auto_invitations=True`, reusing
`calendar_service.py`'s CRUD and recurrence machinery (thin wrappers:
`create_student_blocker`, `update_student_blocker`,
`delete_student_blocker`, `list_student_blockers`). The eligibility side
(`user_is_blocked_for_window`, `blocked_player_ids_for_window`,
`blocked_players_for_instance`, `filter_blocked_coach_players`,
`instance_window_is_blocked_for_user`) expands each blocker's
recurrence and checks half-open overlap against a target window
(evaluated in `CLUB_TZ`, per the locked timezone decision, since a
naive-UTC comparison would misalign "every Monday 18:00" during DST).

## Connections

- Uses: `padel_app.models.CalendarBlock`;
  `padel_app.tools.calendar_tools` (`expand_occurrences`, `ensure_utc`);
  `services/calendar_service.py` (`add_event_service`,
  `edit_event_service`, `remove_block_service`); `padel_app.utils.dates.CLUB_TZ`.
- Used by: `services/notification_service.py` presumably calls
  `filter_blocked_coach_players`/`blocked_players_for_instance` when
  building auto-invitation candidate lists (not visible in this file —
  see `notification_service.py`'s L3 entry for the actual call sites).

## Insights

- Privacy posture, stated in the module docstring and load-bearing for
  API design: a coach may learn THAT a player is blocked and (via
  `blocked_players_for_instance`) the player's name, but never the
  blocker's title, description, or exact hours — that stays the
  student's private calendar. This is the opposite posture from
  `student_notification_preferences.py`, whose block reason IS coach-
  visible by design; the two modules' payload shapes (`"cause":
  "unavailable"` vs `"cause": "preference"`) exist so the two kinds of
  block can share one `blocked` array on the notify routes while the
  client still tells them apart.
- `filter_blocked_coach_players` is explicitly scoped to the AUTO
  invitation path only — its docstring states it "is not called on the
  manual path", meaning a coach CAN manually invite a student who has
  marked themselves unavailable at that time; only the automatic engine
  respects the blocker.
- `user_is_blocked_for_window` widens its occurrence-expansion range by
  a day on each side of the target window before calling
  `expand_occurrences`, so a recurring block whose nominal start falls
  just outside the window (but whose expanded occurrence overlaps it)
  is still caught.
