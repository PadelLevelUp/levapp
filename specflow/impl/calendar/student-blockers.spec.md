---
id: calendar.student-blockers
status: implementing
depends_on: [calendar.blocks, notifications.invitations, attendance.confirm]
serves: [P-CALENDAR-4]
governed_by: []
---

# calendar.student-blockers


### Intent
Students set availability blockers (one-time or recurring) so the smart notification
engine does NOT send them AUTOMATIC class invitations during times they are unavailable.
Reuses the existing CalendarBlock model (type `unavailable`, `blocks_auto_invitations=true`)
rather than a separate table.

### Status (corrected 2026-10-01)
The **PAD-28** half of this spec is implemented: blocker CRUD (rules 1–3) and eligibility-time
filtering of automatic invitation candidates (rule 5, `filter_blocked_coach_players`).

The **PAD-107** half (rules 4, 8, 9, 10 and 11) is also shipped (`de39e76b6`, 2026-08-04). The 2026-08-07
note that it "never landed" was wrong (corrected 2026-10-01, PAD-474):
`POST /api/app/notify/availability_conflicts` is served by the availability-conflicts view in
`notification_engine_api.py`; `/notify/manual` skips blocked students in the manual-send view of the same
file; the delivery backstop `instance_window_is_blocked_for_user` guards `_send_system_message`; and the
reminder fan-out reads `blocked_players_for_instance` in `notification_service.py`.

### Entities
- **CalendarBlock** (reused): student blockers are rows with type `unavailable` and `blocks_auto_invitations=true`.

### Rules
1. Students manage blockers from a dedicated `/availability` page (player-only nav item).
2. Blocker CRUD (student-scoped): `GET`/`POST` `/api/app/availability_blockers`, `PUT`/`DELETE` `/api/app/availability_blockers/{id}`. Non-student users get 403.
3. Both one-time and recurring (weekly) blockers are supported, using the same recurrence machinery as calendar blocks. A recurring blocker edited to one-time stops suppressing on every later week: the edit clears the recurrence rule the engine (rule 5) reads, not only the flag (`calendar.blocks` rule 10; PAD-377 — before it, a student who reduced a weekly "away" to one day went on being skipped for invitations every week).
4. Scope of suppression (PAD-107): a blocker suppresses EVERY class-slot solicitation during its window — automatic invitations, manual invitations, reminders and waiting-list offers. A coach may still ADD the student to a class in that window (enrolment is a coach decision), but only after explicitly confirming a warning, and the student is never notified about it.
5. The auto-invitation eligibility engine (`get_eligible_students` and `_get_eligible_students_for_group`) filters out any candidate whose owning user has a blocker occurrence overlapping the class instance window.
6. Timezone: datetimes stored as UTC; recurring occurrences evaluated against the club / Lisbon timezone.
7. The student's availability view clearly indicates each blocker (title, one-time date or recurring days, time window, and an "unavailable / won't receive auto-invitations" indication).
8. Conflict pre-check (PAD-107): `POST /api/app/notify/availability_conflicts` with `{date, startTime, endTime, playerIds}` returns `{blocked: [{playerId, name}]}` — the subset of those players whose owning user has a blocker overlapping the proposed window. Coach-only (403 otherwise). It returns player names ONLY; blocker titles, descriptions and times are the student's private calendar and are never exposed to the coach.
9. Scheduling warning (PAD-107): when a coach schedules a class whose window overlaps a selected student's blocker, the UI warns before creating and requires explicit confirmation ("O aluno (nome) marcou-se como indisponível nesta hora. Tem a certeza que pretende avançar com ele na aula? Não poderá enviar-lhe notificações neste período por ele estar marcado como indisponível e não querer ser incomodado."). Cancelling aborts the create; confirming creates the class normally. For a recurring class the check is evaluated on the first occurrence.
10. Send-time block (PAD-107): `POST /api/app/notify/manual` and `POST /api/app/notify/send_reminders` SKIP blocked students, still deliver to everyone else, and return `{sent, blocked: [{playerId, name}]}`. The UI surfaces "Não pode enviar notificações ao aluno (nome) neste horário, pois ele marcou-se como indisponível."
11. Hard backstop (PAD-107): `_send_system_message` refuses to deliver any `notification_invite`, `notification_reminder` or `waiting_list_offer` bound to a lesson instance whose window overlaps a blocker of the recipient. This is the single delivery choke point, so it also covers the APScheduler reminder job, the auto-invitation rounds and the waiting-list cascade — not just the coach-facing buttons. Neither the chat message nor the web/Expo push is created.
12. The window compared is always the CLASS INSTANCE window (`start_datetime`/`end_datetime`), never the moment the notification is sent.
13. Mobile-responsive (PAD-119): the `/availability` page fits within the viewport at small screen widths (≥320px) — the document never scrolls horizontally, and every control, notably the "Add blocker" action, is fully visible without horizontal scrolling. The page header stacks vertically below the `sm` breakpoint rather than forcing the title and the action button onto one row.

