---
id: classes.instance-enrollment
status: implementing
depends_on: [classes.instances, players.create]
serves: [P-CLASSES-1]
governed_by: []
---

# classes.instance-enrollment


### Intent
A student's place on one class occurrence is one `Presence` row. PAD-259 (audit H5, owner decision
of 2026-09-11, option A): the per-occurrence junction table was a second copy of the same fact,
written on different paths, and the two disagreed on production. This spec makes the presence row
the only per-occurrence enrolment and keeps the three facts a coach and a student care about as
three separate fields on it. Decision record:
`.cortex/atlas/decisions/2026-09-11-per-occurrence-enrolment-source-of-truth.md`.

### Entities
- **READS:** Presence, Association_PlayerLesson (the series roster, `classes.enrollment`)
- **WRITES:** Presence — `enrolment_source` (new, PAD-259): `roster | coach | fill | walk_in | import | unknown`,
  a CHECK-constrained string with server default `unknown`
- **Gone (PAD-301, phase 2):** the phase-1 shadow junction `player_in_lesson_instance` was dropped by
  migration `9812c5f388fc` once a production copy reconciled with no difference (0 of 4,443 on
  2026-09-16); nothing writes or reads it

### Rules
1. **The presence row is the enrolment.** A `presences` row for `(player_id, lesson_instance_id)`
   means the player holds a spot on that occurrence. There is no other per-occurrence enrolment
   record. Deleting the row is how a player leaves an occurrence.
2. **Three separate facts on the row, never one field** (the owner's framing, 2026-09-11):
   - *planned* — the row exists; written by the coach's actions and the engine's fills;
   - *intends to come* — the student's answer (`confirmed`, or `status=absent` with
     `justification=justified` for a decline or cancellation, until PAD-271 replaces the flags with
     one response field); only the student's own actions write it;
   - *was there* — the coach's attendance record (`status` present/absent with `validated=True`,
     `justification`); only the coach writes it (`attendance.validation`).
3. **`enrolment_source`** records how the row came to exist: `roster` (copied from the series roster
   at materialisation), `coach` (added to this occurrence by the coach), `fill` (invitation
   accepted — a waiting-list student's group-0 invitation included, PAD-446 —, accepted join request), `walk_in` (recorded on the attendance
   sheet after the fact), `import`, `unknown` (backfilled rows whose origin cannot be told). It is
   informational: never used for authorization or capacity.
4. **One writer.** Every path that puts a player on an occurrence calls
   `enrol(player_id, instance, source)` in `lesson_service`: materialisation (`roster`), instance
   create and edit-add (`coach`), the engine's `_add_player_to_instance` (`fill`), the attendance
   sheet walk-in (`walk_in`), the presences import (`import`). It is idempotent — an existing row is
   returned untouched, its response and attendance never reset. It is race-safe without a lock: the unique pair is the lock, so the insert
   runs in a savepoint and a concurrent winner's collision is rolled back and re-read. It flushes
   inside a unit of work and commits outside one (PAD-272), so a roster materialises in one commit.
   `unenrol(player_id, instance)` deletes the row. No other code constructs a `Presence` for an
   enrolment.
4a. **A coach's enrolment keeps the class's sides (PAD-805; numbering unconfirmed).** When a coach
   puts a student on one occurrence (`source = coach`: instance create or edit-add, a cancelled
   student put back) and capacity closes an open spot (`notifications.invitations` rule 13), the
   spot of the student's side closes, chosen as for an accepted join request (`vacancy_for_joiner`,
   `classes.join-requests` rule 6), not the oldest. In the same commit the class's spots left open
   are re-counted with the student going (`notifications.invitations` rule 2d). After that commit,
   a pending join request whose side just lost its last spot moves to that side's waiting list
   (`classes.join-requests` rule 20), as on the engine's fill path. The other sources (`roster`,
   `fill`, `walk_in`, `import`) are unchanged: a fill's own path does this, and the others record a
   roster or a class that already happened.
5. **Capacity** is presences minus those with `status = 'absent'`, floored at 0 — the same
   arithmetic as before, now over one table (`calendar.view` rules 8–9, `LessonInstance.effective_filled_spots`).
6. **Reads.** "Is this player in this occurrence", the class-detail participants list, the engine's
   roster fan-out, eligibility and vacancy snapshots, the coach and student calendars all read
   presences. The series roster (`player_in_lesson`) remains the source for occurrences that have
   no instance row yet (`classes.instances` rule 1).
7. **A reminder answer from a player who has no row** on that occurrence (removed from that date
   after the reminder went out, still on the series roster) is recorded on the reminder attempt so
   the bubble settles and no re-reminder fires, and is answered with "you are no longer in this
   class"; it never creates a row or a vacancy (owner decision 2026-09-11, replacing the PAD-69
   auto-create; the PAD-69 intent — an answer is never silently lost — stands). Removing a
   participant from an occurrence also retires their pending reminder bubble.
8. **Migration and backfill (phase 1).** One guarded migration: add `enrolment_source`; one
   `INSERT … SELECT` that creates a presence (`invited=True`, `enrolment_source` `roster` when the
   series roster has the pair else `coach`) for every junction row without one, skipping rows whose
   player or instance no longer exists (B-059); stamp `roster`/`coach` on existing presences that
   have a junction row; presences with no junction row keep their row (`unknown`). The migration
   logs four counts (junction rows without a presence before, rows inserted, the same count after,
   instances whose filled count changed) and fails if the "after" count is not equal to the orphan
   count of rows it was told to skip. On Postgres the backfill is one statement; SQLite (tests)
   may loop. A second run inserts nothing.
