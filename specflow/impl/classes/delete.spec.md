---
id: classes.delete
status: implementing
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
9. **A cancellation can carry the coach's reason (PAD-840, phase 1).** Every removal of rules 5–7 (a
   one-off, one occurrence of a recurring class, or "this and all future") takes an optional
   `reason` and a `sendReason` flag in `POST /api/app/remove_class`. The reason is free text, trimmed,
   at most **200 characters** (pending owner, Q4); a longer one is refused with 400 and nothing is
   removed or sent. `sendReason` defaults to true when the trimmed reason is not empty and is ignored
   when it is empty. A removal of several occurrences at once ("this and all future") shares one
   reason. A client that sends neither field gets today's behaviour exactly (rule 8, no reason).
10. **The message names the reason only when it is sent (PAD-840).** Rule 8's message is the
   `class_cancelled` template; its reason sentence (`notifications.message-templates` rule 25) is
   filled with the reason when `sendReason` is true and the reason is not empty, and disappears whole
   otherwise. The message is sent either way (rule 8): the checkbox decides whether the reason is in
   it, never whether the students are told. Each message's metadata carries `cancelReason` (the
   reason, or null when it was not sent).
11. **Where the reason is kept (PAD-840; a decision, see Open questions).** A cancellation removes the
   occurrence's row (rules 5–6), and a one-off or a whole-class delete removes the class, so the reason
   cannot live on the occurrence. It is kept on the class: `lessons.cancellation_reasons`, a new nullable
   JSON column, a list of `{date, scope, reason, sentToStudents, at}` entries, one per removal that had a
   non-empty reason, written in the removal's transaction (rule 7) whenever the `Lesson` row survives:
   one occurrence of a recurring class (`single`) and "this and all future" (`future`, keyed by its
   first removed date). A removal that deletes the `Lesson` itself (a one-off, rule 5; the whole class,
   rule 1) keeps no reason row: the students' messages (rule 10's metadata) are its only record.
   Nothing in phase 1 reads the column back; it is the record the ticket asks for, and the readers come
   with their own ticket.
