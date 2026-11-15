---
id: classes.enrollment
status: implementing
depends_on: [classes.create, players.create]
serves: [P-CLASSES-1]
governed_by: []
---

# classes.enrollment


### Intent
Manage which players are enrolled in a class (lesson template level).

### Entities
- **Association_PlayerLesson** (`player_in_lesson`): player_id, lesson_id (unique pair), indexed on lesson_id

### Rules
1. Players enrolled at the lesson level appear in ALL future instances
2. Players can also be added to specific instances only — that is a `Presence` row with `enrolment_source=coach` (`classes.instance-enrollment` rule 4, PAD-259)
3. Enrollment at lesson level auto-creates presences when instances are materialized
4. **A coach's removal from the class group tells the student once (PAD-928; numbering unconfirmed).**
   When a coach takes a student off a recurring class from a date on (the class edit with `scope:
   "future"` and `removePlayers`, web and iOS, which reaches `edit_lesson_helper` through
   `_apply_future_edit_to_lesson` and deletes their `player_in_lesson` row), the student gets **one**
   `removed_from_series` message (`notifications.message-templates` rule 24) the way the cancellation
   notice reaches them (`_send_system_message`, sender the class's first coach, metadata
   `{"removedFromClass": true, "series": true}`), rendered from the lesson the edit wrote (the fork when
   the edit split the series, so its `{date}` is the first class they leave). Never one per occurrence:
   the per-occurrence passes (`series=True`) send nothing, and no `removed_from_class` goes with it.
   - Sent only when they were on the roster, and the class still has an occurrence from the boundary on
     that has not started on the club's clock (`club_now_naive()`) and is not cancelled; otherwise nothing.
   - A one-off class (no recurrence) gets `removed_from_class` instead (`classes.instance-enrollment`
     rule 11a). A validated presence the series pass keeps changes nothing here.
   - Immediately after the edit is written, best-effort (a failure is logged, the edit stands). The freed
     seats follow the vacancy flow as before.

### Acceptance Criteria

#### CLASSES-ENROLLMENT-1: Removing a student from the class group sends one notice (rule 4, PAD-928)
- **Given** a pt coach's class on Fridays at 19:00 at "Padel Norte" with Rita on its roster and three future occurrences, two of them materialised
- **When** the coach removes Rita with `scope: "future"` from next Friday 21/11
- **Then** Rita has exactly one new message: "Olá Rita, foste removido da turma de sexta-feira às 19:00 (Padel Norte) e já não estás inscrito nas próximas aulas. Qualquer dúvida, fala com o teu treinador.", and no `removed_from_class` message
- **And** her presences from 21/11 on are gone and earlier ones are kept
test: `backend/padel_app/tests/test_pad928_removed_from_class.py` › `test_removing_a_student_from_the_series_sends_one_notice`

#### CLASSES-ENROLLMENT-2: A mid-series removal names the first class they leave (rule 4)
- **Given** the coach's text for `removed_from_series` "Sais da turma a partir de {date}."
- **When** Rita is removed with `scope: "future"` from 05/12, which splits the series
- **Then** her message reads "Sais da turma a partir de 05/12."
test: `backend/padel_app/tests/test_pad928_removed_from_class.py` › `test_a_mid_series_removal_dates_the_first_class_left`

#### CLASSES-ENROLLMENT-3: No class ahead, no notice (rule 4)
- **Given** a recurring class whose last occurrence has started, and Rita on its roster
- **When** the coach removes her with `scope: "future"` from that date
- **Then** no message is sent
test: `backend/padel_app/tests/test_pad928_removed_from_class.py` › `test_no_series_notice_when_no_class_is_ahead`

### Today (PAD-928)
- Series roster removal: `lesson_service.py` `edit_lesson_helper` (1025-1029: deletes `Association_PlayerLesson`), reached from
  `_edit_class_service` scope `future` through `_apply_future_edit_to_lesson` (1518-1552; a mid-series date forks the lesson with
  `duplicate_lesson_helper`). The occurrences already materialised are edited by `_edit_future_instances_for_lesson(series=True)`.
  The series add already tells the student once (`notify_student_added_to_class(coach, player_id, lesson=lesson)`, 1010-1023);
  the removal tells nobody today.

### Waves (PAD-928)
1. -1 … -3, in `classes.instance-enrollment` wave 1 (same helper and test file).