9. **Reconcile check — retired with the junction (PAD-301).** `reconcile_enrolment()` returned the
   shadow junction pairs with no presence; it was the phase-2 gate and was run on a production
   copy before the drop (0 differences on 2026-09-16). The drop migration carries the same check
   inside it and refuses — never drops — while any junction pair has no presence. With the table
   gone the function and its test are gone too.

10. **A re-enrolment of someone who gave their spot up is a RETURN, not a no-op (PAD-316; rule number self-assigned, unconfirmed).** Rule 4's idempotence means an existing row is not *duplicated*; it never meant the row is untouched whatever it says. When `enrol()` finds a presence that is `status = 'absent'` and not validated, the player is coming back: the absence, its justification and the late-cancellation flag are cleared, their own open vacancy is closed and the instance reconciled (`notifications.invitations` rule 13). A row the coach has validated is left alone — that record is theirs to change on the attendance sheet.
   **The previous answer is void.** It recorded a "no" to a seat they no longer held, and nobody has asked them about this one, so the caller's `confirmed` stands rather than the stored flag: a coach's re-add leaves them `planned`, an engine fill arrives `coming`. Claiming they said yes would be the same over-reach as `confirmed` meaning *coming*.
   **The coach's own reversal is the same door.** Marking a student absent frees their spot and the engine opens a vacancy for it; marking them present again restores the count, so the reversal closes that vacancy too. Capacity alone will not: the vacancy names a player who is no longer absent, and that is what makes it stale, not the arithmetic — a class with spare room keeps offering a seat its owner has taken back.
   **A re-added student shows as `planned` until they answer of their own accord, and nothing asks them again.** `send_class_reminders` skips anyone whose reminder-attempt count has reached the coach's `reminderCount` (default 1), and a student who cancelled consumed their attempt before doing so; the pass reports no more due, so the scheduler does not re-arm for that occurrence. The coach therefore sees no answer and gets no signal to ask. Accepted deliberately (2026-09-12) rather than fixed here: it fails in the safe direction — before this rule the re-add did nothing at all and the seat was being offered to other people, whereas now they hold the seat and the class counts them, and what is missing is only the question. Asking them again means superseding the earlier attempts, which is a change to reminder behaviour that PAD-49 and PAD-94 spent effort making quiet; it has its own ticket.
   Both doors existed because "idempotent" was read as "returns untouched": before this, a coach re-adding a cancelled student changed nothing at all, and the app went on showing a seat the class did not count.

11. **A coach-initiated placement tells the student (PAD-330; rule number self-assigned, unconfirmed).** Enrolment was silent on every path a coach's own hand takes — creating a class with students on it, adding one to the series, adding one to a single occurrence, and putting back someone who had cancelled. A class simply appeared on a student's calendar: a commitment they never agreed to, with no reason to go looking. They learned of it only because the ordinary reminder eventually asked them, which is a side effect rather than a notification and never happens at all for a student added after that reminder has fired.
    So each of those four paths sends the student one `added_to_class` message. Its `{when}` dates a single occurrence ("no dia 19/04 (segunda-feira) às 10:00") and names only the weekday for an add to the whole series (`notifications.message-templates` rule 17, PAD-519). **Once per placement, never per occurrence:** materialisation enrols every roster player on every occurrence, and telling them there would send a weekly student a message a week about a class they were told about once, when the coach put them in it. The engine's own fills (`fill`) stay silent here because they already send their own — an invitation confirmation, a waiting-list placement, an accepted join request — and `walk_in` and `import` record a class that has already happened.
    **It is a message in the coach–student thread, not a new push type.** `_send_system_message` writes the Message, publishes it and pushes it as `{"type": "message", "conversationId": …}`. A class-shaped push would tempt `type: "class"`, which the mobile class screen cannot open from a push, and which produced the founder-facing "não foi possível encontrar esta aula" (PAD-324, `messaging.push-notifications` rule 7). Telling the student therefore costs no client work on either shell.
    Sending is **best-effort**: a messaging failure is contained and logged, never failing the enrolment that triggered it.

   **The silence on an accepted class request is deliberate, not a gap.** A student who asks for a class through `classes.class-requests` already receives the acceptance; telling them a coach added them would be a second message for one event, about something they initiated — the app narrating a person's own action back at them as news. `add_class_service` therefore takes `notify_students=False` on that path only. Anyone later reading it as a missing notification should read this sentence instead.