14. **(PAD-356) The student's availability tab is two cards, each with an explanation and its own
    call to action, on web and iOS. There is no floating "+".**
    - **Indisponibilidade** (`availability-blockers-card`): an explanation of what a block does,
      a **Criar bloqueio** CTA (`availability-create-blocker`), and the student's blocks listed
      inside the card (`blocker-card-<id>`, with edit `blocker-edit-<id>` and delete
      `blocker-delete-<id>` → `blocker-delete-confirm`). The empty state is
      `availability-blockers-empty`.
    - **Pedidos de aula** (`class-requests`): `classes.class-requests` (rules 1–11) re-homed as
      the second card, with its explanation, a **Marcar aula** CTA (`class-request-book`; until
      PAD-357 it opens today's booking form), and the student's open requests with their state
      ("À espera do treinador" for `pending`) and **Retirar** (`class-request-withdraw`).
15. **(PAD-356) Blocks are created and edited in a bottom sheet** (`blocker-sheet`) with a
    **single / recurring** choice (`blocker-mode-single` | `blocker-mode-recurring`).
    - Single: a date, start and end time, and a reason.
    - Recurring: weekdays (`blocker-day-<n>`, JS `getDay`), a start date and an end date, start
      and end time, and a reason.

    The reason is the existing optional `title` field, labelled "Motivo (opcional)"; no new
    column. Save is `blocker-save` and cancel is `blocker-cancel`.
16. **(PAD-356) Block validation is shared and runs before any request.**
    `blockerDraftError(draft)` in `@levelup/config` returns `date_required` (no date),
    `time_required` (a start or end time that is empty or not HH:MM, e.g. a cleared time input),
    `end_before_start` (end time not after start time), `end_date_before_start_date` (recurring
    end date before the start date), or `null`. Both shells render
    `availability.validation.<code>` on the error element (web `blocker-error` with
    `data-reason`; iOS `blocker-error-<code>`) and do not submit.
    `blockerDraftToInput(draft)` builds the payload: a recurring block with no weekday uses the
    start date's weekday, and a missing end date means start date + 3 months (the previous
    behaviour of both shells).

17. **An edit writes what was sent (PAD-386).** `PUT /api/app/availability_blockers/{id}` follows
    `calendar.blocks` rule 11: an emptied reason (`title: null`) is cleared; a `null` end while the
    blocker still recurs is 400 `["endDate"]` (the shared builder never sends one — it defaults the
    end to three months on create).

17. The conflict check answers only for students on the asking coach's roster: anyone else is left out of the answer, which is still 200. A check that fails never stops the save; the form goes on with no warning.

