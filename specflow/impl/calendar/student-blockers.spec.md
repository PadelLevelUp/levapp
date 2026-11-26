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
7. The student's availability view clearly indicates each blocker (title, one-time date or recurring days, time window, and an "unavailable" indication: no invitations or reminders in that window, and classes the student is in during it are marked "Não vai" when the block is saved, rule 19).
8. Conflict pre-check (PAD-107): `POST /api/app/notify/availability_conflicts` with `{date, startTime, endTime, playerIds}` returns `{blocked: [{playerId, name}]}` — the subset of those players whose owning user has a blocker overlapping the proposed window. Coach-only (403 otherwise). It returns player names ONLY; blocker titles, descriptions and times are the student's private calendar and are never exposed to the coach.
9. Scheduling warning (PAD-107): when a coach schedules a class whose window overlaps a selected student's blocker, the UI warns before creating and requires explicit confirmation ("O aluno (nome) marcou-se como indisponível nesta hora. Tem a certeza que pretende avançar com ele na aula? Não poderá enviar-lhe notificações neste período por ele estar marcado como indisponível e não querer ser incomodado."). Cancelling aborts the create; confirming creates the class normally. For a recurring class the check is evaluated on the first occurrence.
10. Send-time block (PAD-107): `POST /api/app/notify/manual` and `POST /api/app/notify/send_reminders` SKIP blocked students, still deliver to everyone else, and return `{sent, blocked: [{playerId, name}]}`. The UI surfaces "Não pode enviar notificações ao aluno (nome) neste horário, pois ele marcou-se como indisponível."
11. Hard backstop (PAD-107): `_send_system_message` refuses to deliver any `notification_invite`, `notification_reminder` or `waiting_list_offer` bound to a lesson instance whose window overlaps a blocker of the recipient. This is the single delivery choke point, so it also covers the APScheduler reminder job, the auto-invitation rounds and the waiting-list cascade — not just the coach-facing buttons. Neither the chat message nor the web/Expo push is created.
12. The window compared is always the CLASS INSTANCE window (`start_datetime`/`end_datetime`), never the moment the notification is sent.
13. Mobile-responsive (PAD-119): the `/availability` page fits within the viewport at small screen widths (≥320px) — the document never scrolls horizontally, and every control, notably the "Add blocker" action, is fully visible without horizontal scrolling. The page header stacks vertically below the `sm` breakpoint rather than forcing the title and the action button onto one row.

14. **(PAD-356) The student's availability tab is two cards, each with an explanation and its own
    call to action, on web and iOS. There is no floating "+".**
    - **Indisponibilidade** (`availability-blockers-card`): an explanation of what a block does
      (it holds invitations and reminders back, and marks classes the student is in during it
      "Não vai" when saved, rule 19; never "a block only stops invitations"),
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

#### A block over classes the student is in (PAD-772; owner, 26 Nov 2026, corrected the same day: "Nothing should be asked about")
Before PAD-772 a block only held invitations and reminders back (rules 4, 5, 11): a student who
blocked days they already had classes on stayed in those classes, and the coach counted on them.
PAD-772 first shipped a question after the save; the owner corrected it (26 Nov 2026, relayed by
the orchestrator, M-9669): "Nothing should be asked about. That's the point of the ticket. If the
student decided to block a time where he was enrolled on classes, we say he won't go, but not send
him a text every day for something he decided." Rules 19–26 state the corrected behaviour.