11a. **A coach's removal from one date tells the student (PAD-928; numbering unconfirmed).** When a
    coach takes a student off **one date** of a class (web and iOS send the class edit with `scope:
    "single"` and `removePlayers`), the student gets one `removed_from_class` message
    (`notifications.message-templates` rule 24), the same way the cancellation notice reaches them: a
    coach-to-student message through `_send_system_message` (in-app message, live event and push), sender
    the class's first coach as for `class_cancelled`, metadata `{"removedFromClass": true,
    "lessonInstanceId": <id>}`, rendered for that occurrence (`template_variables`).
    - **Which paths send.** `edit_lesson_instance_helper` with `series=False` (a materialised occurrence)
      and `create_lesson_instance_helper` (a virtual occurrence the same edit materialises, the student
      being on the series roster for that date). A student counts as removed only when they were on that
      date: `unenrol` found their presence, or the materialisation left them out of the roster.
    - **Which do not.** The per-occurrence pass of a series edit (`series=True`; `classes.enrollment` rule 4
      sends one series notice instead). The student's own decline, absence, unavailability, cancelled
      attendance or waiting-list leave; the engine's own moves; a placeholder or account deletion; the
      attendance sheet's "clear" (`_clear_presence`, which keeps the row).
    - **Never for a class already started or cancelled.** An occurrence whose `start_datetime` is not
      after the club's wall clock (`club_now_naive()`, as PAD-256 judges "started") or whose status is
      `canceled` sends nothing. Nor does a student whose presence on that date was already `absent`:
      they gave the date up themselves.
    - **When.** Immediately, after the edit is written; once per student per removal. **Best-effort:** a
      messaging failure is logged and never fails the edit (as rule 11).
    - **A class with no recurrence** (a one-off) always gets this notice, whatever scope the client sent.
    - The freed seat follows the vacancy flow exactly as before (`vacancies_after_class_edit`, rule 15's
      `CoachExcludes` for a new-engine session); nothing there changes.

12. **One roster order, set on the server (D163; PAD-465, B-233).** Every read that lists a class's participants lists them in the same order: by the player's name as the roster shows it (the account name, `users.name`), ignoring case and accents, then by player id. That covers the class-detail participants list for an occurrence (its presences) and for a series (its roster), and `GET /lesson_instance/<id>/presences`. The server sets the order and the clients render it as given. Nothing a person does to a row (saving attendance, an answer, a cancellation) moves it.
13. **A player's side in this occurrence (PAD-551; coordinator, 2026-10-14, defaults 1–4).** A
    regular student usually plays one side (the coach–player link's `side`), but in a given week
    may play the other. The coach sets it on that occurrence: the presence carries a nullable
    `side` (`left` | `right`); `null` means "the usual side". A player's **side in the occurrence**
    is the presence's `side` when set, else the coach–player link's (`left`, `right`, `both` or
    none). That one definition is what the class's side balancing counts (`notifications.invitations`
    rules 2–2d): the side a player is going on, and the side a freed spot starts from when they
    cancel.
    - **Who and when.** `PUT /api/app/class_instance/presences/side` with
      `{"classInstance": {id, originalId, date, parentClassId?}, "playerId": …, "side": "left" |
      "right" | null}` — the occurrence addressed exactly as attendance-confirm addresses it — by a
      coach of that class, for a player in it (present, absent or not yet answered), **until the
      occurrence ends**. A regular's next occurrence of a recurring class is usually virtual (not
      yet a row): it is materialised (`get_or_materialize_instance`, rule 4's roster copy) only
      here, when a side is actually set, and never once it has ended. Any other value is 400;
      another coach or a student is 403; a player not in the class is 404; an ended occurrence is
      409 (checked before anything is materialised). `both` is not an override: "this week I play
      right" names one side.
    - **Effect on open spots.** A change (set or clear) re-counts the class's open spots exactly
      as a "yes" does (`notifications.invitations` rule 2d, the dynamic balancing of PAD-581), in
      the same commit, so a spot that was asking the side this player now covers asks the other
      one, and a flip withdraws its live round-1 invitations for balance as rule 2d says.
    - **No message.** The student is not notified: the coach records what the student told them.
    - **Reads.** The participants list (class detail, web and iOS) carries each row's `side` (its
      side in the occurrence) and `sideOverride` (whether this occurrence sets it). A row with an
      override shows "Esquerdo nesta aula" / "Direito nesta aula" (test id
      `participant-side-<playerId>`), and the coach changes it from the row's side control
      ("Lado habitual", "Esquerdo nesta aula", "Direito nesta aula"; test ids
      `participant-side-usual-<playerId>`, `participant-side-left-<playerId>`,
      `participant-side-right-<playerId>`). The class payload carries `sideEditable` (and each
      presence row its own), the server's answer to "may the coach still change it": the occurrence,
      materialised or virtual, has not ended and is not canceled; false for a student and for a
      series template with no date. The clients show the control only when it is true and never
      compare a date with their own clock. On a virtual occurrence every row starts on "Habitual".
      After a change the clients re-read the class, since open spots may have re-sided and
      invitations been withdrawn.
    - It is one occurrence only: the series roster, the other occurrences and the coach–player link
      are untouched.

13a. **A "both" player's side is worked out when the class is full, and kept from its start
    (PAD-672 slice 3, D8; owner Q5, 2026-10-21; numbering unconfirmed).** A player whose side in the
    occurrence is `both` — on the profile, or chosen for this class through a join request
    (`classes.join-requests` rule 20 writes `both` on the presence; the coach's own side endpoint
    above still takes only `left`/`right`/null) — stays `both` and counts on neither side while the
    class has a place. **When the class is full**, each one is given the side with fewer players,
    in enrolment order (presence creation order), a tie — the odd one — going **left**: 4 left +
    4 right + 2 `both` gives one each, the first left. The result is **computed, never stored**
    while the class is open, so a cancellation puts them back in the open (`assignedSide` null again)
    and the saved `both` is never overwritten. Each presence row serializes it as `assignedSide`
    (`left`|`right`|null, null for anyone not `both` or a class not full). **From the class's start**
    the engine's tick (`notifications.invitations`, the 2-minute pass) writes it to
    `presences.assigned_side` once, and from then on that stored value is served (history). No
    notification at any point; the coach does not pick it by hand.
    - Clients (PAD-672 S2/S3 UI; numbering unconfirmed): web and iOS participant rows, the
      participant pop-up/sheet and the student's own row read "Ambos → esquerda" / "Ambos → direita"
      for a `both` player with an `assignedSide`; null keeps today's label.
    - **A one-sided player placed on the other side (PAD-819).** The coach's participant rows and the
      participant pop-up/sheet, on web and iOS, also read "<side> → <assigned>" ("Esq → Dir" /
      "Esquerda → direita", "Left → Right" / "Left → right") for a `left` or `right` player whose
      served `assignedSide` is the other side. The side compared is the player's side in this
      occurrence (rule 13's override, else the profile). An `assignedSide` equal to that side keeps
      today's label. The student's own row stays `both`-only: the invitation already named the side
      (`notifications.engine-settings` rule 4, D11). The server already serves a stored
      `assigned_side` for anyone; a one-sided player has one only on a new-engine session, where the
      engine's placement stores the side of the spot it filled (`notifications.engine-store`). On an
      old-engine class `assigned_side` is stored only at the class's start and only for `both`
      players, so a one-sided player there reads as before.
14. **On a new-engine session, enrolment writes only the presence (PAD-916; swap decision 1).** When the
    new engine's store places a student (`enrol(..., new_engine=True)`, a session on the new engine by
    `notifications.config` rule 18), `enrol()` writes the presence row and, for a return (rule 10),
    clears the absence and voids the earlier attendance records as rule 10 says (the returning student
    is asked again), and records a student counted as coming as rule 22 of `notifications.reminders`
    says; it does nothing else: no vacancy is closed or reconciled
    (swap decision 1 drops vacancies), no reminder pass is armed (rule 18 of
    `notifications.reminders`; the engine's attendance requests replace it,
    `notifications.engine-timeline` rule 2) and no `added_to_class` message is sent (rule 11; the
    engine sends its own `added` notice or invitation confirmation). Every old-engine enrolment is
    unchanged.
15. **A coach's add at an hour the student is already going elsewhere is refused (PAD-913;
    `notifications.engine-answers` rule 10, the coordinator's ruling: no override).** When a coach adds a
    student to a class (one occurrence, a series, a class created with students, or accepting a join
    request), and the add would put the student in two classes at the same time
    (`notifications.engine-tiers` rule 3: any overlap with a class of that coach, one ending as the other
    starts being no overlap, the owner's decision 11; or the same start with any coach, the owner's
    2026-11-11 ruling) of which at least one is a new-engine session, the
    whole edit is refused and nothing is saved. An occurrence not yet materialised counts as new-engine
    when its class's coach is on `new` (`notifications.config` rule 18 assigns it so when it first
    exists); a student is going to an occurrence when they are on its roster or presences and not marked
    absent. The refusal: `409 {code: "busy_same_hour", clashes: [{playerId, playerName, lessonInstanceId, title,
    start}]}`, one entry per student and clashing occurrence. There is no override: the coach removes the
    student from the other class first. Both shells read the body (today they show a generic failure
    toast) and show, per clash, "{name} já está inscrito noutra aula à mesma hora ({title}, {date}
    {time}). Remove-o dessa aula primeiro." / "{name} is already in another class at the same time
    ({title}, {date} {time}). Remove them from that class first." (proposed, for the owner's approval),
    from one shared copy helper. The four places that today drop the error body read it: web
    `CalendarPage.handleEditClass` and `AddToClassesDialog.proceedSave`, iOS `class/[id].tsx`
    `finalizeEdit` and `add-to-classes-dialog.tsx` `proceedSave`; adding to several classes at once saves
    the others and lists each class that refused. An add that clashes only with old-engine classes is
    unchanged. Removing a regular from one new-engine occurrence also tells the engine
    `CoachExcludes(student)` for that session (`notifications.engine-answers` rule 14); the coach can still
    add them back by hand. An add that goes
    through to a new-engine session is a placement: the student's other open
    invitations at that hour close, as for any placement (`notifications.engine-answers` rule 10).

### Acceptance Criteria

#### CLASSES-INSTANCE-ENROLLMENT-1: The roster keeps one order across a save (D163)
- **Given** an occurrence whose presences were created in the order "Zé", "ana", "Álvaro", "Bruno"
- **When** the coach reads the class detail and the presences list, before and after saving attendance for "Bruno"
- **Then** both reads list "Álvaro", "ana", "Bruno", "Zé", before and after the save

#### CLASSES-INSTANCE-ENROLLMENT-2: A coach placing a student tells them (PAD-330)
- **Given** a coach who creates a class with a student on it, adds one to the series, adds one to a single occurrence, or puts back a student who had cancelled
- **Then** that student receives one `added_to_class` message in their thread with the coach, naming the class and when it is
- **And** the push for it carries `type: "message"` with a `conversationId`, never a class-shaped payload

#### CLASSES-INSTANCE-ENROLLMENT-3: Materialising a class tells nobody (PAD-330)
- **Given** a recurring class with three students, each told once when the coach placed them
- **When** three of its occurrences are materialised
- **Then** no further `added_to_class` message is sent — they were told when they were placed, not once per week

#### CLASSES-INSTANCE-ENROLLMENT-4: The engine's own placements are not announced twice (PAD-330)
- **Given** a student enrolled by an invitation acceptance (a waiting-list student's included) or an accepted join request
- **Then** no `added_to_class` message is sent, because that path already sends its own
- **And** a walk-in or an import, which record a class that already happened, send nothing

#### CLASSES-INSTANCE-ENROLLMENT-5: A coach puts a cancelled student back (PAD-316)
- **Given** a student who confirmed and then cancelled, so the class does not count them and a vacancy is open for their spot
- **When** the coach re-adds them to that occurrence
- **Then** the class counts them again, their vacancy is closed, and their state is `planned` — on the list, not yet answered
- **And** re-enrolling a student who never left changes nothing at all, including their own `confirmed` answer

#### CLASSES-INSTANCE-ENROLLMENT-6: A coach reverses their own absent mark (PAD-316)
- **Given** a student the coach marked absent, freeing the spot and opening a vacancy
- **When** the coach marks them present instead
- **Then** the class counts them again and no vacancy is left offering their seat
- **And** marking a student absent still frees the spot as before

#### CLASSES-INSTANCE-ENROLLMENT-7: Materialisation writes one enrolment per roster player
- **Given** a recurring lesson with Alice and Bob on its roster
- **When** the occurrence for April 20 is materialised
- **Then** two `Presence` rows exist with `invited=True`, `enrolment_source="roster"`

#### CLASSES-INSTANCE-ENROLLMENT-8: A coach adds a player to one occurrence
- **Given** a materialised instance 10 with Alice and a coach who owns it
- **When** the coach edits the instance with `add_player_ids=[<Carol>]`
- **Then** Carol has a `Presence` on instance 10 with `enrolment_source="coach"`
- **And** instance 10's `effective_filled_spots` is 2

#### CLASSES-INSTANCE-ENROLLMENT-9: Capacity counts presences, and a decline frees the spot
- **Given** instance 10 with `max_players=2`, Alice and Carol enrolled
- **When** Carol declines her reminder
- **Then** `effective_filled_spots` is 1 and the join-request "is full" check says not full

#### CLASSES-INSTANCE-ENROLLMENT-10: The vacancy fill path enrols once
- **Given** an open vacancy on instance 10 and Dave invited
- **When** Dave answers yes
- **Then** Dave has exactly one `Presence` on instance 10 with `enrolment_source="fill"`, `confirmed=True`
- **And** answering yes again changes nothing

#### CLASSES-INSTANCE-ENROLLMENT-11: A walk-in on the attendance sheet becomes an enrolment
- **Given** instance 10 with Alice enrolled and the coach's roster containing Eve
- **When** the coach POSTs presences `[{playerId: <Eve>, status: "present"}]`
- **Then** Eve has a `Presence` with `enrolment_source="walk_in"`, `validated=True`, `status="present"`
- **And** `effective_filled_spots` counts her

#### CLASSES-INSTANCE-ENROLLMENT-12: Removing a player deletes the enrolment and retires the reminder bubble
- **Given** instance 10 with Alice enrolled and a reminder already sent to her
- **When** the coach edits the instance with `remove_player_ids=[<Alice>]`
- **Then** Alice has no `Presence` on instance 10 and the calendar shows one fewer participant
- **And** her pending reminder attempt is marked superseded so the bubble shows no live Yes/No

#### CLASSES-INSTANCE-ENROLLMENT-13: An answer from a removed player creates nothing (rule 7)
- **Given** Alice removed from instance 10 after her reminder was sent, still on the series roster
- **When** she answers the old reminder with `no`
- **Then** the response is `{"action": "not_enrolled"}` and the reminder attempt is marked responded
- **And** no `Presence` and no `Vacancy` exist for Alice on instance 10, and no invitation is sent

#### CLASSES-INSTANCE-ENROLLMENT-14: What the student sees after a not_enrolled answer (rule 7)
- **Given** Alice, removed from instance 10 after her reminder was sent, opens the old reminder bubble on web and on iOS
- **When** she taps No and the server answers `{"action": "not_enrolled"}`
- **Then** the bubble shows the settled "This class no longer includes you" state, never "not attending" / "absent", and offers no Yes/No or cancel
- **And** after a reload the same state renders from `msg_metadata.response === "not_enrolled"` on both shells

#### CLASSES-INSTANCE-ENROLLMENT-15: Backfill creates the missing presences and logs its counts
- **Given** a database at the parent revision with three junction rows lacking a presence, one of
  them pointing at a deleted player, a fourth that duplicates one of the pairs, and one presence
  with no junction row
- **When** the migration upgrades
- **Then** two presences are inserted (`invited=True`, `enrolment_source` `roster` or `coach`), the
  orphan junction row is skipped, the duplicate pair becomes one presence, the pre-existing
  presence keeps `enrolment_source="unknown"`
- **And** the log carries `junction_without_presence_before=4`, `presences_inserted=2`,
  `junction_without_presence_after=1` (the orphan), `junction_duplicate_pairs=1` and
  `capacity_changes=1`, and a second upgrade inserts nothing

#### CLASSES-INSTANCE-ENROLLMENT-16: The drop refuses while any junction pair has no presence (PAD-301)
- **Given** a database where one `player_in_lesson_instance` row has no matching presence
- **When** migration `9812c5f388fc` upgrades
- **Then** it raises naming that pair and drops nothing
- **And** with every pair backed by a presence it drops the table, a second upgrade is a no-op, and the downgrade recreates the table refilled from presences

#### CLASSES-INSTANCE-ENROLLMENT-17: A player's occurrences read from presences (PAD-301)
- **Given** a player enrolled on an occurrence through `enrol()`
- **When** `Player.lesson_instances` is read
- **Then** it lists that occurrence, with no junction table involved

#### CLASSES-INSTANCE-ENROLLMENT-18: A coach sets a regular's side for one occurrence (rule 13, PAD-551)
- **Given** a class with Ana (usual side left) on Monday 20 and Monday 27
- **When** the coach puts `{"side": "right"}` on Ana's presence of Monday 20
- **Then** Monday 20's participants list shows Ana with `side` right and `sideOverride` true, and
  Monday 27 and Ana's coach–player side still say left
- **And** `{"side": null}` brings Monday 20 back to left with `sideOverride` false
- **And** `"both"` is 400, another coach is 403, a player with no presence is 404, and once Monday
  20 has ended the change is 409

#### CLASSES-INSTANCE-ENROLLMENT-19: A virtual occurrence is materialised only when a side is set (rule 13, PAD-551)
- **Given** a weekly class with Ana on its roster and next week's occurrence not yet a row
- **When** the coach opens it
- **Then** the payload has `sideEditable` true and no presence rows, and nothing is materialised
- **When** the coach sets Ana right for that occurrence
- **Then** the occurrence is materialised with the roster and Ana's presence has side right
- **And** for an occurrence that has already ended the payload has `sideEditable` false, the change
  is 409, and nothing is materialised
- **And** a student reading the same occurrence gets `sideEditable` false

#### CLASSES-INSTANCE-ENROLLMENT-20: The override is the side the class counts (rule 13, PAD-551)
- **Given** a class going 3 left (Ana among them) and 2 right, all regulars
- **When** the coach sets Ana right for this occurrence and Ana then cancels
- **Then** the count is 2 left and 2 right going, a tie, so the freed spot keeps the leaver's side
  in the occurrence and asks **right** (`notifications.invitations` rule 2c)
- **And** without the override the same cancellation is the same 2 / 2 tie and asks **left**, Ana's
  usual side: the override changed the answer

#### CLASSES-INSTANCE-ENROLLMENT-21: A change re-counts the open spots (rule 13, PAD-551)
- **Given** a class with one open freed spot asking left and a live round-1 invitation to a left
  student
- **When** the coach sets a going player's side to left for this occurrence so that left is no
  longer short
- **Then** the spot re-counts to right in the same commit and the left student's round-1 invitation
  is withdrawn for balance (`retired_reason = "side_balanced"`)

#### CLASSES-INSTANCE-ENROLLMENT-22: A coach's enrolment moves a request for the side it filled to that side's waiting list (rule 4a, PAD-805)
- **Given** a class of 4 with Ana (left) and Rui (right) going, a right spot (older) and a left spot
  open, and Sofia's pending join request for the right
- **When** the coach adds Bruno (right) to that occurrence
- **Then** the right spot is `filled`, Sofia's request is `superseded`, and she holds an active
  right waiting-list entry

#### CLASSES-INSTANCE-ENROLLMENT-23: The coach changes a regular's side for one class from the participant row (rule 13; web and iOS)
- **Given** a coach on a class's participant list, and a regular whose row says the side is editable
- **When** they pick the other side on that row
- **Then** the app PUTs `/app/class_instance/presences/side` with the occurrence, the player and that side, and the row shows the side's tag with that choice selected
- **When** they pick "usual" again
- **Then** the app sends `side: null` and the tag goes
- **And** a row that is not editable shows the tag and no control, and a row with no side data shows neither
test: `frontend/apps/web/src/components/calendar/AttendanceRow.side.test.tsx` › `has no side control without side props` (+8 more)

#### CLASSES-INSTANCE-ENROLLMENT-24: A "both" player's side is worked out when the class is full, and kept from its start (rule 13a)
- **Given** a full class of ten with four left, four right and two `both` players
- **When** the class is read
- **Then** the first `both` player by enrolment reads `assignedSide` `left` and the second `right`: each goes to the side with fewer players, a tie to the left; with five left and three right both go right
- **And** a player whose presence says `both` for this class is treated the same, whatever their profile side
- **And** while the class has a place, or once an absence opens one, `assignedSide` is null and nothing is stored
- **When** the class has started and the engine's tick runs
- **Then** each `both` player's side is stored, a later absence does not change it, and no message is sent
test: `backend/padel_app/tests/test_pad672_both_players_side_when_full.py` › `test_a_full_class_gives_its_both_players_a_side_each_in_enrolment_order` (+5 more)

#### CLASSES-INSTANCE-ENROLLMENT-25: The worked-out side reads "Ambos → side" wherever the player is listed (rule 13a)
- **Given** a `both` player whose `assignedSide` for the class is `left`
- **When** the participant list, the participant sheet or the student's own class view shows them
- **Then** the side reads "Ambos → esquerda" in Portuguese and "Both → left" in English
- **And** a `both` player in a class that still has a place reads as before, and a one-sided player's own line is not shown; a one-sided player's row follows CLASSES-INSTANCE-ENROLLMENT-42
test: `frontend/apps/mobile/src/features/calendar/class-s23-render.test.ts` › `the labels read Ambos → esquerda / direita in pt and Both → left / right in en` (+6 more)

#### CLASSES-INSTANCE-ENROLLMENT-26: A coach's re-add into a class that has since filled is not refused (rule 10)
- **Given** a class of one whose student cancelled, and another student who then took the spot
- **When** the coach adds the first student back
- **Then** the enrolment is made, and the class reads two players on a capacity of one
test: `backend/padel_app/tests/test_pad316_coach_return_doors.py` › `test_a_coach_cannot_seat_someone_the_class_no_longer_has_room_for`

#### CLASSES-INSTANCE-ENROLLMENT-27: Two enrolments of the same player at once leave one (rule 4)
- **Given** a player a concurrent writer has just enrolled on the occurrence
- **When** `enrol()` runs for the same player, having read no row
- **Then** it answers the existing enrolment, the pair still has one presence, and the transaction stays usable
test: `backend/padel_app/tests/test_pad259_enrolment.py` › `test_enrol_survives_a_concurrent_insert_of_the_same_pair`

#### CLASSES-INSTANCE-ENROLLMENT-28: A new-engine enrolment writes only the presence (rule 14)
- **Given** a class on the new engine with an open old-engine vacancy row for it and a coach with reminders on
- **When** the store enrols a student with `new_engine=True`, and puts back a student who had cancelled the same way
- **Then** each has a presence (the returning one with the absence cleared and its earlier attendance records voided), no vacancy is closed or reconciled, no reminder pass is armed and no `added_to_class` message is sent
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_a_new_engine_enrolment_writes_only_the_presence`