18. **(PAD-839) A schedule is a set of blockers written and deleted whole.** The setup guide's
    schedule editor (`dashboard.student-setup-guide` rules 9–11) saves one schedule as several
    weekly blockers sharing `calendar_blocks.schedule_id`.
    - `PUT /api/app/availability_schedules/<id>` replaces every row with that id, or creates them,
      and answers the rows. `DELETE /api/app/availability_schedules/<id>` removes them all. Both
      are student-only and in addition to rule 2's endpoints; another student's id is 404.
    - The PUT is **one unit of work**: every row is checked first like a single create, then the
      old rows are removed and the new ones written, with `type="unavailable"` and
      `blocks_auto_invitations=true` set before the one commit. If one row is refused, the answer
      is 400 and no row changes, old or new.
    - `GET /api/app/availability_blockers` (and the PUT's answer) carries `scheduleId`
      (`serialize_calendar_block`) on every row: the id, or null for a block made any other way.
      Old builds ignore the key.
    - The rows are otherwise ordinary blockers. Rules 4–12 apply to them, and the Disponibilidade
      tab lists, edits and deletes them one by one (rules 14–17).
    - A tab edit keeps `schedule_id` while the row still recurs. An edit that makes it a one-off
      clears it.
    - Deleting one occurrence splits the row (`_split_block` → `_clone_block`), and the
      continuation keeps its `schedule_id`.

#### A block over classes the student is in (PAD-772; owner, 26 Nov 2026: "ask them when they save")
Before PAD-772 a block only held invitations and reminders back (rules 4, 5, 11): a student who
blocked days they already had classes on stayed in those classes, and the coach counted on them.

19. **Saving a block answers the classes it covers.** `POST /api/app/availability_blockers`,
    `PUT /api/app/availability_blockers/{id}`, and `PUT /api/app/calendar_block/{id}` when the row is a
    student's availability blocker (`blocks_auto_invitations` true; the calendar's block sheet — web
    `EventDetailSheet`, iOS `app/event/[id].tsx` — opens a student's own blocker from their calendar
    and saves it there) add `coveredClasses` to their answer (additive: an old build ignores it). The
    calendar sheet asks the same way as the availability tab (rule 21). The schedule `PUT` answers a bare list of rows (rule 18), which cannot take a
    key without breaking old builds, so a schedule's list comes from a read made just before its save:
    `POST /api/app/availability_schedules/{id}/covered_classes`, student-only, with the body the `PUT`
    will send, writes nothing and answers `{coveredClasses}` for those rows (rule 20). It lists the student's
    **covered occurrences**: every occurrence on the student's own calendar — what
    `GET /api/app/calendar` builds for a student from `load_lessons_for_player`,
    `load_lesson_instances_for_player` and `build_lesson_events`, so a recurring class's occurrence
    that has no instance row yet counts, and so does a one-off class — that:
    - overlaps an occurrence of the saved block (or of any row of the saved schedule), compared with
      the predicate rules 5 and 12 use (`_windows_overlap` on the class instance window, half-open,
      any overlap — the same test that already holds the student's invitations and reminders back);
    - has not started (the club's clock, `attendance.confirm` rule 9) and is not cancelled;
    - is `planned` or `coming` for the student (`attendanceState`, `attendance.confirm` rule 25):
      not `not_coming`, and not a row the coach already marked (`validated`);
    - and the block occurrence it overlaps starts on a date on or before the earlier of the block's
      recurrence end and its first occurrence's date + `const:BLOCKER_COVERED_HORIZON_DAYS` days (a
      recurring block may have no end: `calendar.blocks` D83, NULL end means forever), so a block
      with the sheet's default end is listed whole, its last day included. For a schedule, each row is
      bounded the same way.

    Each entry carries `model`, `originalId` and `date` exactly as the calendar event does (the
    shape `cancel_attendance` accepts, `attendance.confirm` rule 18), plus `title`, `start` and `end`
    for the list the student reads. Ordered by start. Saving marks nothing by itself. The list is
    what the calendar shows; a virtual occurrence of a lesson the student is on can still have no
    presence for them once materialised (`build_lesson_events`, `calendar_helpers.py:200-218`
    renders the lesson's occurrence when no instance row of theirs exists). Rule 22's re-check skips
    such an entry as `not_enrolled`; it is not an error.
20. **An edit answers only what it newly covers.** For a `PUT`, `coveredClasses` is the covered set
    of the block as saved minus the covered set of the same row(s) as they were before the write,
    computed in the same request. A schedule's read (rule 19) compares the body's rows against the
    rows stored under that id (none for a new schedule). A class
    the student kept at an earlier save is therefore not asked about again while the block still
    covers it.
21. **The student is asked, and only a yes marks.** When `coveredClasses` is not empty, web and iOS
    show one dialog after the save (`blocker-covered-dialog`) listing each class (title, weekday,
    date, time; `blocker-covered-item-<index>`), with **"Sim, não vou"** (`blocker-covered-decline`)
    and **"Manter as aulas"** (`blocker-covered-keep`). Copy (PT, keys under `availability.covered.*`
    in both shells' locales): title "Tens aulas neste período", body "Este bloqueio apanha {count}
    aula(s) em que estás inscrito. Queres avisar que não vais?". Keep closes the dialog and changes
    nothing. Yes sends the listed occurrences to rule 22's endpoint and then re-reads the student's
    calendar and dashboard; the toast says how many were marked. The block is already saved: a
    failed mark shows an error and leaves the block saved, and the student can still decline each
    class from its detail (`attendance.confirm` rule 25). An empty list shows no dialog. The decision
    of what to show from an answer is one shared helper in `@levelup/config`, so the two shells
    cannot drift. The setup guide's schedule editor (`dashboard.student-setup-guide` rules 9–11)
    makes rule 19's read, then the `PUT`, and asks the same way once the `PUT` succeeded; a failed
    read saves without asking, like the failed conflict check of the rule titled "The conflict check
    answers only for students on the asking coach's roster" (the second rule numbered 17).
22. **The mark: `POST /api/app/availability_blockers/decline_covered`** with
    `{occurrences: [{model, originalId, date}]}`, student-only (403 otherwise). The server never
    trusts the list: for each entry it re-checks rule 19 against the student's blockers **as stored
    now** (covered by at least one of them, not started, `planned` or `coming`) and skips any entry
    that fails, writing nothing for it. Each entry that passes is declined through the student's own
    decline path, `cancel_attendance` with the `(model, originalId, date)` shape (`attendance.confirm`
    rules 5, 13, 14, 18): the occurrence is materialised if needed, the presence becomes `not_coming`,
    the spot is freed exactly as any decline frees it (vacancy at once, invitations held to
    `invitationStart`, semi-automatic approval as usual), and the server classifies it proactive,
    plain or late from its own clock (rules 10–12). On a new-engine session the same call runs
    `engine_entry.student_not_going`, unchanged. The answer is
    `{declined: [{model, originalId, date, lessonInstanceId}], skipped: [{model, originalId, date, reason}]}`
    with `reason` one of `not_covered`, `not_enrolled`, `started`, `already_answered`. One entry
    failing never stops the others: each entry runs in its own savepoint, and a refusal from the
    decline path (its `abort` 409 for a started class or 403 for no enrolment, `notification_service.py`
    `cancel_attendance`) is caught and reported under `skipped`, rolling back only that entry. Each
    entry locks the student's presence row before its re-check, so a repeated or parallel yes for the
    same class declines it once: the second finds it `not_coming`, skips it as `already_answered`,
    and the coach is notified once.
23. **What a mark made this way adds to an ordinary decline.** The decline path gains one source,
    `const:DECLINE_SOURCE_AVAILABILITY_BLOCK`, passed only by rule 22:
    - **No message to the student**, meaning no message whose sender is the coach (the coach's
      notice below sits in the same shared conversation with the student as its sender, and is not
      one). The student-facing acknowledgement (the coach's `reminder_declined` template,
      `_free_spot_for_declining_player`) is not sent: the student made the choice in the dialog and
      the toast confirms it (`attendance.confirm` rule 30).
    - **The presence records why:** `presences.decline_source` is set to the constant, and
      `respondedAt` is the instant of the mark on both engines. The serialized presence carries it as
      `declineSource` (null for any other decline). Clients read `declineSource` only while the row
      is `not_coming` and not validated; the server clears it when the presence comes back
      ("Afinal vou", `attendance.confirm` rule 28) as a best effort, and no reader depends on that
      clearing.
    - **The coach, on an old-engine session,** gets the per-cancellation notice every cancellation
      gets there (`attendance.confirm` rule 8, `_notify_coach_of_cancellation`: one message per
      occurrence, a push only when late), with `msg_metadata.availabilityBlock: true` beside the
      existing `cancellation`, `lateCancellation`, `proactiveDecline` and `lessonInstanceId`, which
      keep their meaning. The availability wording replaces the proactive and plain texts and keeps
      the late marker: PT "<nome> marcou-se indisponível e não vai a <aula><quando>." or, late,
      "<nome> marcou-se indisponível e não vai (ATRASADO) a <aula><quando>."; EN "<name> marked
      themselves unavailable and will not attend <class><when>." / "… will not attend (LATE) …". The
      push, sent only when late, keeps its title ("Cancelamento tardio" / "Late cancellation"). The
      block's title and times are never in it (rule 8, P-CALENDAR-4).
    - **The coach, on a new-engine session,** gets no chat notice, as for any No there:
      `cancel_attendance` returns into `engine_entry.student_not_going` before the coach notice
      (`notification_service.py:4497-4501` vs `:4553`), and the engine sends none
      (`engine_entry.py:179-186`). On both engines the coach sees the reason on the student's row as
      a detail line (`attendance.confirm` rule 30).
    - **No reminder** reaches the student for a marked occurrence: the decline sets `confirmed` and
      `status = absent` (`notification_service.py:4051-4053`), and the reminder pass (`_reminder_recipients`) skips a row
      whose `status` is set (`reminder_skips`) and one that has answered (`answered_for_reminders`)
      (`notification_service.py:3230-3233, 3269, 3317`;
      `notifications.reminders` rules 3 and 23), whether or not the block still covers it.
24. **Deleting or shortening a block undoes nothing.** Marks made through rule 22 stay when the block
    is deleted, shortened or moved; nothing is sent. A student who can come after all uses "Afinal
    vou" on that class (`attendance.confirm` rule 28: back in if a spot is free, else the waiting
    list). Racing the invitation engine for a seat it may already have given away is what rule 28's
    spot check is for.
25. **Older builds.** A build that does not read `coveredClasses` saves the block as before and
    nothing is marked: the block keeps holding invitations and reminders back (rules 4, 5, 11), as
    today. No capability header is needed: the blocker answer key is additive, the schedule answer
    is unchanged, and the schedule read and the mark are separate calls only a new build makes.

### Acceptance Criteria

#### CALENDAR-STUDENT-BLOCKERS-1: Blocker suppresses auto-invitation
- **Given** a student with an `unavailable` blocker overlapping a class instance window
- **When** the invitation engine computes eligibility for that instance's vacancy
- **Then** the student is NOT in the eligible list

#### CALENDAR-STUDENT-BLOCKERS-2: Non-overlapping blocker does not suppress
- **Given** a student whose only blocker does not overlap the class window
- **When** eligibility is computed
- **Then** the student IS eligible

#### CALENDAR-STUDENT-BLOCKERS-3: Coach is warned when scheduling into a blocked window
- **Given** a coach creating a class at a time overlapping a selected student's blocker
- **When** they submit the class
- **Then** a confirmation warning names the student and states that notifications cannot be sent in that period
- **And** cancelling aborts the create; confirming creates the class with that student enrolled

#### CALENDAR-STUDENT-BLOCKERS-4: Manual notification to a blocked student is refused
- **Given** an enrolled student with a blocker overlapping the class window
- **When** the coach clicks "Lembrar" or manually notifies that student
- **Then** no message, web push or Expo push reaches that student
- **And** the response reports them under `blocked` and the UI shows the "cannot send notifications" warning
- **And** other enrolled students who are not blocked still receive their notification

#### CALENDAR-STUDENT-BLOCKERS-5: Blocked student is never reached by any class-slot notification
- **Given** a student with a blocker overlapping a class instance window
- **When** any path fires (auto invitation round, scheduler reminder, waiting-list offer, manual send)
- **Then** no `Message` is created for that student for that instance and no push is dispatched

#### CALENDAR-STUDENT-BLOCKERS-6: Student manages blockers
- **Given** an authenticated student
- **When** they open `/availability`
- **Then** they can create, edit, and delete one-time and recurring blockers
- **And** each blocker is clearly shown as an unavailable window

#### CALENDAR-STUDENT-BLOCKERS-7: Availability page fits the mobile viewport
- **Given** an authenticated student on a mobile-width viewport (375px)
- **When** they open `/availability`, with and without the blocker form expanded
- **Then** the document does not scroll horizontally (`documentElement.scrollWidth <= clientWidth`)
- **And** the "Add blocker" button is fully inside the viewport (its right edge is within the viewport width)

#### CALENDAR-STUDENT-BLOCKERS-8: The availability tab is two cards with no floating action (PAD-356)
- **Given** an authenticated student
- **When** they open the availability tab on web or iOS
- **Then** the Indisponibilidade card (explanation, Criar bloqueio, the student's blocks) and the Pedidos de aula card (explanation, Marcar aula, open requests with state and Retirar) are shown, and there is no floating "+"

#### CALENDAR-STUDENT-BLOCKERS-9: A block is created from the sheet, single or recurring (PAD-356)
- **Given** the Criar bloqueio sheet
- **When** the student saves a single block with a reason, or a recurring block on chosen weekdays with a start and end date
- **Then** the block is created and listed in the Indisponibilidade card with its reason

#### CALENDAR-STUDENT-BLOCKERS-10: An end before the start is refused before any request (PAD-356)
- **Given** the sheet with an end time at or before the start time (or a cleared start or end time, or, recurring, an end date before the start date)
- **When** the student saves
- **Then** the sheet shows `availability.validation.end_before_start` (or `time_required`, or `end_date_before_start_date`) and no request is sent

#### CALENDAR-STUDENT-BLOCKERS-11: The conflict check answers for the coach's own roster, and its failure never blocks the save (rules 8, 9)
- **Given** a blocked student on one coach's roster, and a second coach who does not coach them
- **When** each coach asks `/api/app/notify/availability_conflicts` about that student, and a class is saved while the check is failing
- **Then** the first coach is told the student is blocked; the second gets 200 with nobody listed
- **And** when the check fails it returns no warning, so the form saves
test: `frontend/apps/mobile/src/features/calendar/unavailable-check.test.ts` › `a failed lookup saves anyway` (+1 more)

#### CALENDAR-STUDENT-BLOCKERS-12: The sheet turns what the student filled in into the block that is saved (rules 15, 16)
- **Given** the Criar bloqueio sheet
- **When** the student saves a single block, a recurring block, and reopens an existing one
- **Then** a single block is saved with its date, its times and the reason as its title, and with no title when the reason is blank
- **And** a recurring block is saved weekly on the chosen weekdays until its end date
- **And** with no weekday chosen it repeats on the start date's weekday, and with no end date it ends three months after the start
- **And** an existing block opens in the sheet with its own values
test: `frontend/packages/config/src/blocker-draft.test.ts` › `builds a recurring block from its weekdays and end date` (+3 more)

#### CALENDAR-STUDENT-BLOCKERS-13: A student's edit writes what was sent, and a blocker made one-off stops repeating (rule 3, and rule 17 "An edit writes what was sent")
- **Given** a student's weekly blocker on Mondays with a reason
- **When** the student empties the reason, sends a null end date while it still repeats, and then makes it a one-off
- **Then** the emptied reason is cleared, and the null end date is 400 naming `endDate`, with the end date unchanged
- **And** once it is a one-off the student is blocked on that Monday only, and free two Mondays later
test: `backend/padel_app/tests/test_pad367_falsy_values_at_the_route.py` › `test_a_students_blocker_edit_clears_an_emptied_title_and_refuses_a_null_end_while_recurring` (+2 more)

#### CALENDAR-STUDENT-BLOCKERS-14: Deleting or moving one occurrence keeps the rest of the series a blocker (rules 3, 5; B-727)
- **Given** a student's weekly blocker on Mondays 10:00–11:00 from 2026-10-05 to 2026-10-26
- **When** the student deletes the 2026-10-12 occurrence alone (`scope: "single"`), which splits the series
- **Then** the continuation row keeps `blocks_auto_invitations`: the student is still blocked on 2026-10-19 for both the live engine's predicate (`blocked_user_ids_for_window`) and the new engine's store (`availability_blocker` in `TableStore._own_blocks`), is free on 2026-10-12, and the student's list still shows the continuation
test: `backend/padel_app/tests/test_b727_split_blocker_keeps_suppression.py` › `test_deleting_one_occurrence_keeps_the_rest_blocking_the_live_engine` (+1 more)

#### CALENDAR-STUDENT-BLOCKERS-15: The blockers list names each row's schedule, and a one-off edit leaves it (rule 18)
- **Given** a student with a two-row schedule and one hand-made block
- **When** they GET `/api/app/availability_blockers`, then edit one schedule row on the tab to a one-off
- **Then** the schedule rows carry the same `scheduleId` and the hand-made block `scheduleId: null`; after the edit, the edited row's `scheduleId` is null and the other keeps it
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_the_blockers_list_carries_schedule_id_and_a_one_off_edit_clears_it`

#### CALENDAR-STUDENT-BLOCKERS-16: Splitting a schedule row keeps the continuation in the schedule (rule 18)
- **Given** a student's schedule row, weekly on Mondays, and the clock pinned
- **When** the student deletes one Monday's occurrence (`scope: "single"`), and separately moves one occurrence to the Tuesday (`/reschedule_block`, scope single)
- **Then** the continuation row of the series keeps the row's `schedule_id`, and the moved one-off clone has none
test: `backend/padel_app/tests/test_pad839_student_setup_guide.py` › `test_a_split_schedule_row_keeps_its_schedule_and_a_one_off_clone_leaves_it`

#### CALENDAR-STUDENT-BLOCKERS-17: A saved block answers exactly the student's own covered classes (rule 19)
- **Given** a student on a weekly class (Wednesdays 19:00–20:00, no instance rows yet), a one-off class on Tuesday 18:00, a materialised Wednesday they already declined, a Wednesday class whose start has passed, another student's class in the same window, and the clock pinned
- **When** the student creates a recurring block Monday–Thursday 08:00–23:00 for three weeks, and separately a one-off block 20:00–21:00 that touches the Wednesday class only at its end instant
- **Then** `coveredClasses` lists the not-yet-started Wednesday occurrences (virtual ones included) and the Tuesday one-off, each with `model`, `originalId`, `date`, `title`, `start`, `end`, ordered by start, and omits the declined, started and other student's classes
- **And** the one-off block touching only at 20:00 covers nothing (half-open, same predicate as `blocked_user_ids_for_window`)
- **And** for a recurring block with no end, a class is listed only when the block occurrence it overlaps starts on or before the block's first occurrence date + `const:BLOCKER_COVERED_HORIZON_DAYS` days, while a block starting six weeks ahead with the sheet's default end is listed whole, a class late on its last day included
- **And** no presence changed, no vacancy opened and no message was created by the save
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_create_answers_the_covered_occurrences_and_marks_nothing`

#### CALENDAR-STUDENT-BLOCKERS-18: An edit, and a schedule save, answer only newly covered classes (rule 20)
- **Given** a student's block over Monday that already covers a Monday class they chose to keep, and a two-row schedule over Monday
- **When** the student edits the block to cover Monday and Wednesday, and asks `availability_schedules/{id}/covered_classes` about the schedule with Thursday added
- **Then** the edit answers only the Wednesday occurrences and the schedule read only the Thursday ones; the kept Monday class is not listed again
- **And** an edit that covers nothing new answers `coveredClasses: []`; the schedule read wrote nothing, and the schedule `PUT` still answers a bare list of rows
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_an_edit_and_a_schedule_save_answer_only_newly_covered_classes`

#### CALENDAR-STUDENT-BLOCKERS-19: Yes declines each covered class through the ordinary decline, with no message to the student (rules 22, 23)
- **Given** a student whose block covers an old-engine Wednesday occurrence with no instance row (before the reminder instant) and a materialised Thursday occurrence inside the coach's cancellation deadline, the coach's `reminder_declined` template customised, and the clock pinned
- **When** the student posts both to `/api/app/availability_blockers/decline_covered`
- **Then** both are answered under `declined`; the Wednesday occurrence is materialised and both presences are `not_coming` with `declineSource` = `const:DECLINE_SOURCE_AVAILABILITY_BLOCK`
- **And** each has an open vacancy exactly as `cancel_attendance` would leave it (the Wednesday one held to `invitationStart` through `invite_not_before`), Wednesday recorded as a proactive decline and Thursday as late
- **And** no message whose sender is the coach is created for either (no `reminder_declined`), and the coach has exactly one cancellation notice per occurrence (sender the student) carrying `availabilityBlock: true` beside `proactiveDecline` (Wednesday true) and `lateCancellation` (Thursday true), with the availability wording, the late one marked "(ATRASADO)", and a push only for the late Thursday one
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_yes_declines_through_the_ordinary_path_without_a_student_message`

#### CALENDAR-STUDENT-BLOCKERS-20: The mark re-checks every entry on the server (rule 22)
- **Given** a student with one block over a Wednesday class
- **When** they post that occurrence plus one their block does not cover, one of a class they are not in, one that has started, and one they already declined; and a coach posts to the same endpoint
- **Then** only the covered Wednesday is declined; the others are under `skipped` with `not_covered`, `not_enrolled`, `started` and `already_answered`, and nothing was written for them (no instance materialised, no presence changed, no message)
- **And** the coach gets 403
- **And** a listed virtual occurrence whose materialised instance holds no presence for the student is skipped as `not_enrolled`, the other entries still declined
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_the_mark_rechecks_each_entry_and_skips_what_fails`

#### CALENDAR-STUDENT-BLOCKERS-27: A repeated or parallel yes declines a class once, and one refusal rolls back only its entry (rule 22)
- **Given** a student's covered Wednesday class, and a second entry whose class starts between the re-check and the decline (the decline path's 409)
- **When** the same yes is posted twice, one after the other and from two concurrent requests
- **Then** the class is declined once: one coach notice, one vacancy; the repeat answers it under `skipped` as `already_answered`
- **And** the entry refused by the decline path is under `skipped` as `started`, nothing of it is written, and the other entries in the same request are declined
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_a_repeated_yes_declines_once_and_a_refusal_rolls_back_only_its_entry`

#### CALENDAR-STUDENT-BLOCKERS-21: On a new-engine session the mark is the engine's own "not going" (rule 22)
- **Given** a covered occurrence of a session the new engine runs (`engine_for(instance) == "new"`)
- **When** the student marks it through `decline_covered`
- **Then** `engine_entry.student_not_going` handled it (the engine records the absence and plans the spot), `declineSource` is set and `respondedAt` is the mark's instant
- **And** no message whose sender is the coach is created, and no coach chat notice exists either (as for any No on the new engine); the serialized presence carries `declineSource` for the coach's detail line
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_a_new_engine_session_is_marked_by_the_engine`

#### CALENDAR-STUDENT-BLOCKERS-22: A marked class is never reminded, and deleting the block undoes nothing (rules 23, 24)
- **Given** a class the student marked through `decline_covered`
- **When** the student deletes the block, and the class's reminder pass then runs
- **Then** the presence stays `not_coming` with its `declineSource`, no vacancy closes, and the pass sends the student nothing
- **And** "Afinal vou" (`respond_reminder` with `yes`) with a free spot brings them back to `coming`, and the coach's row then shows no unavailability detail
- Today the pass already skips a declined presence: the decline writes `confirmed` and `status` (`notification_service.py:4051-4053`), and `_reminder_recipients` skips both (`answered_for_reminders`, 3230-3233; `reminder_skips`, 3269; 3317).
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_a_marked_class_is_not_reminded_and_survives_the_block_delete`

#### CALENDAR-STUDENT-BLOCKERS-23: What the dialog does with a save's answer is one shared decision (rule 21)
- **Given** a save answer with no `coveredClasses` key (an old server), with an empty list, and with two classes
- **When** the shared helper decides what follows the save, and the student answers yes or keep
- **Then** no key and an empty list ask nothing; two classes ask once, listing both in order
- **And** yes sends exactly the listed `(model, originalId, date)` entries; keep sends nothing; a failed mark reports the error and never reports the block unsaved
test: `frontend/packages/config/src/blocker-covered.test.ts` › `[CALENDAR-STUDENT-BLOCKERS-23] asks only when the save answers covered classes, and yes sends exactly those`

#### CALENDAR-STUDENT-BLOCKERS-24: Web asks after the save and marks only on yes (rules 21, 25)
- **Given** the web Disponibilidade tab with the API stubbed so the save answers two covered classes
- **When** the student saves a block from `blocker-sheet`, then answers `blocker-covered-keep`; and again, answering `blocker-covered-decline`
- **Then** `blocker-covered-dialog` lists both (`blocker-covered-item-0`, `-1`); keep closes it with no further request; yes posts both to `decline_covered` and shows the marked count
- **And** a save answering no covered classes shows no dialog, and a failed mark shows an error with the block still listed
test: `frontend/apps/web/src/components/availability/BlockerCoveredDialog.test.tsx` › `[CALENDAR-STUDENT-BLOCKERS-24] asks after the save and marks only on yes`

#### CALENDAR-STUDENT-BLOCKERS-25: iOS asks after the save and marks only on yes (rules 21, 25)
- **Given** the iOS availability tab with the API mocked the same way
- **When** the student saves, then keeps; and again, then says yes
- **Then** the same dialog, test ids and requests as CALENDAR-STUDENT-BLOCKERS-24, and the calendar and dashboard queries are invalidated after a yes
test: `frontend/apps/mobile/src/features/availability/blocker-covered.test.tsx` › `[CALENDAR-STUDENT-BLOCKERS-25] asks after the save and marks only on yes`

#### CALENDAR-STUDENT-BLOCKERS-26: The setup guide's schedule save asks the same way (rules 18, 21)
- **Given** the setup guide's schedule step on web and on iOS, the schedule read answering one covered class
- **When** the student saves the schedule
- **Then** the read is made before the `PUT`, the same dialog appears once the `PUT` succeeded and before the guide moves on, and the guide moves on after yes or keep
- **And** a failed read saves the schedule and moves on without asking
test: `frontend/apps/web/src/components/setup-guide/StepUnavailability.test.tsx` › `[CALENDAR-STUDENT-BLOCKERS-26] a schedule over a class asks before moving on` (+ `frontend/apps/mobile/src/features/setup-guide/step-unavailability.test.tsx` › same name)

#### CALENDAR-STUDENT-BLOCKERS-28: Editing a blocker from the calendar's block sheet answers and asks the same way (rules 19–21)
- **Given** a student's availability blocker opened from their calendar (web `EventDetailSheet`, iOS `app/event/[id].tsx`), and a coach's own `personal` block
- **When** the student widens the blocker over a class they are in and saves through `PUT /api/app/calendar_block/{id}`, and the coach saves their block the same way
- **Then** the student's answer carries `coveredClasses` with that class and the same dialog follows on web and on iOS, marking only on yes
- **And** the coach's answer carries no `coveredClasses` key
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_a_calendar_block_edit_of_a_blocker_answers_covered_classes` (+ `frontend/apps/web/src/components/calendar/EventDetailSheet.covered.test.tsx` and `frontend/apps/mobile/src/features/calendar/event-detail-covered.test.tsx` › `[CALENDAR-STUDENT-BLOCKERS-28] a blocker edited from the calendar asks after the save`)

### Not this spec (PAD-772)
- `POST /api/app/add_event` (the calendar's "add event" sheet, web `AddEventSheet`, iOS `app/event/new.tsx`): it creates only `personal`, `break`, `holiday` and `off_work` blocks and never sets `blocks_auto_invitations` (`add_event_service`), so what it saves is not an availability block; a student's blocker is created only on the availability tab or the setup guide.
- Marking occurrences that appear after the save (a new enrolment, a class created later, or anything beyond the horizon) — see Open questions.
- Undoing marks when a block is deleted or shortened (rule 24).
- Moving one block occurrence on the calendar (`/reschedule_block`) or deleting one occurrence: neither asks.
- A coach creating a block for a student: it does not exist (`add_event_service` is user-scoped and rule 2's routes refuse non-students).
- The student acknowledgement a self-decline sends with no reminder ever sent (the ticket's second finding, old engine only): unchanged; see Open questions.

### Today (PAD-772; read at `origin/staging` 6b05b2689)
- The block routes only save: `frontend_api.py:1962-1977` → `student_availability_service.py:create_student_blocker` / `update_student_blocker` (lines 55-80); the schedule `PUT` is `put_student_schedule`. Nothing lists or touches the student's classes.
- Every block reader only filters: `blocked_user_ids_for_window` (`student_availability_service.py:227`, half-open `_windows_overlap` at 209), `blocked_players_for_instance` (303), `instance_window_is_blocked_for_user` (340), the delivery backstop in `system_messages.py` (`_BLOCKABLE_MESSAGE_TYPES`), and the new engine's `TableStore._own_blocks` (`engine_store.py:446`, candidates only). No path marks a blocked student absent; no periodic job does either.
- The student's "Não vou poder ir" is `POST /api/app/notify/cancel_attendance` (`notification_engine_api.py:574`) → `cancel_attendance` (`notification_service.py:4436`): resolves or materialises the occurrence (`_resolve_occurrence_for_student`, 4401), records `proactive_decline` or `cancelled`, sends the coach `_notify_coach_of_cancellation` (`system_messages.py:225`), then `_free_spot_for_declining_player` (4029), which sets `absent`/`justified`, **sends the coach's `reminder_declined` template to the student unconditionally** (4058-4066) and opens the vacancy. On a new-engine session it returns early into `engine_entry.student_not_going` (`engine_entry.py:179`), which sends the student nothing.
- The ticket's message at 17:42 the day before the class: the block had suppressed the reminder, so none was sent; the student declined from their own device, and 4058-4066 sent the coach's customised `reminder_declined` text ("Vale, então não conto contigo amanhã"; the PT default is "Entendido, obrigado por avisares!", `notification_config.py`). Triage: `docs/plans/engine/triage-PAD-772.md` (local).
- A declined presence is not reminded (`notifications.reminders` rules 3, 23). The coach's row detail line is `cancellationDetail` in `@levelup/config` (`attendance-state.ts:157`), used by web `AttendanceRow.tsx` / `ParticipantPopup.tsx` and iOS `ParticipantRow.tsx` / `ParticipantSheet.tsx`.
- A student's blocker also appears on their own calendar (`load_calendar_blocks_for_user`) and opens in the calendar's block sheet (web `EventDetailSheet.tsx:124`, iOS `app/event/[id].tsx` via `features/calendar/hooks.ts:114`), which saves through `PUT /api/app/calendar_block/{id}` (`frontend_api.py:1913`, `edit_event_service`, which keeps `blocks_auto_invitations`). `POST /api/app/add_event` (`frontend_api.py:1898`) creates only `personal`/`break`/`holiday`/`off_work` blocks (`CalendarBlockType`), never a blocker.
- The block sheets are web `components/availability/BlockerSheet.tsx` (page `pages/AvailabilityPage.tsx`) and iOS `features/availability/BlockerSheet.tsx` (tab `app/(tabs)/availability.tsx`); the client wrapper is `packages/api/src/resources/availability.ts`.
- `presences.left_reason` is read by the new engine to decide who holds a seat (`engine_store.py:144, 194`), so the source of a decline cannot be stored there: a new column.

### Waves (PAD-772)
1. Storage for CALENDAR-STUDENT-BLOCKERS-19 and ATTENDANCE-CONFIRM-42 — `const:DECLINE_SOURCE_AVAILABILITY_BLOCK`, migration adding nullable `presences.decline_source` with a CHECK, `serialize_presence`'s `declineSource`. No criterion turns green here; the wave's own test pins the column and the serialized key.
2. CALENDAR-STUDENT-BLOCKERS-17, -18, -28 (backend test) — backend: the covered set (a service over the calendar helpers), `coveredClasses` on the two blocker save routes and on `PUT /calendar_block/{id}` for a blocker, and the schedule read. Adds `POST /availability_schedules/{id}/covered_classes` to `frontend/apps/mobile/API-CONTRACT.md`.
3. CALENDAR-STUDENT-BLOCKERS-19, -20, -21, -22, -27, ATTENDANCE-CONFIRM-43 (all green here) — backend: `decline_covered` (per-entry savepoint and row lock), the decline source through `cancel_attendance` / `_free_spot_for_declining_player` / `student_not_going`, the coach notice wording and marker, clearing on come-back. Adds `POST /availability_blockers/decline_covered` and the new answer keys to `frontend/apps/mobile/API-CONTRACT.md`.
4. CALENDAR-STUDENT-BLOCKERS-23 (green here), ATTENDANCE-CONFIRM-42's `attendance-state.test.ts` test — `@levelup/config` (`blocker-covered.ts`, `cancellationDetail`), `@levelup/api` (`declineCoveredClasses`, the answer types), `@levelup/types`.
5. CALENDAR-STUDENT-BLOCKERS-24, -25, -26, -28 (client tests), ATTENDANCE-CONFIRM-42's row tests (CONFIRM-42 and -28 are green only after this wave) — web and iOS together: the dialog on the availability tab, the calendar's block sheet and the setup guide, the coach's detail line, PT/EN locales.

### Open questions (PAD-772; the owner could not answer during this run, so each is decided with its reason)
- **Occurrences that appear after the save inside the block** (a class created later, a new enrolment, or beyond `const:BLOCKER_COVERED_HORIZON_DAYS`) — options: (a) only what is on the student's calendar at save time is asked and marked; (b) remember the yes on the block and mark later occurrences when they become known (e.g. at the reminder pass). Decision: **(a)**, because the owner chose "ask them when they save" over "always mark", and (b) marks without asking, which is the option not chosen. Those later occurrences still get no invitation and no reminder (rules 4, 11), and a coach adding the student is warned (rule 9). Reversible by the owner.
- **The horizon value** — decision: 92 days counted from the block's first occurrence, the three months the sheet already gives a recurring block with no end date (rule 16), so a default block is asked about whole; only an endless block is cut.
- **One coach notice per occurrence, or one summary per save** — a default three-month Mon–Thu block over a twice-weekly class is about 25 notices (chat messages; pushes only for late ones). Decision: **per occurrence**, because P-ATTENDANCE-2 and `attendance.confirm` rule 8 promise one notification per cancellation, and a promise is an owner decision; a summary needs the owner's word to change that promise.
- **Delete or shorten a block** — options: reverse the marks automatically, or leave them. Decision: leave them (rule 24): the seat may already be given away, and "Afinal vou" (PAD-684) is the owner's way back, with its spot check.
- **Which classes count** — decision: any overlap, the predicate the block already uses for invitations and reminders (rules 5, 12), so a class the block holds invitations back for is the same class it asks about. Rows the coach already marked are not asked about (`attendance.confirm` rule 29: the coach's mark stands).
- **The self-decline acknowledgement with no reminder sent** (the ticket's 17:42 message, old engine only) — options: send `reminder_declined` only when a reminder was sent, or leave it. Decision: leave it here; the new engine already sends nothing, and the owner's pick did not cover it. Only rule 22's decline drops the acknowledgement.
- **The setup guide's schedule** — decision: in scope (rule 21), because its rows are ordinary blocks (rule 18) and a student setting up a weekly schedule over classes they are already in is the ticket's own case.