19. **Saving a block marks the classes it covers "Não vai", at once, with no question.** Every save
    that writes a student's availability blocker (`blocks_auto_invitations` true) marks the
    student's **covered occurrences** in the same request: `POST /api/app/availability_blockers`,
    `PUT /api/app/availability_blockers/{id}`, `PUT /api/app/calendar_block/{id}` when the row is the
    student's blocker (the calendar's block sheet — web `EventDetailSheet`, iOS `app/event/[id].tsx`
    — opens a student's own blocker from their calendar and saves it there),
    `PUT /api/app/availability_schedules/{id}` (rule 18, every row of the schedule), and
    `POST /api/app/reschedule_block/{id}` when the row is the student's blocker (the calendar's drag
    of one occurrence or of the series, web only: iOS has no block drag; the row it moves and any
    clone it makes count as saved. `reschedule_block_service` returns nothing today, so the marking
    step needs it to hand back the rows it moved and cloned, with the row as it was before).
    The covered occurrences are every occurrence on the student's own calendar — what
    `GET /api/app/calendar` builds for a student from `load_lessons_for_player`,
    `load_lesson_instances_for_player` and `build_lesson_events`, so a recurring class's occurrence
    that has no instance row yet counts, and so does a one-off class — that:
    - overlaps an occurrence of the saved block (or of any row of the saved schedule), compared with
      the predicate rules 5 and 12 use (`_windows_overlap` on the class instance window, half-open,
      any overlap — the same test that already holds the student's invitations and reminders back);
    - has not started (the club's clock, `attendance.confirm` rule 9) and is not cancelled;
    - is `planned` or `coming` for the student (`attendanceState`, `attendance.confirm` rule 25):
      not `not_coming` (an earlier decline keeps its own source and is not declined again), and not
      a row the coach already marked (`validated`; `attendance.confirm` rule 29, the coach's mark
      stands);
    - and the block occurrence it overlaps starts on a date on or before the earlier of the block's
      recurrence end and its **horizon end**: the later of the club's today and the row's first
      occurrence date, + `const:BLOCKER_COVERED_HORIZON_DAYS` days (a recurring block may have no
      end: `calendar.blocks` D83, NULL end means forever). So a block with the sheet's default end is
      marked whole, its last day included, and an edit to a block that began months ago still marks
      up to the horizon from today. A row made by splitting another (`_split_block` / `_clone_block`,
      a moved or deleted occurrence) uses the first occurrence date of the row it was split from, as
      the marking step read it before the write, so a split never pushes the horizon further out.
      For a schedule, each row is bounded the same way.

    Each covered occurrence is declined as rule 22 says. **Order and failure:** the block is written
    and committed first, exactly as before PAD-772 (its validation and refusals unchanged); the marks
    follow in the same request, one occurrence at a time, each in its own savepoint. An occurrence
    whose decline is refused or raises is logged, the others are still marked, and the save still
    answers its ordinary success status; the block is never unsaved by a mark. What the rollback
    undoes is bounded: it undoes the database writes that occurrence made before the failure and not
    yet committed. A new-engine occurrence runs outside that unit of work: the engine commits its own
    unit (`engine_entry.handle`), so the absence is durable, and only then sends its outbox, as for the
    student's own No; a failure after that commit leaves the engine's absence in place, and an
    occurrence materialised before it is not un-materialised. The old engine's approval prompt and
    invitation start are armed on the scheduler only after the occurrence's commit (`scheduler._arm_now`
    inside a unit of work waits for the commit), because the job reads with its own session and would
    find nothing before it. Reading what the block covers is guarded the same way as each occurrence: a
    failure is logged and the save answers its ordinary success with `markedClasses: []`. On an old-engine session the coach notice's live event and push go out from
    `_notify_coach_of_cancellation` before the request commits, so a coach push already sent is
    not recalled. An occurrence left unmarked still gets no reminder, attendance request or
    invitation while the block covers it (rules 4, 11), and the student can decline it from its
    detail (`attendance.confirm` rule 25). A virtual occurrence of a lesson the student is on can
    hold no presence for them once materialised (`build_lesson_events`); it is skipped, not an
    error.
20. **An edit marks only what it newly covers.** For an edit (the two `PUT`s on a blocker, the
    schedule `PUT`, and `reschedule_block`), the occurrences marked are the covered set of the block
    as saved minus the covered set of the same row(s) as they were before the write, computed in the
    same request (for a new schedule, the rows before are none). So a class the student brought back
    with "Afinal vou" (`attendance.confirm` rule 28) while the block still covers it is not marked
    again by an edit that leaves it covered; only a widening or a move onto a new class marks.
    Intended consequence: an edit that first shrinks the block off such a class and a later edit that
    widens it back over the class marks it again, because the second edit newly covers it.
21. **What the student sees: one line, never a question.** The answer of
    `POST`/`PUT /api/app/availability_blockers` and of `PUT /api/app/calendar_block/{id}` on a
    student's blocker carries `markedClasses`: the occurrences this save marked, each with `model`,
    `originalId`, `date`, `lessonInstanceId`, `title`, `start`, `end`, ordered by start. It also
    carries `coveredClasses: []`, always empty (rule 25). When `markedClasses` is not empty, web and
    iOS show one non-blocking toast after the save, with no button and nothing to answer:
    PT "{count} aula(s) marcada(s) como Não vai" (keys `availability.covered.marked_one` /
    `_other` / `_zero` in both shells' locales), and re-read the student's calendar and dashboard. An
    empty or missing `markedClasses` shows only what a save showed before PAD-772. The decision of
    what to show from an answer is one shared helper in `@levelup/config`, so the two shells cannot
    drift. The toast is the lightest confirmation the app has; it is not a message (rule 23). The
    schedule `PUT` answers a bare list of rows (rule 18) and `reschedule_block` answers 204, so the
    setup guide's schedule editor (`dashboard.student-setup-guide` rules 9–11) and the web
    calendar's drag show no line: the setup guide re-reads the calendar and dashboard after a
    successful save, and web `CalendarPage` already re-reads its events after a drag, which shows the
    marks. iOS has no block drag. The setup guide no longer reads anything before its `PUT`.
22. **The mark of one occurrence.** For each covered occurrence the server declines through the
    student's own decline path, `cancel_attendance` with the `(model, originalId, date)` shape
    (`attendance.confirm` rules 5, 13, 14, 18) and the source `const:DECLINE_SOURCE_AVAILABILITY_BLOCK`:
    the occurrence is materialised if needed, the presence becomes `not_coming`, the spot is freed
    exactly as any decline frees it (vacancy at once, invitations held to `invitationStart`,
    semi-automatic approval as usual), and the server classifies it proactive, plain or late from its
    own clock (rules 10–12). On a new-engine session the same call runs
    `engine_entry.student_not_going`, unchanged. Before the decline the occurrence locks the class's
    instance row and then the student's presence row (the engine's store locks the instance first, so
    a tick at the same moment cannot deadlock with it) and re-checks rule 19 (not started, `planned`
    or `coming`, not validated), so two saves at once, or a save and a legacy mark call (rule 25),
    decline a class once and notify the coach once. A refusal from the decline path (its `abort` 409
    for a started class, 403 for no enrolment) rolls back that occurrence only.
23. **What a mark made this way adds to an ordinary decline.** The decline path gains one source,
    `const:DECLINE_SOURCE_AVAILABILITY_BLOCK`, passed only by rule 22 (a save's mark, or the legacy
    call of rule 25):
    - **No message to the student.** No message whose sender is the coach is created for the mark
      (the coach's notice below sits in the same shared conversation with the student as its sender,
      and is not one). The student-facing acknowledgement (the coach's `reminder_declined` template,
      `_free_spot_for_declining_player`) is not sent: the student decided by saving the block
      (`attendance.confirm` rule 30).
    - **No reminder and no attendance request** reaches the student for a marked occurrence, on
      either engine, whether or not the block still covers it. Old engine: the decline sets
      `confirmed` and `status = absent` (`_free_spot_for_declining_player`), and the reminder pass
      (`_reminder_recipients`) skips a row whose `status` is set (`reminder_skips`) and one that has
      answered (`answered_for_reminders`) (`notifications.reminders` rules 3 and 23). New engine:
      the absence takes the student out of the session's `going` or puts them in `absent`, and the
      attendance request goes only to going students not in `absent` (`invitation_engine.messages.due`;
      the coach's ask names them `not_coming`, `coach_ask`). While the block covers the class the
      delivery backstop of rule 11 holds every `notification_reminder` back as well, the new engine's
      attendance request included (it is sent as one through `_send_system_message` by
      `engine_outbox._attendance_request`).
    - **Everything else is as for any decline** (lead's pick, reversible; Open questions): the
      presence is `absent` and, on the old engine, `justified` (`_free_spot_for_declining_player`); it
      counts in the student's `lessons_missed` and absence history like any absence
      (`attendance_history_service`); a mark inside the coach's cancellation deadline is late
      (`attendance.confirm` rules 6–8) and the coach gets the late-cancellation push for it; and in
      semi-automatic mode each marked class's vacancy raises its approval prompt at once, one per
      class (`attendance.confirm` rule 5, `create_approval_prompts`).
    - **The presence records why:** `presences.decline_source` is set to the constant, and
      `respondedAt` is the instant of the mark on both engines. The serialized presence carries it as
      `declineSource` (null for any other decline). Clients read `declineSource` only while the row
      is `not_coming` and not validated. The server clears it when a later answer replaces the
      mark: "Afinal vou" (`attendance.confirm` rule 28) when it brings them back, on both engines, and
      on the new engine a reminder's answer too; and the new engine's ordinary decline writes the field
      itself (null), so a student who was marked, came back and later said a plain "Não vai" is never
      shown as unavailable. (The old engine's ordinary decline only follows a "Afinal vou", which cleared it.)
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
      (`_notify_coach_of_cancellation`), and the engine sends none (`student_not_going`). On both engines the coach sees the reason on the student's row as
      a detail line (`attendance.confirm` rule 30), the "indisponível" line.
24. **Deleting or shortening a block undoes nothing.** Marks made through rule 22 stay when the block
    is deleted, shortened or moved; nothing is sent. A student who can come after all uses "Afinal
    vou" on that class (`attendance.confirm` rule 28: back in if a spot is free, else the waiting
    list). Racing the invitation engine for a seat it may already have given away is what rule 28's
    spot check is for.
25. **Older builds are made harmless, not broken.** Web ships with the server; a released iOS build
    may still carry the PAD-772 question. For it:
    - every blocker save answer above carries `coveredClasses: []`, so the shared helper of such a
      build asks nothing (an empty list never asks), and its unknown `markedClasses` key is ignored;
    - `POST /api/app/availability_schedules/{id}/covered_classes` stays, student-only, still refuses
      what the schedule `PUT` refuses, writes nothing, and answers `{coveredClasses: []}`, so such a
      build's setup guide saves and moves on without asking (the `PUT` then marks, rule 19);
    - `POST /api/app/availability_blockers/decline_covered` stays, unchanged in shape:
      `{occurrences: [{model, originalId, date}]}`, student-only (403 otherwise), never trusting the
      list — each entry is re-checked against the student's blockers **as stored now** and declined
      by rule 22 only if covered; the answer is
      `{declined: [{model, originalId, date, lessonInstanceId}], skipped: [{model, originalId, date, reason}]}`
      with `reason` one of `not_covered`, `not_enrolled`, `started`, `already_answered`, each entry
      in its own savepoint; a list longer than `const:BLOCKER_DECLINE_MAX_ENTRIES` is refused with
      400 before anything is read or written. No current build calls it; after a save it finds every
      covered class already `not_coming` and skips it as `already_answered`;
    - such a build re-reads only its blocker list after a save, so its calendar can still offer
      "Não vou poder ir" on a class the server just marked. `POST /api/app/notify/cancel_attendance`
      on a presence that is already `not_coming` and not validated is a no-op on both engines
      (`attendance.confirm` rule 31): it answers `{"action": "declined", "proactive": false,
      "duplicate": true}` and writes, sends and clears nothing, so the mark's `declineSource`, the
      single coach notice and the absence of any student message all survive the tap.
    A build older than PAD-772 saves as before and its classes are marked by the server all the same.
    No capability header is needed: every answer key is additive or unchanged.
26. **The block form says it before the save, as a statement.** Because nothing is asked, every
    form that saves a blocker shows one static line above its save button, on web and iOS: the
    block sheet (`blocker-sheet`, create and edit), the calendar's block sheet on a student's
    blocker, and the setup guide's schedule step. PT "As aulas em que estás inscrito neste período
    ficam marcadas como Não vai." (key `availability.covered.notice` in both shells' locales; test
    id `blocker-covered-notice`). It is the same text whatever the student's classes are: no lookup,
    no count, no button, no question. The schedule editor sheet that opens over the setup guide's step
    saves rows too, so it carries the same line above its own save button under the test id
    `schedule-covered-notice` (a second id because both are on screen at once). The calendar's block
    sheet shows it when the block is one the server marks classes for, that is when `blocksAutoInvitations`
    is true (the flag rule 19 reads), not by its `type`: an edit from iOS's block screen can leave the
    type as `personal` on a student's blocker. The explanation of the Indisponibilidade card (rule 14,
    `availability.blockersCard.intro`) says the same in a sentence: the classes the student is enrolled in
    during a block are marked Não vai when it is saved.

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

#### CALENDAR-STUDENT-BLOCKERS-17: A saved block marks exactly the student's own covered classes, at once (rule 19)
- **Given** a student on a weekly class (Wednesdays 19:00–20:00, no instance rows yet), a one-off class on Tuesday 18:00, a materialised Wednesday they already declined, a Wednesday class whose start has passed, a class the coach already marked (`validated`), another student's class in the same window, and the clock pinned
- **When** the student creates a recurring block Monday–Thursday 08:00–23:00 for three weeks, and separately a one-off block 20:00–21:00 that touches the Wednesday class only at its end instant
- **Then** each not-yet-started Wednesday occurrence (virtual ones materialised) and the Tuesday one-off is `not_coming` with `declineSource` = `const:DECLINE_SOURCE_AVAILABILITY_BLOCK`, and the answer's `markedClasses` lists exactly those, each with `model`, `originalId`, `date`, `lessonInstanceId`, `title`, `start`, `end`, ordered by start; the answer's `coveredClasses` is `[]`
- **And** the declined, started, validated and other student's classes are unchanged (the earlier decline keeps its own source)
- **And** the one-off block touching only at 20:00 marks nothing (half-open, same predicate as `blocked_user_ids_for_window`)
- **And** for a recurring block with no end starting in the future, a class is marked only when the block occurrence it overlaps starts on or before the block's first occurrence date + `const:BLOCKER_COVERED_HORIZON_DAYS` days, while a block starting six weeks ahead with the sheet's default end is marked whole, a class late on its last day included (the horizon from today and after a split: CALENDAR-STUDENT-BLOCKERS-31)
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_create_marks_the_covered_occurrences_at_once` (+ `test_the_horizon_cuts_an_endless_block_and_a_default_end_is_marked_whole`)

#### CALENDAR-STUDENT-BLOCKERS-18: An edit, a schedule save and a moved occurrence mark only newly covered classes (rule 20)
- **Given** a student's block over Monday that covers a Monday class they brought back with "Afinal vou", a two-row schedule over Monday, and a blocker occurrence on Friday
- **When** the student edits the block to cover Monday and Wednesday, saves the schedule (`PUT`) with Thursday added, and moves the Friday blocker occurrence onto a Saturday class (`reschedule_block`, scope single)
- **Then** the edit marks only the Wednesday occurrences and the schedule save only the Thursday ones; the Monday class stays `coming`; the moved occurrence marks the Saturday class
- **And** an edit that covers nothing new marks nothing and answers `markedClasses: []`; the schedule `PUT` still answers a bare list of rows and `reschedule_block` 204
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_an_edit_a_schedule_save_and_a_move_mark_only_newly_covered_classes`

#### CALENDAR-STUDENT-BLOCKERS-19: A save declines each covered class through the ordinary decline, with no message to the student (rules 19, 22, 23)
- **Given** a student on an old-engine class with a Wednesday occurrence with no instance row (before the reminder instant) and a materialised Thursday occurrence inside the coach's cancellation deadline, the coach's `reminder_declined` template customised, and the clock pinned
- **When** the student saves a block covering both
- **Then** the Wednesday occurrence is materialised and both presences are `not_coming` with `declineSource` = `const:DECLINE_SOURCE_AVAILABILITY_BLOCK`
- **And** each has an open vacancy exactly as `cancel_attendance` would leave it (the Wednesday one held to `invitationStart` through `invite_not_before`), Wednesday recorded as a proactive decline and Thursday as late
- **And** no message whose sender is the coach is created for either (no `reminder_declined`), and the coach has exactly one cancellation notice per occurrence (sender the student) carrying `availabilityBlock: true` beside `proactiveDecline` (Wednesday true) and `lateCancellation` (Thursday true), with the availability wording, the late one marked "(ATRASADO)", and a push only for the late Thursday one
- **And** in semi-automatic mode each marked class's approval prompt is built by the scheduler's own session: the job is armed only after the occurrence's commit, so a separate connection sees the vacancy when it is armed, and the coach has one prompt for the freed place
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_a_save_declines_through_the_ordinary_path_without_a_student_message` (+ `backend/padel_app/tests/test_pad772_marks_arm_after_commit.py` › `test_a_marked_class_in_semi_automatic_mode_gets_its_approval_prompt`)

#### CALENDAR-STUDENT-BLOCKERS-20: The legacy mark call re-checks every entry on the server (rule 25)
- **Given** a student with one block over a Wednesday class
- **When** they post that occurrence plus one their block does not cover, one of a class they are not in, one that has started, and one they already declined; and a coach posts to the same endpoint
- **Then** only the covered Wednesday is declined; the others are under `skipped` with `not_covered`, `not_enrolled`, `started` and `already_answered`, and nothing was written for them (no instance materialised, no presence changed, no message)
- **And** the coach gets 403
- **And** a listed virtual occurrence whose materialised instance holds no presence for the student is skipped as `not_enrolled`, the other entries still declined
- **And** a list of more than `const:BLOCKER_DECLINE_MAX_ENTRIES` entries is refused with 400 and the limit itself is accepted
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_the_mark_rechecks_each_entry_and_skips_what_fails` (+1 more)

#### CALENDAR-STUDENT-BLOCKERS-27: A class is declined once however the marks race, and one refusal rolls back only its occurrence (rule 22)
- **Given** a student's Wednesday class, and a second covered class that starts between the re-check and the decline (the decline path's 409)
- **When** two saves of blocks covering the Wednesday run one after the other and, on Postgres, at the same moment (each has read the covered set before either declines), and a legacy `decline_covered` call for it follows
- **Then** the class is declined once: one coach notice, one vacancy; the later save does not list it in `markedClasses`, and the legacy call skips it as `already_answered`
- **And** the class refused by the decline path is not marked, nothing of it is written, the other covered classes of the same save are marked, and the block is saved
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_marks_decline_a_class_once_and_a_refusal_rolls_back_only_its_occurrence` (+ `test_two_saves_at_once_mark_a_class_once`, Postgres only)

#### CALENDAR-STUDENT-BLOCKERS-21: On a new-engine session the mark is the engine's own "not going" (rules 22, 23)
- **Given** a covered occurrence of a session the new engine runs (`engine_for(instance) == "new"`)
- **When** the student saves a block covering it
- **Then** `engine_entry.student_not_going` handled it, run for real (the engine records the absence and plans the spot): one absence, `declineSource` is set and `respondedAt` is the save's instant, and a second save covering it marks nothing more
- **And** no message whose sender is the coach is created, and no coach chat notice exists either (as for any No on the new engine); the serialized presence carries `declineSource` for the coach's detail line
- **And** the absence is durable when the engine's outbox is sent (a separate connection reads `absent` at that moment)
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_a_new_engine_session_is_marked_by_the_engine`