#### CLASSES-INSTANCE-ENROLLMENT-29: A coach's add that clashes at the same hour is refused whole, with the clashes (rule 15)
- **Given** a student going to Ana's class on Thursday at 19:00 and a coach's new-engine class on Thursday at 19:00
- **When** the coach adds that student and another to the class in one edit, and then adds the same student to the class's series
- **Then** both edits answer `409 busy_same_hour` with one clash naming Ana's class and its start, nothing is saved (neither student is added), and adding only the other student succeeds
test: `backend/padel_app/tests/test_pad920_coach_add_same_hour.py` › `test_a_coachs_add_at_a_busy_hour_is_refused_whole`

#### CLASSES-INSTANCE-ENROLLMENT-30: A partial overlap, or another coach's class at the same start, is refused; a touching class or a clash between old-engine classes only is not (rule 15)
- **Given** a coach's hour-long new-engine class at 19:00, and students going to that coach's 18:30–19:30 class, to that coach's class ending at 19:00, only to that coach's old-engine 19:00 class (the add being to another old-engine 19:00 class), and to another coach's 19:00 class
- **When** the coach adds each
- **Then** the partial overlap answers `409 busy_same_hour`, so does the other coach's class at the same start, and the touching and the old-engine-only adds succeed
test: `backend/padel_app/tests/test_pad920_coach_add_same_hour.py` › `test_a_different_start_or_an_old_engine_class_is_not_refused`

