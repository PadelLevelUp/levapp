---
id: classes.delete
status: implemented
depends_on: [classes.create]
serves: [P-CLASSES-2]
governed_by: []
---

# classes.delete


### Intent
Delete a class or specific occurrence. Supports deleting single or future occurrences.

### Rules
1. `DELETE /api/app/class/{lesson_id}` deletes the lesson and all instances (CASCADE)
2. `DELETE /api/app/lesson_instance/{instance_id}` deletes a single instance
3. Scope: `single` (cancel one occurrence — an exclusion on the lesson, `classes.recurrence` rule 7, once PAD-275's column exists; the PAD-65 split until then) or `future` (end series)
4. Deleting cancels associated scheduler jobs
5. A one-off class has exactly one occurrence, so "delete this class" and "delete this
   occurrence" are the same act. Removing a materialised `LessonInstance` whose parent has no
   `recurrence_rule` removes the parent `Lesson` with it (instance, presences and both reminder
   jobs — the instance's and the lesson-occurrence's); the response is `deleted` (PAD-335, B-096)
6. Removing a materialised `LessonInstance` of a recurring class removes only that occurrence
   (instance and presences) and excludes its date from the series (rule 3); the response is
   `single_removed`. The scope dialog says which of the two the coach is doing
7. A removal is whole or nothing: after a 2xx no calendar fetch shows the removed occurrence in
   any state. Whichever way the client names the occurrence: `model=Lesson, scope=single` on a
   date that already has a materialised instance deletes that instance (and its jobs) before
   excluding the date, and `scope=future` on a one-off — which has no future beyond itself — is
   the whole-class delete (`deleted`), never a truncation of a recurrence the class does not
   have (review round, 2026-09-16). Confirmed attendance is never lost without the coach being told: when attendance
   has been marked, the confirmation dialog says it is removed with the class. Attendance counts as
   marked only once the coach validated a row (`hasRecordedAttendance`, PAD-335): an enrolment-only
   row or a student's own answer does not count
8. **Cancelling an occurrence tells each enrolled student (PAD-75).** Every student enrolled on the
   removed occurrence gets one message in their chat with the coach, sent as the coach and written
   in the coach's language. An occurrence with nobody enrolled sends nothing.

### Acceptance Criteria

#### CLASSES-DELETE-1: Delete a materialised one-off
- **Given** a one-off class with two participants whose attendance the coach confirmed (which
  materialised its `LessonInstance`) and a calendar refetch since
- **When** the coach deletes the class (`remove_class` with `model=LessonInstance`)
- **Then** the response is 200 `deleted`, the `Lesson` and the instance are gone, both reminder
  jobs are cancelled
- **And** the next `GET /api/app/calendar` for that week does not contain the class

#### CLASSES-DELETE-2: Deleting a materialised occurrence through the Lesson path removes it too
- **Given** a weekly class whose second occurrence was materialised by confirming attendance, and a sheet that still names it `model=Lesson`
- **When** the coach deletes it with scope `single`
- **Then** the response is 200 `single_removed`, the instance and its register are gone, the date is excluded, and the next calendar fetch shows the first and third occurrences and not the second

#### CLASSES-DELETE-3: A one-off has no future scope
- **Given** a one-off class, with or without a materialised instance
- **When** a stale client sends `remove_class` with scope `future` for the Lesson or the instance
- **Then** the response is 200 `deleted`, the Lesson (and instance) are gone, and the next calendar fetch does not contain the class

#### CLASSES-DELETE-4: Delete dialog names marked attendance
- **Given** a class whose attendance has been marked
- **When** the coach opens Delete class
- **Then** the confirmation says the marked attendance is removed with the class

#### CLASSES-DELETE-5: Delete single occurrence
- **Given** a recurring class with instances on April 13, 20, 27
- **When** coach deletes the April 20 instance with scope `single`
- **Then** only the April 20 instance is removed
- **And** April 13 and 27 remain

#### CLASSES-DELETE-6: A removal that fails part-way removes nothing (rules 5, 7)
- **Given** a one-off class with a materialised occurrence and one validated presence
- **When** its removal fails after the occurrence was deleted and before the class was
- **Then** the occurrence, its presence and the class are all still there, and the calendar still shows the class with its confirmed count
test: `backend/padel_app/tests/test_pad335_delete_materialised_one_off.py` › `test_a_failure_after_the_instance_delete_leaves_everything_in_place`

#### CLASSES-DELETE-7: Cancelling a class tells each enrolled student in their chat with the coach (rule 8)
- **Given** a class two days ahead with two enrolled students
- **When** the coach removes that occurrence
- **Then** each student gets one cancellation message from the coach, in their own conversation with the coach
- **And** a Portuguese-speaking coach's message says the class was "cancelada"
- **And** with nobody enrolled no message is sent
test: `backend/padel_app/tests/test_notification_class_cancellation.py` › `test_cancel_class_notifies_every_enrolled_student` (+2 more)

#### CLASSES-DELETE-8: Deleting takes the occurrences with it in the database, cancels their jobs and keeps the past (rules 1, 4)
- **Given** a class with a past occurrence that has attendance, and three future ones
- **When** its future occurrences are deleted
- **Then** the three are gone in one statement, each one's scheduler job is cancelled, and the past occurrence and its attendance stay
- **And** deleting the class itself removes every occurrence and presence through the database's cascade, without loading them one by one
test: `backend/padel_app/tests/test_pad274_deletes.py` › `test_deleting_a_lesson_does_not_load_every_child` (+1 more)

#### CLASSES-DELETE-9: Attendance counts as marked only once a row is validated (rule 7, PAD-335)
- **Given** a class with no presences, with enrolment-only rows, or with a student's own `confirmed` answer and no validated row
- **When** the client asks whether the class has recorded attendance
- **Then** the answer is false
- **And** it is true once any row is validated, present or absent