#### CALENDAR-STUDENT-BLOCKERS-22: A marked class is never reminded or asked on either engine, and deleting the block undoes nothing (rules 23, 24)
- **Given** a class marked by a block save, on an old-engine session and on a new-engine session
- **When** the student deletes the block, and then the old engine's reminder pass and the new engine's attendance-request slots (`messages.due`) and a coach's ask (`coach_ask`) run for the class
- **Then** the presence stays `not_coming` with its `declineSource`, no vacancy closes, and no `notification_reminder` (reminder or attendance request) is created for the student on either engine; the coach's ask names them `not_coming`
- **And** "Afinal vou" (`respond_reminder` with `yes`) with a free spot brings them back to `coming`, and the coach's row then shows no unavailability detail
- **And** on a new-engine session "Afinal vou" clears `declineSource` too, and an ordinary decline after a mark writes none: the row is `not_coming` with no reason
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_a_marked_class_is_not_reminded_and_survives_the_block_delete` (+ `test_on_the_new_engine_the_block_reason_goes_with_the_answer_that_follows`, `test_a_marked_class_gets_no_attendance_request_on_the_new_engine`)

#### CALENDAR-STUDENT-BLOCKERS-23: What follows a save's answer is one shared decision, and it is never a question (rule 21)
- **Given** a save answer with no `markedClasses` key (an old server), with an empty list, with one class and with two classes
- **When** the shared helper decides what follows the save
- **Then** no key and an empty list show nothing beyond the ordinary save; one and two classes give the toast with that count (`availability.covered.marked_*`) and ask for the calendar and dashboard to be re-read
- **And** the helper has no question, confirm or decline outcome to give, whatever the answer holds (a non-empty `coveredClasses` included)
test: `frontend/packages/config/src/blocker-covered.test.ts` › `[CALENDAR-STUDENT-BLOCKERS-23] a save answer gives a count line or nothing, never a question`

#### CALENDAR-STUDENT-BLOCKERS-24: Web saves, says how many classes were marked, and asks nothing (rules 19, 21)
- **Given** the web Disponibilidade tab with the API stubbed so the save answers two marked classes
- **When** the student saves a block from `blocker-sheet`
- **Then** no dialog opens (`blocker-covered-dialog` is gone), the toast says 2 classes were marked "Não vai", no write other than the save is made, and the calendar and dashboard queries are invalidated
- **And** a save answering no marked classes shows only the ordinary save
test: `frontend/apps/web/src/pages/AvailabilityPage.marked.test.tsx` › `[CALENDAR-STUDENT-BLOCKERS-24] a save over classes says how many were marked and asks nothing`

#### CALENDAR-STUDENT-BLOCKERS-25: iOS saves, says how many classes were marked, and asks nothing (rules 19, 21)
- **Given** the iOS availability tab with the API mocked the same way
- **When** the student saves a block
- **Then** the same as CALENDAR-STUDENT-BLOCKERS-24: no dialog, the count toast, no write other than the save, and the calendar and dashboard queries are invalidated
test: `frontend/apps/mobile/src/features/availability/blocker-covered.test.tsx` › `[CALENDAR-STUDENT-BLOCKERS-25] a save over classes says how many were marked and asks nothing`

#### CALENDAR-STUDENT-BLOCKERS-26: The setup guide's schedule save asks nothing and moves on (rules 18, 19, 21)
- **Given** the setup guide's schedule step on web and on iOS, the student enrolled in a class the schedule covers
- **When** the student saves the schedule
- **Then** only the `PUT` is made (no `covered_classes` read), no dialog appears, the guide moves on once the `PUT` succeeded, and the calendar and dashboard queries are invalidated
test: `frontend/apps/web/src/components/setup-guide/StepUnavailability.test.tsx` › `[CALENDAR-STUDENT-BLOCKERS-26] a schedule over a class saves and moves on without asking` (+ `frontend/apps/mobile/src/features/setup-guide/step-unavailability.test.tsx` › same name)

#### CALENDAR-STUDENT-BLOCKERS-28: Editing a blocker from the calendar's block sheet marks and says so the same way (rules 19–21)
- **Given** a student's availability blocker opened from their calendar (web `EventDetailSheet`, iOS `app/event/[id].tsx`), and a coach's own `personal` block
- **When** the student widens the blocker over a class they are in and saves through `PUT /api/app/calendar_block/{id}`, and the coach saves their block the same way
- **Then** the class is `not_coming` with the block source, the student's answer carries `markedClasses` with it and `coveredClasses: []`, and web and iOS show the count toast with no dialog
- **And** the coach's answer carries neither key and nothing of the coach's is marked
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_a_calendar_block_edit_of_a_blocker_marks_newly_covered_classes` (+ `frontend/apps/web/src/components/calendar/EventDetailSheet.covered.test.tsx` and `frontend/apps/mobile/src/features/calendar/event-detail-covered.test.tsx` › `[CALENDAR-STUDENT-BLOCKERS-28] a blocker edited from the calendar says how many were marked`)