#### CLASSES-INSTANCE-ENROLLMENT-31: Both shells show each clash from the refusal's body (rule 15)
- **Given** a `409 busy_same_hour` with one clash, on web and on iOS
- **Then** each shows the shared helper's line naming the student, the other class and its date and time, never the generic failure toast
test: `frontend/packages/config/src/busy-same-hour-copy.test.ts` › `renders one line per clash in both locales`

#### CLASSES-INSTANCE-ENROLLMENT-32: The web edit and add-to-classes read the refusal's body (rule 15)
- **Given** web's class edit and the player's add-to-classes dialog over two classes, one refusing with `busy_same_hour`
- **Then** the edit shows the clash line instead of the generic toast, and the dialog saves the other class and lists the refused one with its line
test: `frontend/apps/web/src/components/players/detail/AddToClassesDialog.busySameHour.test.tsx` › `shows each clash and saves the classes that did not refuse`

#### CLASSES-INSTANCE-ENROLLMENT-33: The iOS edit and add-to-classes read the refusal's body (rule 15)
- **Given** the same refusals on iOS
- **Then** the same lines show and the other class is saved
test: `frontend/apps/mobile/src/features/players/add-to-classes-dialog-busy-same-hour.test.tsx` › `shows each clash and saves the classes that did not refuse`