12. **The cancel dialogs ask for the reason and show the message (PAD-840, phase 1; web and iOS
   together).** The confirmation that removes a class or occurrence — web `ClassScopeDialog` in
   delete mode and the one-off `AlertDialog` in `ClassDetailSheet`; iOS's delete `AlertDialog` in
   `app/class/[id].tsx` — gains, above its buttons:
   - a "Motivo" / "Reason" text field (optional, multi-line, a live `n/200` counter, input stopped at
     200), `cancel-reason-input`;
   - a checkbox "Enviar o motivo aos alunos" / "Send the reason to the students",
     `cancel-reason-send`, disabled while the field is empty, and ticked as soon as a reason is
     written (pending owner, Q4); the coach may untick it;
   - a read-only preview of the message, `cancel-reason-preview`: the server renders it
     (`POST /api/app/class_cancellation_preview` with the dialog's event, scope, reason and
     `sendReason`, the same rendering as the real send, rules 8 and 10) for the first enrolled
     student by name, or with the name "Aluno" / "Student" when nobody is enrolled. The preview follows
     the field and the checkbox as the coach types (debounced, at most one request in flight). When
     nobody would be told, the dialog says so ("Nenhum aluno será avisado." / "No student will be
     told.") in place of the preview and the checkbox.
   The confirm buttons send the field and the checkbox with the scope the coach picks. iOS's dialog
   holds a text field, so it sits above the keyboard (`mobile.android-runtime` rule 15, PAD-838).
13. **Phase 2: the coach may edit this one message (PAD-840, phase 2: specified, not built; the phase
   split is pending owner, Q4).** The preview becomes editable for this cancellation only: the
   placeholders in it (`{name}` and the class ones, `notifications.message-templates` rule 3a, and
   `{reason}`) show as protected tokens that cannot be partly edited or typed over, only removed whole
   or left; a "Repor mensagem original" / "Restore original message" button puts back the template's
   text. The edited text goes in `POST /api/app/remove_class` as `messageOverride`, is rendered per
   student exactly as a template (rules 5–9 of `notifications.message-templates` hold, a blank override
   falls back to the template), and is never saved into the coach's templates.

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

#### CLASSES-DELETE-10: A reason the coach chose to send is in each student's message (rules 9, 10, PAD-840)
- **Given** a weekly class with two enrolled students, a Portuguese-speaking coach
- **When** the coach removes one occurrence with the reason "Chuva forte" and `sendReason` true
- **Then** each student gets one message that holds "Motivo indicado pelo professor: Chuva forte."
- **And** its metadata carries `cancelReason: "Chuva forte"`
test: `backend/padel_app/tests/test_pad840_cancel_reason.py` › `test_a_sent_reason_is_in_every_message`

#### CLASSES-DELETE-11: A reason not sent, or no reason, leaves no trace of the sentence (rules 9, 10)
- **Given** the same class
- **When** the coach removes it with "Chuva forte" and `sendReason` false, then (another occurrence) with a blank reason, then with no reason fields at all
- **Then** every student still gets the cancellation message, and none holds "Motivo", "Reason" or an empty "…: ." slot
- **And** the third message is exactly today's text for that class
test: `backend/padel_app/tests/test_pad840_cancel_reason.py` › `test_an_unsent_or_empty_reason_leaves_no_sentence` (+1 more)

#### CLASSES-DELETE-12: A reason over 200 characters is refused and nothing happens (rule 9)
- **Given** a class with an enrolled student
- **When** the coach removes it with a 201-character reason
- **Then** the answer is 400, the occurrence is still there and no message is sent
- **And** 200 characters are accepted
test: `backend/padel_app/tests/test_pad840_cancel_reason.py` › `test_a_reason_over_the_limit_is_refused_whole`

#### CLASSES-DELETE-13: "This and all future" shares one reason (rules 9, 11)
- **Given** a weekly class with three future occurrences and two students on its roster
- **When** the coach removes "this and all future" with the reason "Fim da época"
- **Then** each student's cancellation message holds that one reason
- **And** the class's `cancellation_reasons` holds one entry with scope `future`, the first removed date and `sentToStudents: true`
test: `backend/padel_app/tests/test_pad840_cancel_reason.py` › `test_this_and_all_future_shares_one_reason`

#### CLASSES-DELETE-14: The reason is kept on the class when the class survives, and only then (rule 11)
- **Given** a weekly class and a one-off class, each with a student
- **When** the coach removes one occurrence of the weekly class with a reason not sent, and the one-off with a reason
- **Then** the weekly class's `cancellation_reasons` holds `{date, scope: "single", reason, sentToStudents: false}`
- **And** the one-off is gone with no reason row anywhere, and its student's message metadata holds the reason
- **And** a removal that fails part-way (CLASSES-DELETE-6) writes no entry
test: `backend/padel_app/tests/test_pad840_cancel_reason.py` › `test_the_reason_is_kept_where_the_class_survives` (+1 more)

#### CLASSES-DELETE-15: The preview is the message the first student will get (rule 12)
- **Given** a class with students "Bruno" and "Ana", and one with nobody enrolled
- **When** the preview is asked for with a reason and `sendReason` true, then false
- **Then** it is the text Ana's message would have, with the reason sentence, then without it
- **And** for the empty class it says nobody will be told, and names "Aluno" in a preview with the coach in `pt`
test: `backend/padel_app/tests/test_pad840_cancel_reason.py` › `test_the_preview_renders_the_first_students_message` (+1 more)

#### CLASSES-DELETE-16: Web's cancel dialogs take a reason and show the message (rule 12)
- **Given** the web class sheet of a weekly class and of a one-off, each with students
- **When** the coach opens "Apagar" and types a reason
- **Then** the counter follows the text up to 200 and stops input there, the checkbox becomes enabled and ticked, and the preview shows the reason sentence
- **And** unticking it drops the sentence from the preview, and the chosen scope sends `reason` and `sendReason` as shown
test: `frontend/apps/web/src/components/calendar/ClassCancelReason.test.tsx` › `[CLASSES-DELETE-16] the dialog sends the reason it previews` (+1 more)

#### CLASSES-DELETE-17: iOS's cancel dialog takes a reason and shows the message (rule 12)
- **Given** the iOS class screen of a weekly class with students
- **When** the coach taps delete and types a reason
- **Then** the counter, the checkbox and the preview behave as on web, and "Only this class" sends `reason` and `sendReason` as shown
test: `frontend/apps/mobile/src/features/calendar/cancel-reason.test.tsx` › `[CLASSES-DELETE-17] the dialog sends the reason it previews`

#### CLASSES-DELETE-18: Phase 2: an edited message goes to this cancellation only (rule 13; phase 2, not built)
- **Given** a coach who edits the preview, keeping `{name}` and the reason token
- **When** they confirm the removal
- **Then** each student gets the edited text with their own name, and the coach's `class_cancelled` template is unchanged
- **And** "Repor mensagem original" before confirming restores the template's text, and a protected token can be removed only whole

### Today (PAD-840)
- The only coach cancel is the delete: web `ClassScopeDialog` (delete mode, recurring) and the one-off
  `AlertDialog` in `ClassDetailSheet.tsx` (~2698), iOS's delete `AlertDialog` in `app/class/[id].tsx`
  (~2621); both call `removeClass(event, scope)` with `single` or `future`. No reason, no bulk cancel.
- Backend: `remove_class_service` (`services/lesson_service.py` ~2174) snapshots
  `collect_cancellation_recipients` before the removal and sends `notify_students_of_cancellation`
  after it (`services/system_messages.py` ~500-580). `update_lesson_status_service` (sets
  `status = "canceled"`) has no route and no client caller; it is not a cancel path and this spec does
  not use it.
- The ticket's "current message" ("Motivo indicado pelo professor …") exists nowhere in the code.

### Waves (PAD-840)
1. Phase 1 backend: rules 9-11, the migration (the `lessons.cancellation_reasons` column and the
   `class_cancelled` default follow-up of `notifications.message-templates` rule 26, one revision chained
   after PAD-830's `e830f1a2b3c4`, and after PAD-753's if it lands first), the preview route; -10 … -15.
2. Phase 1 clients: rule 12 on web and iOS together, locale keys in pt and en; -16, -17.
3. `notifications.message-templates` -32 … -35 (the template, `{reason}`, the editor).
4. Phase 2 (rule 13, -18): only after the owner answers Q4.

### Open questions
- **Q4 (owner; recommendations shown, the build follows them until answered).** (a) Ship phase 1
  first and phase 2 later? Rec.: yes. (b) The checkbox ticked as soon as a reason is written? Rec.:
  yes. (c) A 200-character limit? Rec.: 200 (a chat message stays readable; the field shows the
  counter).
- **Where the reason is kept (messages-m2, 2026-11-13; the lead can reverse it).** The brief said "a
  new nullable column on the cancelled occurrence", but the cancel deletes that row (rules 5-6) and a
  one-off's or a whole class's delete removes the class too. Picked: a JSON list on `lessons` for the
  removals that leave the class, the message metadata for the others (rule 11). Alternatives: (i) a
  `class_cancellations` table with no foreign key to the class, which survives every delete
  (a migration and a model more, and a reader nobody has asked for yet); (ii) keep it only in the
  message metadata (no migration). Rec.: as picked.
- **Showing the reason later (owner; the lead, 2026-11-13).** The ticket wants the reason visible later in the class
  detail or history; a deleted one-off class has no detail to show it in. Phase 1 shows the list on the surviving
  series' detail only. Keeping cancelled occurrences as rows (status `canceled`, which the model already has) would
  change classes.delete rules 1-8 and the calendar: a later ticket if the owner wants it. (Rule 11 as written has no
  reader yet: the series-detail list needs its own rule and criteria, web and iOS, before phase 1 builds it.)
- **The preview is rendered by the server (messages-m2).** The rendering rules (empty phrases,
  connectors, locale) live in `_format_template`; a client copy would drift. One debounced request per
  edit; offline, the dialog shows no preview and still cancels.
- **The sentence names the coach in the third person ("Motivo indicado pelo professor").** Kept as the
  ticket wrote it, as PAD-928 did with its removal texts; the message is sent from the coach's own
  account, so "Motivo: {reason}" is the shorter alternative (a one-line change).