#### CALENDAR-STUDENT-BLOCKERS-29: A mark that fails never unsaves the block (rule 19)
- **Given** a student's block save covering three old-engine classes, the decline of the second made to raise (an unexpected error, not a refusal) inside `cancel_attendance` after its presence write and before the coach notification step (`_notify_coach_of_cancellation`)
- **When** the student saves
- **Then** the save answers its ordinary success status, the block is stored, the first and third classes are marked and listed in `markedClasses`, and the second is unchanged (no instance materialised for it, no presence changed, no coach notice, no message) and absent from `markedClasses`
- **And** the failure is logged with the occurrence's `(model, originalId, date)`
- **And** a failure while reading what the block covers (before any occurrence is tried) is logged, the save answers its ordinary success status with `markedClasses: []`, and the block is stored once
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_a_failing_mark_leaves_the_block_saved_and_the_other_marks_made` (+ `test_a_failure_reading_what_the_block_covers_leaves_the_save_an_ordinary_success`)

#### CALENDAR-STUDENT-BLOCKERS-30: A build that still carries the question never asks it (rule 25)
- **Given** a student enrolled in classes a block will cover, using only the calls a PAD-772 build with the dialog makes
- **When** it saves a block (`POST`), edits one (`PUT`), reads `availability_schedules/{id}/covered_classes` before a schedule `PUT`, and replays the old dialog's yes to `decline_covered` with the classes the save marked
- **Then** every save answer and the schedule read carry `coveredClasses: []`; the schedule read wrote nothing; the classes were marked by the saves themselves; and the replay answers every entry under `skipped` as `already_answered`, writing nothing and sending the coach no second notice
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_an_old_build_with_the_question_is_never_asked_and_its_replay_writes_nothing`