#### CLASSES-INSTANCE-ENROLLMENT-34: A coach's add to a new-engine session closes the student's other invitations at that hour (rule 15)
- **Given** a student holding a counting invitation to a 19:00 new-engine session, not yet answered
- **When** a coach adds them to another 19:00 new-engine class
- **Then** the add succeeds and the invitation closes as a same-hour close (nothing more is sent for it and it no longer counts)
test: `backend/padel_app/tests/test_pad920_coach_add_same_hour.py` › `test_a_coachs_add_closes_the_students_other_invitations_at_that_hour`

#### CLASSES-INSTANCE-ENROLLMENT-35: Removing a regular from one new-engine occurrence tells the engine (rule 15)
- **Given** a new-engine occurrence and its regular
- **When** the coach removes the regular from that occurrence only
- **Then** the presence is deleted, the session's unit applies `CoachExcludes(student)`, and the store keeps them as a removed regular (their seat freed); removing them from an old-engine occurrence sends nothing to the engine
test: `backend/padel_app/tests/test_pad918_removal_withdraws.py` › `test_removing_a_regular_from_one_occurrence_tells_the_engine`

#### CLASSES-INSTANCE-ENROLLMENT-36: A coach takes a student off one future date and the student is told (rule 11a, PAD-928)
- **Given** a pt coach's recurring class on Fridays at 19:00 at club "Padel Norte", its occurrence of next Friday 21/11 materialised with student "Rita Silva"
- **When** the coach sends the class edit for that occurrence with `scope: "single"` and `removePlayers: [Rita]`
- **Then** Rita has one new message in her thread with the coach: "Olá Rita, foste removido da aula de sexta-feira, 21/11, às 19:00 (Padel Norte). Qualquer dúvida, fala com o teu treinador.", with `removedFromClass` and the occurrence's id, pushed
- **And** she stays on the series roster and gets nothing about any other date
test: `backend/padel_app/tests/test_pad928_removed_from_class.py` › `test_a_coach_removing_a_student_from_one_future_date_tells_them`

#### CLASSES-INSTANCE-ENROLLMENT-37: The same holds for a date not yet materialised, and for a one-off class (rule 11a)
- **Given** a recurring class whose occurrence on 28/11 is still virtual, and a one-off class on 22/11, both with Rita
- **When** the coach removes her from 28/11 with `scope: "single"` (the edit materialises it without her), and from the one-off class with either scope
- **Then** she gets one `removed_from_class` message for each, dated 28/11 and 22/11
test: `backend/padel_app/tests/test_pad928_removed_from_class.py` › `test_a_virtual_date_and_a_one_off_class_send_the_one_date_notice`

#### CLASSES-INSTANCE-ENROLLMENT-38: Nothing for a class that started or was cancelled, or a date already given up (rule 11a)
- **Given** an occurrence that started five minutes ago on the club's clock, a cancelled occurrence, an occurrence where Rita's presence is `absent`, and an occurrence Rita is not on
- **When** the coach removes Rita from each with `scope: "single"`
- **Then** no message is sent for any of them
test: `backend/padel_app/tests/test_pad928_removed_from_class.py` › `test_no_notice_for_a_started_or_cancelled_class_or_a_date_given_up`

#### CLASSES-INSTANCE-ENROLLMENT-39: A student's own leaving and the engine's moves send no removal notice (rule 11a)
- **Given** Rita on a future occurrence
- **When** she declines its reminder, marks herself unavailable, cancels her attendance, or leaves its waiting list, and when the engine moves a student
- **Then** no `removedFromClass` message exists for any of them
test: `backend/padel_app/tests/test_pad928_removed_from_class.py` › `test_the_students_own_leaving_sends_no_removal_notice`