#### CALENDAR-STUDENT-BLOCKERS-31: The horizon counts from today at the earliest, and a split keeps the original's horizon (rule 19)
- **Given** the clock pinned, a student on a weekly class, and an endless weekly blocker over it whose first occurrence was 200 days ago
- **When** the student edits the blocker so it newly covers the class, and separately moves one occurrence of an endless blocker that starts today (`reschedule_block`, scope future, from day 30)
- **Then** the edit marks the class's occurrences up to today + `const:BLOCKER_COVERED_HORIZON_DAYS` days and none after
- **And** the move marks only up to the original row's first occurrence date + `const:BLOCKER_COVERED_HORIZON_DAYS` days, not up to day 30 + that many days
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_the_horizon_counts_from_today_and_a_split_keeps_the_originals`

#### CALENDAR-STUDENT-BLOCKERS-32: Every blocker form says, before the save, that classes in the period are marked Não vai (rule 26)
- **Given** the block sheet (create and edit), a student's blocker in the calendar's block sheet, and the setup guide's schedule step, on web and on iOS
- **When** each form is shown
- **Then** `blocker-covered-notice` shows `availability.covered.notice` above the save button, with no button of its own and no request made to show it
- **And** a coach's own block in the calendar's block sheet shows no such line
- **And** the calendar's block sheet shows the line for a block whose `blocksAutoInvitations` is true and not for one whose flag is false, whatever its `type`, and the schedule editor sheet carries it as `schedule-covered-notice`
test: `frontend/apps/web/src/components/availability/BlockerSheet.test.tsx` › `[CALENDAR-STUDENT-BLOCKERS-32] the blocker form says classes in the period are marked` (+ `frontend/apps/mobile/src/features/availability/BlockerSheet.test.tsx`, `frontend/apps/web/src/components/setup-guide/StepUnavailability.test.tsx`, `frontend/apps/mobile/src/features/setup-guide/step-unavailability.test.tsx`, `frontend/apps/web/src/components/calendar/EventDetailSheet.covered.test.tsx` › same name)

### Not this spec (PAD-772)
- `POST /api/app/add_event` (the calendar's "add event" sheet, web `AddEventSheet`, iOS `app/event/new.tsx`): it creates only `personal`, `break`, `holiday` and `off_work` blocks and never sets `blocks_auto_invitations` (`add_event_service`), so what it saves is not an availability block; a student's blocker is created only on the availability tab, the setup guide, or edited from the calendar's block sheet.
- Marking occurrences that appear after the save (a new enrolment, a class created later, or anything beyond the horizon): they are not marked, and they get no text while the block covers them (rules 4, 11) — see Open questions.
- Undoing marks when a block is deleted or shortened (rule 24).
- Deleting one block occurrence: it only narrows the block, so it marks nothing (rule 24).
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

### Today (the owner's correction; read at `origin/staging` 0057ce811, after PR #1063)
- The question shipped: `coveredClasses` is computed by `blocker_covered_service.covered_for_blocks` (read-only; `snapshot`, `newly_covered`, horizon `BLOCKER_COVERED_HORIZON_DAYS = 92`) and added by `frontend_api.py` `create_availability_blocker` (1994), `update_availability_blocker` (2006), `put_calendar_block` (1917, blocker rows only) and the read `availability_schedule_covered_classes` (2053). `put_availability_schedule` (2041) and `reschedule_block` (1946) mark nothing and say nothing. The mark is `decline_covered_classes` (1982) → `blocker_decline_service.decline_covered` (per-entry `unit_of_work` + savepoint, instance then presence row lock, `cancel_attendance(..., source=DECLINE_SOURCE_AVAILABILITY_BLOCK)`, `MAX_ENTRIES = 200`). The decline path, its source, the coach notice and `declineSource` (rule 23) are reused as they are.
- The clients: web `components/availability/BlockerCoveredDialog.tsx` (used by `pages/AvailabilityPage.tsx`, `components/calendar/EventDetailSheet.tsx`, `components/setup-guide/StepUnavailability.tsx`), iOS `features/availability/blocker-covered-dialog.tsx` (used by `app/(tabs)/availability.tsx`, `app/event/[id].tsx`, `features/setup-guide/StepUnavailability.tsx`), the shared decision `packages/config/src/blocker-covered.ts`, and `declineCoveredClasses` / the schedule read in `packages/api/src/resources/availability.ts`.
- What reaches a student today for a class inside a block, marked or not: nothing class-slot. The delivery backstop `_send_system_message` refuses `notification_invite`, `notification_reminder` and `waiting_list_offer` for an instance a blocker of the recipient overlaps (`system_messages.py:40-44, 111-125`). The old engine's reminder pass also leaves blocked students out before sending (`reminder_skips` → `blocked_players_for_instance`, `notification_service.py:3243-3271`, used at 3294). The new engine's attendance request is a `notification_reminder` sent through that same backstop (`engine_outbox.py:118-128, 201-231`), though its planner `messages.due` does not read blocks (`invitation_engine/messages.py:43-67`).
- What reaches a student for a declined presence, whatever the block: no reminder on the old engine (`answered_for_reminders` 3222-3235 and the `status` mark in `reminder_skips`, used at 3319 and 3294); no attendance request on the new engine (a regular's No puts them in `absent`, a placed student's `Cancel` takes them out of `going`, `engine_store.py:138-144, 354-355`; `messages.due` asks only going students not in `absent`, `messages.py:53`; `coach_ask` names them `not_coming`).

### Waves (owner correction of PAD-772; the PAD-772 waves 1–5 shipped in PR #1063)
1. Backend — ATTENDANCE-CONFIRM-44 first (the no-op repeat decline), then CALENDAR-STUDENT-BLOCKERS-17, -18, -19, -21, -22, -27, -28 (backend test), -29, -30, -31, ATTENDANCE-CONFIRM-43 (all green here; -20 stays green): `cancel_attendance` returns early on a `not_coming`, unvalidated presence; `reschedule_block_service` hands back the rows it moved and cloned; the horizon from the later of today and the original row's first occurrence; a marking step shared by the five save routes (covered set → `newly_covered` diff → rule 22 per occurrence, after the block's commit), `markedClasses` and `coveredClasses: []` on the blocker answers, the schedule read answering `[]`, `decline_covered` kept. `frontend/apps/mobile/API-CONTRACT.md` updated (new key, the read and the mark marked legacy). PAD-772 tests: `test_create_answers_the_covered_occurrences_and_marks_nothing` and `test_the_horizon_cuts_…` change into -17's tests (now asserting marks); `test_an_edit_and_a_schedule_save_answer_only_newly_covered_classes` changes into -18's; `test_a_calendar_block_edit_of_a_blocker_answers_covered_classes` changes into -28's; `test_yes_declines_through_the_ordinary_path_without_a_student_message` changes (the save instead of the post) and is renamed for -19; `test_the_mark_rechecks_each_entry_and_skips_what_fails` and `test_one_mark_call_asks_about_at_most_two_hundred_classes` stay (-20); `test_a_repeated_yes_declines_once_and_a_refusal_rolls_back_only_its_entry` changes into -27's (saves racing); `test_a_new_engine_session_is_marked_by_the_engine` changes (triggered by the save); `test_a_marked_class_is_not_reminded_and_survives_the_block_delete` and `test_on_the_new_engine_the_block_reason_goes_with_the_answer_that_follows` change only their setup (marked by a save), and -22 gains the new-engine attendance-request test; `test_only_a_block_decline_drops_the_student_acknowledgement` changes its trigger and becomes `test_only_a_block_save_drops_the_student_acknowledgement` (ATTENDANCE-CONFIRM-43); `test_pad772_decline_source_storage.py` and `test_pad772_migration.py` stay. New: -29's and -30's tests.
2. Shared packages — CALENDAR-STUDENT-BLOCKERS-23 (green here): `@levelup/config` `blocker-covered.ts` becomes the count-line decision (no question outcome), `@levelup/api` types (`markedClasses`; `declineCoveredClasses` and the schedule read removed from the client, the endpoints stay on the server), `@levelup/types`. `blocker-covered.test.ts` changes; `availability.test.ts` drops the two removed calls.
3. Web and iOS together — CALENDAR-STUDENT-BLOCKERS-24, -25, -26, -28 (client tests), -32: remove `BlockerCoveredDialog` (web) and `blocker-covered-dialog.tsx` (iOS) from the tab, the calendar's block sheet and the setup guide; show the count toast; invalidate calendar and dashboard after a save that marked and after every schedule save (web's drag already re-reads; iOS has no block drag); the static `blocker-covered-notice` line on every blocker form; PT/EN `availability.covered.marked_*` and `availability.covered.notice` keys, dialog keys removed. `BlockerCoveredDialog.test.tsx` goes (replaced by `AvailabilityPage.marked.test.tsx`); `blocker-covered.test.tsx` (iOS), both `StepUnavailability` tests and both `EventDetailSheet`/`event-detail-covered` tests change; ATTENDANCE-CONFIRM-42's row tests stay.

### Open questions (PAD-772; the owner could not answer during this run, so each is decided with its reason)
- **Answered by the owner (26 Nov 2026, relayed by the orchestrator, M-9669): no question at all.** The earlier pick "ask them when they save" is withdrawn: saving the block marks the covered classes "Não vai" (rule 19), the student gets no message and no reminder or attendance request for them (rule 23), removing or shortening the block keeps the marks (rule 24), and the coach's notice stays one chat notice per class on the old engine and none on the new engine besides the row's "indisponível" line (rule 23; owner: "good"). The decisions below were taken by the lead under that correction while the owner was away; each is reversible by the owner.
- **Occurrences that appear later inside an existing block** (a recurring class's occurrences beyond the horizon, an occurrence materialised later, a class the student is enrolled into after the save) — options: (a) mark only what the save covers, and rely on the existing send-time suppression for the rest; (b) mark later occurrences when they become known (at materialisation, at the reminder pass or engine tick, or at enrolment); (c) a periodic job that re-marks every block's covered set. Decision: **(a)**, because the owner's ask is that the student is not texted for what they decided, and that already holds for every occurrence a block covers, marked or not, on both engines: the backstop of rule 11 refuses every reminder, attendance request, invitation and waiting-list offer for it (`system_messages.py:111-125`; the new engine's request goes through it, `engine_outbox.py:118-128`). (b) and (c) add a writer for a case the default block does not reach: the sheet's default end is three months, the horizon itself (rule 16), so only a block with a longer chosen end or none (`calendar.blocks` D83) leaves classes past the horizon unmarked, and occurrences inside the horizon that have no instance row yet are materialised and marked at save. A class the coach adds the student to after the save is the coach's deliberate decision taken over rule 9's warning; marking it at once would undo it. Trade-off: the coach sees such an occurrence as planned until the student or coach marks it. Option (b) at the reminder pass is the next step if the owner wants those marked too.
- **The horizon** — decision: keep `const:BLOCKER_COVERED_HORIZON_DAYS` (92), because the server now expands the block itself and an endless block must not mark (and materialise) without bound; 92 days is the three months the sheet gives a block with no end date (rule 16), so a sheet-made block is marked whole. Counted from the later of today and the row's first occurrence (review): counting from a stored start months old would mark nothing on an edit; a split row keeps its original's horizon so moving one occurrence never reaches further than the block did.
- **The cap** — decision: keep `const:BLOCKER_DECLINE_MAX_ENTRIES` (200) on the legacy `decline_covered` call only (rule 25), where it still guards a client-sent list; a save's own marks are bounded by the horizon instead and have no cap, because refusing or truncating a save over many classes would leave some marked and some not for no reason the student can see.
- **Rows already settled** — decision: a row the coach validated is not marked (`attendance.confirm` rule 29, the coach's mark stands); a row already `not_coming` is left alone and keeps its own source (no second coach notice); a class that has started, or is cancelled, is not marked. Each is the same exclusion the PAD-772 listing already made.
- **One coach notice per occurrence, or one summary per save** — a default three-month Mon–Thu block over a twice-weekly class is about 25 notices (chat messages; pushes only for late ones). Decision: **per occurrence**, because P-ATTENDANCE-2 and `attendance.confirm` rule 8 promise one notification per cancellation, and the owner confirmed it on 26 Nov 2026 ("good").
- **Delete or shorten a block** — decision: leave the marks (rule 24): the seat may already be given away, and "Afinal vou" (PAD-684) is the owner's way back, with its spot check. Confirmed by the owner on 26 Nov 2026.
- **"Afinal vou" on a class the block still covers** — the student is back in, and the backstop of rule 11 still holds that class's reminders and attendance requests back while the block covers it. Decision: leave it, because the student is the one who came back and an edit that leaves the class covered does not re-mark it (rule 20); a student who wants reminders for it narrows the block.
- **Which classes count** — decision: any overlap, the predicate the block already uses for invitations and reminders (rules 5, 12), so a class the block holds invitations back for is the same class it marks.
- **The other effects of a mark: the late flag and the semi-automatic burst — decided by the owner, 26 Nov 2026: "Keep both as with any can't go."** A mark is an ordinary decline (rule 23): inside the cancellation deadline it is late and pushes the coach, it counts as a (justified, old engine) absence and in the student's absence history, and in semi-automatic mode a block over many classes raises one approval prompt per freed place, at once. Decision: **same as any decline**, because the owner kept "one notice per class" ("good") and a different rule per source would make a block a way to dodge the late flag.
- **Classes on the waiting list or with a pending invitation inside the block** (review N4) — today: the covered set reads only the student's presence rows and the lessons they are on the roster of (`load_lesson_instances_for_player` joins `Presence`; `load_lessons_for_player`), so a `WaitingListEntry` or an open invitation (`NotificationEvent`, `EngineInvitation`) is not in it and is not marked. The block already holds back the waiting-list offer and any new invitation for that window (rules 4, 11). Decision: leave them out — not marked, not withdrawn — because the student holds no spot there to give up and either is the student's own open request they can still act on; withdrawing them would be a second new writer. Known edge, recorded: an engine that seats a waiting-list student automatically sends `added_to_class`, which the backstop does not block, so such a student can be seated inside their block; the attendance request for it is still held back. Reversible.
- **What the student sees** — decision: a toast with the count, on the tab and the calendar's block sheet only (rule 21), because it is the lightest confirmation and the owner's "no message" is about chat texts, which a toast is not. The setup guide's schedule `PUT` and the calendar's drag answer no body the count can ride on; they re-read the calendar instead of adding a read or a header for a line. Reversible.
- **Older builds** — decision: made harmless, not broken (rule 25): `coveredClasses` is always `[]` and the schedule read answers `[]`, so a build with the question never asks it; `decline_covered` stays so a stale call is a no-op, until no supported build calls it.
- **The self-decline acknowledgement with no reminder sent** (the ticket's 17:42 message, old engine only) — options: send `reminder_declined` only when a reminder was sent, or leave it. Decision: leave it here; the new engine already sends nothing, and the owner's words did not cover it. Only rule 22's decline drops the acknowledgement.
- **The setup guide's schedule** — decision: in scope (rule 19), because its rows are ordinary blocks (rule 18) and a student setting up a weekly schedule over classes they are already in is the ticket's own case.