#### CLASSES-INSTANCE-ENROLLMENT-40: The freed seat follows the vacancy flow as before (rule 11a)
- **Given** an occurrence with automatic invitations and a candidate on its waiting list
- **When** the coach removes Rita from it
- **Then** the vacancy opens and the same invitation goes out as before PAD-928, besides Rita's notice
test: `backend/padel_app/tests/test_pad928_removed_from_class.py` › `test_the_freed_seat_follows_the_vacancy_flow_unchanged`

#### CLASSES-INSTANCE-ENROLLMENT-41: A failed notice never fails the edit (rule 11a)
- **Given** a message send that raises
- **When** the coach removes Rita from one date
- **Then** the edit answers 200, the presence is gone, and the failure is logged
test: `backend/padel_app/tests/test_pad928_removed_from_class.py` › `test_a_failed_removal_notice_never_fails_the_edit`

#### CLASSES-INSTANCE-ENROLLMENT-42: A one-sided player placed on the other side reads "side → other side" in the coach's list (rule 13a, PAD-819)
- **Given** a `left` player whose served `assignedSide` is `right` (a new-engine session placed them on a right spot), and a `left` player whose `assignedSide` is `left`
- **When** the coach's participant list or the participant pop-up/sheet shows them, on web and on iOS
- **Then** the first reads "Esq → Dir" on the chip and "Esquerda → direita" in the long form in Portuguese, "Left → Right" and "Left → right" in English, and a `right` player on the left reads "Dir → Esq" / "Direita → esquerda"
- **And** the second reads "Esq" / "Esquerda" as before
- **And** a player whose side for this class was set to `right` by the coach (rule 13) with `assignedSide` `right` reads "Dir" as before
test: `frontend/packages/config/src/participant-groups.test.ts` › `[CLASSES-INSTANCE-ENROLLMENT-42] a one-sided player on the other side reads side → other side` (+2 more)

### Today (PAD-928)
- Coach removal from one date: `backend/padel_app/services/lesson_service.py` `_edit_class_service` (`payload["remove_player_ids"]`
  about line 1789; scope `single` → `edit_lesson_instance_helper` or, for a virtual occurrence, `create_lesson_instance_helper`
  about 625-650) → `edit_lesson_instance_helper` (748-765) → `unenrol` (226-244, returns whether a row existed). Both web
  (`ClassDetailSheet.tsx:923`) and iOS (`features/calendar/edit-class-diff.ts:57-86`) send `removePlayers`; no other route removes
  a presence on the coach's behalf. Nothing is sent to the student today.
- Series passes reach `edit_lesson_instance_helper(series=True)` from `_edit_future_instances_for_lesson` (1554-1584), which already
  skips occurrences that ended or were cancelled.
- The notice it mirrors: `collect_cancellation_recipients` / `notify_students_of_cancellation` (`services/system_messages.py`),
  called from `remove_class_service`. "Started" on the club clock: `utils/dates.club_now_naive`.

### Waves (PAD-928)
1. -36 … -41 with `classes.enrollment` -1 … -3: a `notify_student_removed(coach, player, source, key)` helper in
   `system_messages.py`, called from the single path and the series path in `lesson_service.py`, and `backend/padel_app/tests/test_pad928_removed_from_class.py`.
   Depends on `notifications.message-templates` wave 1 (the keys).

### Notes
- Phase 2 shipped as PAD-301 (migration `9812c5f388fc`): `player_in_lesson_instance` dropped, the
  shadow writes, the `players_relations` / `lesson_instances_relations` relationships, the
  player-claim and account-deletion entries and the dev seed entry removed. `Player.lesson_instances`
  now reads presences. Downgrade recreates the table and refills it from presences.
- Rule numbers assigned by Session H on 2026-09-11, unconfirmed by the coordinator.

### Open questions
- **The student's own row stays `both`-only for a one-sided player placed on the other side (PAD-819, agent 3,
  engine stream; the lead can reverse it).** The ticket asks for the coach's list. The student was told the side
  in the invitation (D11), and their own row has no side line today for a one-sided player.
- **A student already `absent` on that date gets no removal notice (PAD-928, messages-m3; the lead can reverse it).**
  They gave the date up themselves; the ticket's "only when the coach removes" is about who acts, and a notice for a
  date the student already declined is noise.
- **The sender is the class's first coach (PAD-928, messages-m3).** As `class_cancelled` (`collect_cancellation_recipients`),
  so the notice lands in the thread the student already has for that class, whichever coach of the class pressed save.
- **A one-off class gets the one-date notice whatever the scope (PAD-928, messages-m3).** "Removido da turma (todas as
  aulas seguintes)" means nothing for a class with one date.
- **Verification on iOS (ticket: "verificar na web e no iOS").** Both clients send the same edit and the notice is a
  plain message in the thread, so the iOS check is that the message shows in the student's thread on the simulator; no
  iOS code changes. Recorded so a reviewer does not look for an iOS diff.
