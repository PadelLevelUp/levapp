---
id: notifications.config
status: implementing
depends_on: [auth.login]
serves: [P-NOTIFICATIONS-3]
governed_by: []
---

# notifications.config


### Intent
Coaches configure the notification engine: timing, restrictions, matching rules, tiebreakers, and message templates.

### Entities
- **NotificationConfig** (`notification_configs`), one row per coach (PAD-279, audit M21). **Typed columns** for every scalar setting: auto_notify_enabled, invitation_mode (automatic|semi_automatic), reminder_type / reminder_value / reminder_time (the first reminder), invitation_start_type / invitation_start_value / invitation_start_time (the invitation window), reminder_count, hours_between_reminders, cancellation_deadline_hours, max_simultaneous_enabled / max_simultaneous_value, max_total_enabled / max_total_value, min_time_before_class_enabled / min_time_before_class_value, max_invites_per_student_per_day_enabled / max_invites_per_student_per_day_value, quiet_hours_enabled, max_inactive_time_enabled / max_inactive_time_value, exclude_inactive_accounts, excluded_players_enabled, open_spots_visible (nullable). **List-shaped JSON** stays JSON, stamped by `schema_version`: priority_criteria, notification_groups, message_templates, invitation_groups, tiebreakers, excluded_player_ids, eligibility_rules (nullable — see 7a). The former `rounds`, `invitation_start_timing`, `reminder_timing` and `restrictions` JSON columns no longer exist.

### Rules
1. One config per coach (upserted on first access)
2. `auto_notify_enabled` toggles the automatic invitation engine
3. `invitation_mode`: `"automatic"` (default) or `"semi_automatic"`. Only relevant when `auto_notify_enabled` is true. In `semi_automatic` mode, vacancies require coach approval before the engine sends invitations (see notifications.semi-auto-approval); in `automatic` mode behavior is unchanged
3a. **Accept join requests automatically (PAD-672 slice 2, D6; owner Q3, 2026-10-21; numbering
   unconfirmed).** `auto_accept_join_requests` (boolean, **off by default**; on the wire
   `autoAcceptJoinRequests`): "Aceitar automaticamente pedidos de inscrição de alunos elegíveis em
   aulas com vaga". On, a student's join request is accepted the moment it is created when every
   check the coach would make passes (`classes.join-requests` rule 21); otherwise it waits for the
   coach as before. **Incompatible with `semi_automatic`:** a save that turns it on while the mode is
   (or becomes) `semi_automatic` answers `400` and stores nothing; a save that switches the mode to
   `semi_automatic` while it is on turns it off in the same save and the response carries
   `notice: "auto_accept_off"` for the client to tell the coach.
   - Clients (PAD-672 S2/S3 UI; numbering unconfirmed): web and iOS Settings carry the toggle
     (`settings-auto-accept-join-requests`), held until the section's Save; it is disabled with the
     line "Não disponível no modo semi-automático" while the mode is `semi_automatic`; a save
     answering `notice: "auto_accept_off"` toasts "Aceitar pedidos automaticamente foi desligado: não
     funciona no modo semi-automático."; a student whose request answers 201 `accepted` sees "Está
     marcado! Estás inscrito/a nesta aula." on the class and the academy-classes step at once.
4. First reminder timing (`reminder_type`, `reminder_value`, `reminder_time`; on the wire `reminderTiming.firstReminder`): `{type: "hours_before", value: N}` or `{type: "days_before", days: N, time: "HH:MM"}`. `hours_before` counts real hours before the class's start, and `time` is the club's wall clock on the class's own date (`notifications.reminders` rule 15, PAD-256)
5. Invitation window (`invitation_start_type`, `invitation_start_value`, `invitation_start_time`; on the wire `reminderTiming.invitationStart`): when to start sending invitations after a vacancy. One home only — the duplicate `invitation_start_timing` column and its precedence dance are gone (PAD-279)
6. Restrictions (typed columns, composed on the wire as the `restrictions` object): maxSimultaneous, maxTotal, maxInactiveTime, minTimeBeforeClass, maxInvitesPerStudentPerDay, quietHours, excludedPlayers, excludeUnpaidSubscription (labelled "Exclude inactive accounts" — rule 7c), noSameDayClass (rule 6e)
6a. **(PAD-136, PAD-451)** `quietHours` is a **club-local wall clock** window, evaluated against
   the club timezone (`Europe/Lisbon`), consistent with `calendar` rule 6. **(PAD-451)** The coach
   sets it: `quietHours` is `{enabled, start, end}`, each bound `"HH:00"` or `"HH:30"` (30-minute
   steps), default **22:00–07:00**, stored in `quiet_hours_start` / `quiet_hours_end` (nullable;
   NULL reads as the default). The window is `[start, end)` and may cross midnight
   (`start > end`, e.g. 23:00–08:00) or not (e.g. 13:00–15:00). `start == end` or a bound off the
   30-minute grid is refused: `POST /api/app/notify/config` answers 400 and stores nothing.
   **Compat:** a `quietHours` object without `start`/`end` (an app build from before PAD-451, e.g.
   iOS 1.2.0 build 26) changes only `enabled` and keeps the stored bounds, so an old client's save
   never resets a coach's custom hours. The window ends at `end` — the time rule 6d's held vacancies
   and the late-joiner ask wait for. What it holds: automatic invitations (rule 6d) and the ask
   armed for a student who joins late (`next_ask_time`); scheduled class reminders fire at the
   coach's configured reminder time regardless. Because instants are
   stored as naive UTC, the check MUST convert to club-local before comparing the hour;
   comparing a UTC hour makes the window drift to 23:00–08:00 local through Portuguese summer
   time (WEST = UTC+1) while reading correctly in winter (WET = UTC+0). Only restrictions with
   wall-clock semantics need this conversion: `maxTotal` (a count) carries none, and
   `minTimeBeforeClass` (a duration) only needs the class's wall-clock start turned into an instant
   (`notifications.invitations` rule 11, PAD-256). `maxInvitesPerStudentPerDay` DOES carry them — see rule 6b.
6b. **(PAD-144)** `maxInvitesPerStudentPerDay` counts over the **club-local calendar day**
   (`Europe/Lisbon`), not the UTC day. "Per day" is a wall clock the coach reads off their own
   calendar, so the counting window is local midnight → local midnight, and the boundary must be
   *derived* in club-local time and then *converted back* to naive UTC for comparison against
   `NotificationEvent.created_at` (which is stored naive UTC). Deriving it with a bare
   `.replace(hour=0, ...)` on a naive-UTC instant pins the window to UTC midnight, which through
   Portuguese summer time runs 01:00 local → 01:00 local: invitations sent between 00:00 and
   01:00 local count against the *previous* day's quota, so a student can receive more than the
   configured number within one local day. Like rule 6a this self-corrects in winter, so it
   presents as intermittent.
   This is the same defect family as rule 6a and `calendar` rule 6; the round-trip back to UTC is
   the part rule 6a did not need, because comparing an hour never had to leave local time.
6c. **`maxTotal` is a budget per CLASS OCCURRENCE (PAD-432).** It caps the invitations for one
   class instance (`lesson_instance_id`, one date of a class) across ALL its open spots, counting the
   ones still pending (`sent`) and the ones accepted (`confirmed`) together: two open spots in one
   occurrence share one budget, each new batch is trimmed to what remains, and an occurrence at its
   budget invites no one more (`notification_service._check_restrictions` and
   `_send_invitation_batch`), and its open spots hold their round until the budget frees
   (`notifications.invitations` rule 3e, PAD-801). **Queued and expired invitations do not count**: a queued one is not
   charged until it is sent, and an invitation that expires gives its place back to the budget, so
   "max total" is not a lifetime cap. The settings copy says "Max total per class" / "Invitations
   for one class date, pending and accepted together".
6d. **Restrictions gate every send path, and quiet hours hold rather than drop (B-200, PAD-451).**
   `_check_restrictions` (quiet hours, `minTimeBeforeClass`, `maxTotal`) is asked before EVERY
   invitation batch: by `trigger_invitations` and by the periodic sweep
   (`process_invitation_batches`, every 2 min), whose fresh-vacancy, empty-round and inactivity
   sends all used to skip it — so a cancellation at 23:30 invited students at 23:32. A vacancy the
   check refuses is held and retried on every tick. When the only refusal is quiet hours,
   `trigger_invitations` still creates the class's open vacancies (it sends nothing): the one-shot
   invitation-start trigger firing at night used to leave a never-filled spot with no vacancy at
   all, so nobody was ever invited. Those vacancies are invited by the first tick after the window
   ends (the window's `end`, 07:00 club-local by default).
   Quiet hours gate automatic invitations and reminder asks only; a reply to a student's own join
   request (accepted, refused or superseded, automatically or by the coach) goes out at once
   (PAD-779). A request accepted for a class inside its reminder window waits for the end of quiet
   hours before the attendance ask (`notifications.reminders` rule 18).
6e. **Do not invite a student who already has a class that day (PAD-523; coordinator, 2026-10-07;
   numbering unconfirmed).** `noSameDayClass` is `{enabled}`, stored in
   `no_same_day_class_enabled`, **on by default (PAD-685, owner decision 2026-10-20: "a restrição
   deve vir ligada por defeito")**. This supersedes, for this setting only, the habit "a new
   marker's default must be off" that PAD-523 followed, and the owner's decision is the reason. A
   new coach's row starts on (model and server default `true`); migration PAD-685 switched every
   existing row on, because the stored `false` cannot tell a coach who never touched it from one
   who switched it off (NOT NULL, no backfill, and the row's `updated_at` moves with any save of the
   section). The coach can still switch it off; an off switch is kept. Both clients show, once, a
   dismissible note above the toggle saying it now comes on by default and can be switched off
   (dismissal remembered on the device; no message is sent). When on, `evaluate_candidates` drops a roster student who holds a spot
   in ANOTHER class on the same club-local day as the class being filled, with stage
   `has_class_same_day` (after `inactive_account`, `invite-simulation` rule 4). "Holds a spot" is
   the engine's meaning (PAD-259): a presence row not marked absent and not declined (a "no", a
   cancellation, a proactive decline); the other class is not cancelled and may be any coach's. The
   day is the wall date of the class being filled, 00:00 to 00:00 on the club's clock (class times
   are wall clock, R-023). The waiting list (group 0) is not a bypass: the coach switched the
   restriction on deliberately and eligibility has one meaning, as with `excludedPlayers`. Manual
   invitations are untouched. A saved `restrictions` payload without the key keeps the stored value,
   so an app from before PAD-523 saving its Settings cannot switch it off. Both clients show it as a
   toggle under Restrictions, saved with the section's explicit Save (PAD-506).
   The same switch governs `notifications.invitations` rule 18c (PAD-775): a live invitation for
   another class that day skips the student (`pending_invite_same_day`), and a yes withdraws the
   others that day (`booked_same_day`).
   Known limit (coordinator, 2026-10-07): the rule is read when the batch evaluates its
   candidates, not again under the sender's per-student locks (`_still_invitable`). A student who
   takes a place in another class that day between the two can still receive that one invitation.
7. `invitation_groups`: ordered rule-based groups for matching (attribute, operation, value)
7a. `eligibility_rules` (nullable) and `open_spots_visible` (nullable) are the **coach-standard tier**
   of `eligibility.rules` and `eligibility.open-spot-visibility`. `NULL` means unset at this tier,
   and unset is not a value — see `eligibility.cascade` rule 1. They round-trip through
   `GET|POST /api/app/notify/config` as `eligibilityRules` and `openSpotsVisible`.
7b. `invitation_groups` and `eligibility_rules` are **separate settings with separate meanings**:
   groups order who gets asked first, eligibility decides who may join at all. Neither is derived
   from the other, and existing coaches' `invitation_groups` are never migrated into
   `eligibility_rules` (`eligibility.rules` rule 10).
7c. **Account status, not payment (PAD-132, closed 2026-09-10).** The `subscription_status` group
   attribute and the `excludeUnpaidSubscription` restriction read `users.status`, which is
   **account activation** (`inactive | active | disabled`), not payment state — there is no payment
   model anywhere in the product. Every label and description on both platforms now says so
   ("Account status", "Exclude inactive accounts"); the two **wire identifiers are kept** because
   they are stored inside every coach's saved config JSON and consumed by the engine, the
   simulation and both clients — renaming them would be a data migration for no behaviour change
   (decision `2026-09-10-account-status-not-payment`). `eligibility.rules` rule 5 explains why
   eligibility offers no payments attribute.
8. `tiebreakers`: ordered ranking criteria (level, attendance, side, account status)
9. `message_templates`: customizable text for invite, confirm, decline, reminder, etc.
10. Updating timing configs reschedules all future scheduler jobs; the open spots of those classes follow a new invitation start too (`notifications.invitations` rule 11a, PAD-776)
10a. **After a timing change, each job is the one the saved configuration implies (PAD-478, B-249).**
   For every future class of the coach, materialised or not, the reminder job and the
   invitation-start job are derived again from the saved configuration. One configuration
   decides a class's jobs, the one the send path honours: its **primary coach's**
   (`classes.coach-assignment` rule 4: the occurrence's own first coach row, else the lesson's;
   an occurrence not materialised yet follows the lesson's first coach). Whoever triggers the
   derivation, a co-coach's save, the lesson's coach when the occurrence has a substitute, or a
   pass that walks every coach, the class's jobs come from its primary coach and from nobody else.
   The same coach's configuration governs the class's invitations as a whole (mode, groups,
   eligibility, auto-notify): the invitation-start job carries the primary coach. The spacing of
   follow-ups is the primary coach's too, including for a class coached through its lesson.
   Reading a coach's configuration for a derivation never creates one: a coach with none saved
   answers with the defaults. A job whose new fire time
   is in the future replaces the old one. A job whose new fire time is already past, or whose
   timing is `none`, is removed: that class gets no automatic reminder (or no invitation start)
   from that job. For a never-filled place whose window is already open, invitations rule 1c
   (PAD-540) says what opens it instead: the next tick, once the class exists, and for an
   occurrence not materialised yet the **catch-up** (PAD-661, B-501): the derivation arms the
   invite-start job two minutes out instead of removing it, and that job — not the save —
   materialises and opens the place through every gate; the save itself still sends nothing. The class gets nothing from the save itself; rule 10f says how the coach can have it sent. A
   job already armed at exactly the implied time is left alone, even when that time has just
   passed, so it fires or expires inside its grace time. No job armed from a previous or an
   intermediate value remains. The startup re-arm and the daily window pass use the same
   derivation, and for them a past fire time always means no job and nothing sent — with the one
   exception of invitations rule 1c's catch-up: a past invite-start time of an occurrence not yet
   materialised and still ahead arms the lesson-level start job two minutes out, so the first
   startup after PAD-661 opens every such class of every engine-on coach (the deploy burst). Both passes
   work coach by coach: a failure for one coach is logged with that coach and the pass goes on
   to the next. Deploying
   this rule sends nothing: the startup pass removes jobs the configuration no longer implies
   and never sends for a past time.
10b. **A pending follow-up moves with the spacing and the count (PAD-478, B-250).** When a timing
   is saved, each pending follow-up job of the classes the coach is primary coach of is re-timed.
   A follow-up is one job per class, not per student: it moves to the newest reminder sent to any
   student who is still owed one, plus the saved `hoursBetweenReminders`, so that at that moment
   nobody is inside the spacing and skipped; never earlier than a minute from now and never at or
   after the class start. Known limit: a student reminded earlier than that newest reminder waits
   longer than the spacing. It is removed when no further reminder is owed (the count was lowered
   to or below what was sent, or everyone answered) or when there is no room before the class.
   When the only students still owed one have had no reminder yet (added after the first pass,
   or blocked during it), the job stays where it is: it is what will reach them. Two follow-ups
   of one class collapse into one. A follow-up that fires while the re-timing runs is done, not
   a failure. It is never left to fire at the old spacing, where
   the pass would send nothing and end the chain. A re-timed follow-up is a follow-up like any
   other: quiet hours do not defer it, as they do not defer the follow-ups a reminder pass arms
   (only the late-arrival ask is deferred, `notifications.reminders` rule 18). **Behaviour
   change:** a follow-up is armed after a reminder pass for every class that has a primary
   coach, including a class with no coach row of its own (coached through its lesson). Such a
   class used to get its first reminder and never a follow-up. Nothing is armed retroactively
   for a reminder that went out before this rule. Only a settings
   change re-times; the startup and daily passes leave follow-ups where they are.
10c. **A failed reschedule is reported, not swallowed (PAD-478).** The configuration is saved. The
   failure is logged with the coach, and the response carries `rescheduleFailed: true`. The form,
   on web and on iOS (PAD-776 part 3), then treats the save as saved, like any saved value (the tab is clean), and says on a line of its
   own that the reminders of classes already scheduled may still follow the previous timing; the
   line sits under the reminders heading and is visible with the section closed (the answer can
   arrive after the coach closed it), and goes when a later timing save re-arms them; a Save that
   does not carry the timing leaves it as it is. The
   daily window pass derives the jobs of every active lesson inside its 60-day window again with
   rule 10a's derivation, so for those a failed reschedule heals within a day. Follow-ups (rule
   10b) are not part of that pass. Creating or editing a class is committed before its jobs are
   derived: a derivation that fails there is logged and the class still answers as saved; the
   daily pass derives its jobs.
10d. **The timing is held until the tab's Save (PAD-506, `settings.explicit-save`).** The reminders
   form shows each stepper tap and each edit of the time field at once and sends nothing; the
   timing goes in the engine's part of the tab's one Save, with any other engine field that
   changed. Closing the section keeps the held value, and leaving the tab with it unsaved asks.
   (Until PAD-506 the form sent the timing after a 600 ms pause through a serial save-on-change
   saver; that model, and what a closing tab could lose under it, are gone.) **iOS has the same
   form (PAD-776 part 3, ledger B-703).** The engine card in iOS Settings carries the Reminders
   panel, closed by default and disabled while the engine is off, with web's four controls,
   bounds, defaults and labels: first reminder and invitation start (each "hours before the
   class", 1-168, or "days before at a time", 1-30 days at a time on a 15-minute grid; switching
   mode starts from 48 hours or 2 days at 17:00), reminders per student (1-5) and, from a second
   reminder, hours between them (1-24). It holds the timing until the screen's Save, which sends
   `reminderTiming` in the engine's one request like web's, so the server's re-arming (rule 10a),
   rule 11a's re-timing of open spots and the notes and question of rules 10c and 10f follow an
   iOS save exactly as a web one. (Until PAD-776 part 3 iOS had no control for these fields, with
   no reason written for it: a coach could not set when invitations start from the phone.)
10e. **Any sequence of saves gives the same jobs (PAD-478).** The jobs are determined by the last
   saved configuration alone, whatever sequence of saves led to it and in whatever order the
   requests arrived. Every derivation of a class's jobs, by a save, the startup re-arm or the
   daily pass, holds that class's primary coach's lock and reads the configuration again inside
   it, taking no value from its request and none from a row loaded earlier. So whichever
   derivation runs last arms what is saved at that moment. A derivation waits at most 30 seconds
   for the lock; a save that gives up is reported as in rule 10c. Limit: the lock is per process,
   which is where the jobs live; production runs one worker. The backend does not rely on the
   client sending one save per edit.
10f. **The coach is asked before anything past due is sent (PAD-478; owner, 2026-10-02).** A timing
   save answers with `pastDue.reminders`: the upcoming classes, not cancelled or completed, of which the coach is primary coach
   whose reminder time, under the SAVED configuration, is already past and who have at least one
   student a reminder pass run now would reach (not answered, under the count, not blocked). It is
   read from the saved configuration alone, not from what this save changed, so a class that was
   already past due before the change is listed too. A class whose students have each had every
   reminder the count allows, or have answered, is not listed; with a count above one, a class
   whose student is still owed a follow-up and is outside the spacing is listed, because a pass
   run now would send that follow-up. For a class
   not materialised yet the roster is counted as it stands, unfiltered (nothing can be checked
   per student without materialising it, and listing must not write): it is listed when its
   lesson has a roster, and the number the coach is shown can be higher than the number the
   send then reaches. Listing writes nothing and sends
   nothing. The web form asks the coach in a dialog (copy approved by the owner, 2026-10-02): it
   names the class with its day and time, or lists up to five classes and counts the rest, and
   its body ends with the question; the two buttons are "send now" (inside quiet hours, "send at
   <time>") and "do not send", and one choice covers every class listed. It asks from the answer
   of a Save that carried the timing (rule 10d), so nothing is asked while the coach edits; a
   Save that does not carry the timing never asks.
   The dialog belongs to the card, not to the reminders section: when the Save's answer
   arrives after the coach has closed the section, the dialog still appears.
   A class the coach has answered for, either way, is not asked about again during the visit; a
   class that appears later is asked about alone. Known limit: a class is remembered by the
   key the server gave it, and a class materialised by something else during the visit changes
   key, so it can be asked about a second time; the send is still checked on the server. Nothing about the answer is stored: a later
   visit that saves a timing asks again. Closing the dialog is "do not send". A send that fails
   says so in the dialog, which stays open. After a yes the coach is told what happened: sent,
   scheduled for a time, or nothing left to send (the server's second check found none). When
   the save answers `pastDueUnknown`, the card says, under the reminders heading and visible
   with the section closed, that the check could not be made, and asks nothing; the next
   timing save that makes the check removes it. The listing has no upper limit, and one send
   request names at most 200 classes (more is a 400): the form sends a longer list in several
   requests, one after the other, each key once; if one fails the dialog stays open and trying
   again sends every key again, which the server's own check makes harmless. Web and iOS alike
   (PAD-776 part 3): the iOS engine card asks the same question with the same copy, buttons, list
   of five and count, from the answer of a Save that carried the timing, and closing it is "do not
   send" there too. (Until then it was web only, because iOS had no control that saved a timing.)
   Only an explicit yes sends, through `POST /api/app/notify/past_due/send`: the
   server checks every requested class again with the same predicate, for the calling coach only,
   and runs the ordinary reminder pass for each one it still finds past due, with all its guards
   (count, spacing, PAD-407's lock), then arms the follow-up as after any pass. A repeated or
   duplicated request sends nothing more. When sending is not permitted now (the coach's quiet
   hours), nothing is sent at once: one pass is armed for the next permitted instant
   (`notifications.reminders` rule 18), `pastDue.quietUntil` tells the form so before the coach
   confirms, and a class that starts before then is not listed. That armed pass is removed when a
   later save arms the class's ordinary reminder again. No, or a dismissed dialog, sends nothing.
   Nothing here runs at startup or in the daily pass, and neither removes an armed pass. The
   send takes at most 200 classes per request and answers with counts and with the classes it
   acted on; a class it skipped is counted, never named back. A listing that fails does not fail
   the save: the configuration is saved and the response says the check could not be made
   (`pastDueUnknown`). Known limits: an armed pass is not moved when the coach widens their
   quiet hours afterwards (the pass itself does not look at quiet hours); and an armed pass
   that the scheduler could not run within six hours of its time is dropped (an ordinary
   reminder job: five minutes).
11. `cancellation_deadline_hours` (default 24; on the wire `restrictions.cancellationDeadlineHours`): hours before class start after which a student cancellation is still allowed but flagged as a "late cancellation" (see attendance.confirm). Exposed and round-tripped through `GET|POST /api/app/notify/config`

12. **Typed storage, stable wire shape (PAD-279, audit M21).** Every scalar setting lives in its own
   typed column with a database default; nothing scalar is read out of a JSON blob any more, so a
   NULL can never be "defaulted" into a filter (the idiom behind PAD-122). The list-shaped settings
   that remain JSON carry `schema_version` (1 today) so a later shape change can be migrated by
   version instead of by sniffing keys. `GET|POST /api/app/notify/config` keeps its camelCase shape
   exactly — `restrictions` and `reminderTiming` are composed from and decomposed into the columns
   server-side, and a POST that omits a restriction key leaves that column at its default, as the
   merge-over-defaults read always did — so neither client changes for this rule. The legacy
   `rounds` are gone with their column: an empty `invitation_groups` list now resolves to the
   built-in three groups (same level and side, same level, everyone), which is the same three
   waves `rounds` fell back to, so nobody's invitations change. The one-off migration backfills
   every row from its old JSON; a row whose blob does not parse or carries a wrong type keeps the
   column defaults for the unreadable part (the value the old getter returned for it), is logged,
   and is never skipped or failed. A stored `reminder_timing` with neither `firstReminder` nor
   `type` is a timing the scheduler could never fire; it is kept as **no reminder** (`reminder_type =
   "none"`, which the scheduler still schedules nothing for — the only shape whose backfill would
   otherwise change what students receive) and is logged, while any `reminderCount` /
   `hoursBetweenReminders` / `invitationStart` it does carry are kept. The coach turns reminders on
   by picking a timing in Settings, as before. Booleans stored as `0`/`1` or as the strings
   `"true"`/`"false"` by an older client are read as the boolean they spell, not reset to the default.

13. **(PAD-404) The evaluation reminder's two columns.** `evaluation_reminder_type varchar(16)
   NOT NULL DEFAULT 'never'` and `evaluation_reminder_value int NULL` live on this row because
   it is where per-coach typed settings live, but they belong to `evaluations.reminders`
   (rules 1–3) and are read and written only by `GET|PUT /api/app/evaluation_settings` — never
   by `GET|POST /api/app/notify/config`, whose wire shape does not change. They are **not** the
   class reminder of rule 4 (`reminder_type` / `reminder_value` / `reminder_time`); the
   `evaluation_` prefix is the whole difference and the spec names both so nobody wires one to
   the other. The `GET` of the evaluation setting must not upsert a row (rule 1 is the class
   config's behaviour, not this setting's).

14. **(PAD-433) One restrictions section, on both clients.** Web (`RestrictionsPanel`) and iOS
   (Settings → Auto-Invite Engine → Restrictions) show the same ten controls over the same
   `restrictions` object of `GET|POST /api/app/notify/config`: `maxSimultaneous` 1–20 step 1,
   `maxTotal` 1–50 step 1, `maxInactiveTime` 15–1440 min step 15 (the server also clamps a saved
   value below 15 up to 15, PAD-495), `minTimeBeforeClass` 5–240 min
   step 5, `maxInvitesPerStudentPerDay` 1–10 step 1, the `quietHours`, `excludedPlayers`,
   `excludeUnpaidSubscription` and `noSameDayClass` toggles, and `cancellationDeadlineHours` 0–168 h step 1 (no toggle).
   The bounds and steps live in ONE place, `RESTRICTION_BOUNDS` in `@levelup/config`, and a step
   clamps to them; neither client carries its own copy, so the two cannot drift. A disabled
   stepper row hides its value, as on web. While `autoNotifyEnabled` is false the section stays
   visible but its controls are disabled, as on web (`NotificationsEngineSection`'s `disabled`).
   **Words (PAD-450):** `maxSimultaneous` caps invitations, so it reads "Máximo de convites
   simultâneos / Quantos alunos são convidados ao mesmo tempo" (en "Max simultaneous invitations / How
   many students are invited at the same time"), and `maxTotal` reads as rule 6c says. Quiet hours and
   the minimum time before class keep "notificações / notify": `_check_restrictions` also gates the
   reminder armed for a student who joins late, so they cover more than invitations.
14a. **Excluded players are named (B-168).** `GET /api/app/notify/config` adds a read-only
   `excludedPlayerNames` map `{playerId: name}` for every id in `restrictions.excludedPlayers.playerIds`
   that is still one of the coach's players and not a deleted account (`users.status != "disabled"`, as the
   search, PAD-268); `POST` ignores the key. Each client's chip shows that
   name (or the name picked from the search in this session) and falls back to the id only for a
   player the coach no longer has. The key is additive: App Store clients that do not read it are
   unaffected.

15. **Every engine control is held until the tab's Save (PAD-506, `settings.explicit-save`).** A
    failed Save keeps every held value on screen and unsaved, says so, and a second Save sends them
    again; nothing returns to an older value on its own. (Until PAD-506 each control saved on change
    with a sign and rolled back on a failure — PAD-473, B-243.) The reminders subsection included.

16. **A save that changes how invitations are found is recorded (PAD-771).** Every configuration
    save that changes `invitation_groups`, `eligibility_rules`, or the invitation start type, value
    or time writes, in the save's own commit, one `notification_config_changes` row per changed key
    with the coach, the time, and the key's value before and after. A save that changes none of them
    writes nothing, and the rows are never edited. A table, not a log line: container logs do not
    survive a redeploy (on 28/10 two rollouts erased the 26/10 engine logs), and a past round can only
    be replayed against the configuration it ran under. `update_config` is the only writer of these
    columns. The rows carry rules and timings, never a student id or name.
17. **A new coach starts from the reference configuration (PAD-815; owner, 2026-11-02).** Every
    path that creates a coach writes the coach's `notification_configs` row in the same unit of work
    as the coach and its ladder (`levels.coach-levels` rule 14): sign-up (`auth.register`), a club
    invitation accepted as a new user (`clubs.coach-invitation`), and `create_coach_service`. The
    row holds the reference coach's values, the set PAD-810 copied:
    - the engine on (`auto_notify_enabled` true), `invitation_mode` `automatic`, join requests
      accepted automatically (`auto_accept_join_requests` true);
    - invitation start 2 days before at 19:00; reminders 1 day before at 17:00, 3 of them, 2 hours
      apart;
    - quiet hours on, 00:00–07:00;
    - limits: at most 3 at once and 10 in all per class; 3 invitations per student per day; no
      student who already has a class that day; an invitation unanswered for 60 minutes passes to
      the next student (`maxInactiveTime` on, 60); the minimum time before class off (its value
      125 minutes); inactive accounts not excluded; cancellation deadline 24 hours;
    - eligibility: up to 2 levels above the class (`within_n_above_class`, value 2);
    - the eight invitation groups `default_1`…`default_8` (level one above or the same as the
      vacancy, combined with the same side and with having make-ups, in the reference's order);
    - the five tiebreakers (fewest unjustified absences, most justified absences, highest attendance
      rate, matching playing side on; active subscription off);
    - the four notification groups, all on; open spots visible to students;
    - the evaluation reminder `never`.

    **Not taken from the reference:**
    - `evaluation_scale_max` stays the product value, 5 (PAD-403);
    - `excluded_players_enabled` stays off, with an empty list;
    - `message_templates` stays `NULL`, which means the built-in texts. The reference coach's texts
      become product copy only once the owner approves them.

    The column defaults and the `DEFAULT_*` fallbacks for NULL lists are unchanged. A coach created
    before this rule, with or without a row, reads exactly as before (rule 1 still creates a missing
    row with the engine off). Existing coaches move only through PAD-815's data step, coach by coach.
18. **Which engine a session runs on (swap plan §7; coordinator ruling on PAD-912).** Each coach has an
    engine switch (`engine_version`: `old` or `new`; `old` for every coach until the coach is
    switched). A session runs on the new engine when its coach is on `new` and, when the coach was
    switched, its invitation window had not opened and the old engine had not started inviting for it
    (a coach's "invite now" before the window, an approved semi-automatic spot); a session already
    inviting at the switch finishes on the old engine until it starts (it drains). The switch is one
    way: nothing moves a coach back to `old`, and a session never changes engine after it is
    assigned. A session is assigned once, when its occurrence first exists (materialised, by the app's
    path that creates it, which writes the new engine's session row for a new-engine session): an
    occurrence that did not exist at the switch is on the new engine whatever its window, so a coach
    whose window opens at creation (`first_invite` none) drains only the occurrences that already
    existed. Every entry point that reaches an engine reads this
    rule: the new engine's `sessions()` lists only new-engine sessions, and the old tick only
    old-engine ones. Where another spec says "a coach on the new engine" or "a coach on the old
    engine", it means a session this rule assigns to that engine. Once a coach has no old-engine
    session left, the coach's old per-vacancy jobs are removed; once every coach is drained, the old
    engine is deleted (swap plan §8 step 9).
19. **A new-engine coach's settings come from the stored configuration (swap plan §2; PAD-913).** For a
    coach on the new engine (rule 18), the store builds `EngineSettings` from this spec's stored values
    at every call (`notifications.engine-settings` rule 9), with no new copy of them:
    - `restrictions.maxSimultaneous` → `invites_per_spot` (X), its value whether or not it is enabled;
    - `restrictions.maxInactiveTime` → `timing.between_rounds` and `timing.between_groups`, both its
      value whether or not it is enabled (Open questions);
    - `restrictions.minTimeBeforeClass` → `last_invite_before`; off maps to zero, never the engine's
      default;
    - `restrictions.quietHours` → `quiet_hours`; off maps to none, never the engine's default;
    - `reminderTiming.invitationStart` → `first_invite` and the reminder timing → `attendance_request`,
      shape for shape (`notifications.engine-settings` rule 10), with `reminder_count` →
      `attendance_request.max` and `hours_between_reminders` → `attendance_request.every`;
    - `priorityCriteria` and `tiebreakers` → `ordering` (`notifications.engine-tiers` rule 8);
    - `autoAcceptJoinRequests` → `direct_join` (`notifications.engine-settings` rule 5);
    - `eligibilityRules` → none: the store applies them when it builds `pool`, and the engine's bar is
      wide open (swap decision 6);
    - `restrictions.maxInvitesPerStudentPerDay` → the store's `postponed`; `restrictions.noSameDayClass`,
      `excludedPlayers` and `excludeUnpaidSubscription` → the store's `pool` gates;
    - `autoNotifyEnabled` off, or a class's `auto_invites` or `notifications_enabled` off → the store
      lists none of those sessions;
    - `openSpotsVisible`, `notificationGroups` and `messageTemplates` stay the app's.
    The owner's answers (2026-11-11, PAD-912 decisions 2–5):
    - `invitationMode` → carried as stored; `semi_automatic` turns on the engine's hold
      (`notifications.engine-planning` rule 14);
    - `restrictions.maxTotal` → nothing: the owner dropped it (decision 3), M is the only cap;
    - `restrictions.cancellationDeadlineHours` → `absence_cutoff_before`, in hours; it only marks an
      absence on time or late (`notifications.engine-timeline` rule 5, decision 4);
    - `invitationGroups` → `tiers`, one tier per stored group in the coach's order, after the coach's
      list and the students' list, each carrying the group's rules (`notifications.engine-tiers`
      rule 13, decision 5); a group with no rules ("everyone") is a pool tier of any side and any level
      (`level_offset` none). Every stored group maps: the tier carries the group's rules as they are
      stored, and an attribute or operation the engine does not know is read as today
      (`notifications.engine-tiers` rule 13), never refused and never rounded to a nearer tier;
    - an ordering id the engine does not know (`notifications.engine-tiers` rule 8) is left out of
      `ordering`, so a coach is never refused for it; `maxSimultaneous` below 1 maps to 1; a criterion
      in both the priority list and the tiebreakers ranks once.
    The keys only the new engine has (`timing.method` and
    `per_tier`, automatic entry, side-bound lists) take the engine's defaults, which are the plan.

### Acceptance Criteria

#### NOTIFICATIONS-CONFIG-1: A new coach starts from the reference configuration (rule 17)
- **Given** no coach yet
- **When** a coach is created by sign-up, by accepting a club invitation as a new user, or by
  `create_coach_service`
- **Then** the coach has one `notification_configs` row holding exactly rule 17's values
- **And** `evaluation_scale_max` is 5, `excluded_players_enabled` is false with `[]`, and
  `message_templates` is NULL

#### NOTIFICATIONS-CONFIG-2: A coach created before rule 17 reads as before (rule 17)
- **Given** a coach with no `notification_configs` row
- **When** their configuration is first read
- **Then** the row created is the engine-off default of rule 1, not rule 17's values

#### NOTIFICATIONS-CONFIG-3: A save that changes the invitation start is recorded (rule 16)
- **Given** a coach whose invitation start is 7 days before at 19:00
- **When** they save 2 days before at 19:00 together with a new message template
- **Then** exactly one `notification_config_changes` row is written: key `invitation_start_value`,
  before `7`, after `2`, with the coach and the save time; the template change writes no row

#### NOTIFICATIONS-CONFIG-4: A save that changes nothing recorded writes nothing (rule 16)
- **Given** a coach's saved invitation groups and eligibility rules
- **When** they save the same groups and rules again
- **Then** no `notification_config_changes` row is written

#### NOTIFICATIONS-CONFIG-5: A student with another class that day is not invited (rule 6e)
- **Given** `noSameDayClass` on, a class Monday 18:00 Lisbon with one open vacancy, and roster
  students Busy (enrolled in another coach's class Monday 10:00) and Free
- **When** the batch is evaluated and sent
- **Then** Busy's verdict is `has_class_same_day` and only Free is invited; the explain path and
  the waiting-list wave give Busy the same verdict

#### NOTIFICATIONS-CONFIG-6: On by default (rule 6e, PAD-685)
- **Given** a coach who never saved the setting
- **When** `GET /api/app/notify/config` runs, and the same batch is evaluated
- **Then** `restrictions.noSameDayClass` is `{enabled: true}` and Busy is not invited
- **And** after the coach saves `{enabled: false}`, Busy is invited, and a later save of the
  section without the key keeps it off

#### NOTIFICATIONS-CONFIG-7: Existing coaches are switched on once (rule 6e, PAD-685)
- **Given** two existing rows with `no_same_day_class_enabled = false` before migration PAD-685
- **When** the migration runs, and runs again
- **Then** both rows read `true`, the column's server default is `true`, and the second run
  changes nothing

#### NOTIFICATIONS-CONFIG-8: What does not count as a class that day (rule 6e)
- **Given** `noSameDayClass` on and Busy's other class at 00:30 the next day, or 23:30 the day
  before, or Busy marked absent there, or Busy's answer there a "no", or that class cancelled
- **When** the batch is evaluated
- **Then** Busy is invited; a class at 00:00 or 23:59 of the same day does count

#### NOTIFICATIONS-CONFIG-9: An older client cannot switch it off (rule 6e)
- **Given** `noSameDayClass` on
- **When** a `restrictions` payload without the key is saved
- **Then** `noSameDayClass` stays `{enabled: true}`


#### NOTIFICATIONS-CONFIG-10: Get or create config
- **Given** a coach with no existing config
- **When** GET `/api/app/notify/config`
- **Then** a default config is created and returned

#### NOTIFICATIONS-CONFIG-11: Update config
- **Given** an existing config
- **When** POST `/api/app/notify/config` with `{"autoNotifyEnabled": true, "reminderTiming": {"type": "hours_before", "value": 24}}`
- **Then** the config is updated
- **And** scheduler jobs are rescheduled based on new timing

#### NOTIFICATIONS-CONFIG-12: A timing moved into the past leaves no job from the old timing (PAD-478)
- **Given** a class on Monday 18:00 (Lisbon), now Saturday 11:00, and a reminder "1 day before at 18:00", so `reminder_<id>` is armed for Sunday 18:00
- **When** the coach saves "2 days before at 09:00", which for this class was two hours ago
- **Then** no `reminder_<id>` job remains, and running whatever is armed sends the student nothing
- **And** the same holds for `invite_start_<id>`, for an occurrence job `reminder_lesson_<lesson>_<date>`, and for a timing of type `none`

#### NOTIFICATIONS-CONFIG-13: A class's jobs come from its primary coach (PAD-478)
- **Given** a class with coaches P (assigned first) and S, P's reminder "1 day before at 18:00" (future) and S's "2 days before at 09:00" (past)
- **When** S saves their settings, or the startup pass walks every coach
- **Then** `reminder_<id>` and `invite_start_<id>` are still armed at P's time, and `invite_start_<id>` carries P
- **And** with the timings swapped, no job is armed at S's time
- **And** the same holds when the occurrence's own coach is a substitute and the lesson's coach has the other timing
- **And** an occurrence not materialised yet follows the lesson's first coach
- **And** a class coached through its lesson, with two reminders, gets its follow-up armed at the lesson coach's spacing
- **And** a co-coach's save creates no configuration row for a primary coach who has none

#### NOTIFICATIONS-CONFIG-14: The coach is asked before past-due reminders are sent (PAD-478)
- **Given** a class on Monday 18:00, now Saturday 11:00, one student who has not been reminded, and the coach saves "2 days before at 09:00"
- **When** the save answers
- **Then** `pastDue.reminders` lists that class with 1 student, and no reminder has been sent
- **And** a class whose reminder time is still in the future, a class whose student was already reminded or has answered, and a class the coach is not primary coach of are not listed
- **When** the coach confirms and `POST /api/app/notify/past_due/send` is called with that class
- **Then** the student gets one reminder; calling it again, or twice at once, sends nothing more
- **And** a class that is another coach's, or that is no longer past due, is skipped and reported
- **And** a class cancelled or completed after it was listed is no longer listed, and a send that names it sends nothing
- **And** inside quiet hours nothing is sent at once: `quietUntil` is given, one pass is armed for that instant, and it sends when it runs; a later save that moves the reminder into the future removes that pass
- **And** the startup and daily passes send nothing and leave an armed pass in place

#### NOTIFICATIONS-CONFIG-15: The tab's Save asks, and only a yes sends (PAD-478, PAD-506)
- **Given** the coach changes a reminder timing on the web, and nothing is asked while they edit
- **When** they press the tab's Save and its answer lists `pastDue.reminders` "Academy B1", Monday 12 July, 18:00
- **Then** a dialog names that class with its day and time and ends with the question; nothing has been sent
- **When** they choose "do not send", or close the dialog
- **Then** nothing is sent, and a later timing save in the same visit that lists only that class does not ask again
- **When** a later save lists that class and "Kids", and they choose "send"
- **Then** the dialog names "Kids" alone and `POST /api/app/notify/past_due/send` is called with exactly its key
- **And** a Save that does not carry the timing never asks
- **And** when the Save's answer arrives after the coach has closed the reminders section, the dialog still appears
- **And** a send that fails says so in the dialog, which stays open
- **And** a list of 450 classes is sent as three requests of 200, 200 and 50, and the coach is told once
- **And** inside quiet hours the button says the time it will be sent at, not "now"

#### NOTIFICATIONS-CONFIG-16: One failure does not cost the rest (PAD-478)
- **Given** two coaches with a class each, and a derivation that fails for the first coach
- **When** the startup re-arm or the daily pass runs
- **Then** the second coach's class is armed, and the failure is logged with the first coach
- **And** creating a class, or editing a series, whose derivation fails still answers as saved

#### NOTIFICATIONS-CONFIG-17: An intermediate value leaves nothing behind (PAD-478)
- **Given** the same class and reminder
- **When** the coach saves "2 days before at 18:00" and then "2 days before at 09:00"
- **Then** no job remains at Saturday 18:00

#### NOTIFICATIONS-CONFIG-18: The implied job is not removed when it is merely due (PAD-478)
- **Given** `reminder_<id>` armed for Sunday 18:00 and a restart 20 seconds after that instant
- **When** the startup re-arm runs
- **Then** the job is still armed for Sunday 18:00

#### NOTIFICATIONS-CONFIG-19: The startup and daily passes send nothing (PAD-478)
- **Given** a class whose reminder time is already past and whose student was never reminded
- **When** the startup re-arm and the daily window pass run
- **Then** no reminder is sent and no reminder job is armed for it

#### NOTIFICATIONS-CONFIG-20: A pending follow-up moves with the spacing (PAD-478)
- **Given** two reminders 2 hours apart, the first sent at 17:00 UTC, so a follow-up is armed for 19:00
- **When** the coach raises the spacing to 6 hours at 18:00
- **Then** the follow-up is re-timed to 23:00 and the second reminder is sent then
- **And** lowering the spacing to 1 hour instead re-times it to 18:01
- **And** lowering the count to 1 instead removes it
- **And** it is removed when the student has answered, or when 17:00 plus the new spacing is at or after the class start
- **And** with a second student reminded at 17:30, it is re-timed to 23:30 and both are sent then
- **And** when the only student still owed one has had no reminder yet, it stays at 19:00
- **And** two follow-ups of one class become one; quiet hours do not defer it
- **And** the startup and daily passes leave it at 19:00

#### NOTIFICATIONS-CONFIG-21: A failed reschedule is reported (PAD-478)
- **Given** a scheduler whose job store cannot be reached
- **When** the coach saves a new `reminderTiming`
- **Then** the response is 200 with the saved configuration and `rescheduleFailed: true`, and the failure is logged with the coach
- **And** a save whose reschedule succeeded carries no `rescheduleFailed`

#### NOTIFICATIONS-CONFIG-22: The timing is held until the tab's Save (PAD-506, rule 10d)
- **Given** the reminders form with "24 hours before"
- **When** the coach taps "+" five times and types 09:30 in the time field
- **Then** the control shows 29 and 09:30 at once and nothing is sent
- **And** closing and reopening the section still shows 29 and 09:30, unsent
- **When** they press the tab's Save
- **Then** one save is sent, with 29 and 09:30, and the tab is clean
- **And** a response with `rescheduleFailed` also shows the line that says the timing is saved but scheduled reminders may still follow the previous one

#### NOTIFICATIONS-CONFIG-23: iOS Settings carries the Reminders panel (rule 10d, PAD-776 part 3)
- **Given** a coach on iOS Settings with the engine on and the invitation start "7 days before at 19:30"
- **When** they open Reminders
- **Then** they see the first reminder, reminders per student and invitation start controls with the saved values, and hours between reminders once the count is above one
- **When** they set the invitation start to 2 days at 19:00 and press the screen's Save
- **Then** one request is sent with `reminderTiming.invitationStart` `{type: "days_before_at_time", days: 2, time: "19:00"}`, and reopening Settings shows 2 days at 19:00
- **And** with the engine off the panel's controls are disabled

#### NOTIFICATIONS-CONFIG-24: iOS asks before anything past due is sent (rule 10f, PAD-776 part 3)
- **Given** a coach on iOS whose timing Save answers `pastDue` with three classes
- **When** the answer arrives
- **Then** the dialog lists the three and asks; closing it sends nothing and the same classes are not asked about again during the visit
- **When** instead they choose to send, with at most two classes per request
- **Then** two requests carry the three keys, the dialog closes and the coach is told what was sent; a failed request keeps the dialog open with its error
- **And** a Save that did not carry the timing never asks

#### NOTIFICATIONS-CONFIG-25: A reschedule that runs late arms what is saved (PAD-478)
- **Given** save A then save B of one coach
- **When** A's reschedule runs after B's
- **Then** the jobs are B's
- **And** two derivations for one primary coach started on two threads run one after the other
- **And** a derivation triggered by a co-coach, by the startup pass or by the daily pass holds the primary coach's lock
- **And** a configuration changed after the session loaded it is read again: the job is armed from the saved row
- **And** a derivation that cannot get the lock within its bound is reported as `rescheduleFailed`

#### NOTIFICATIONS-CONFIG-26: Update invitation mode
- **Given** an existing config with `auto_notify_enabled: true`
- **When** POST `/api/app/notify/config` with `{"invitationMode": "semi_automatic"}`
- **Then** the config is updated
- **And** subsequently created vacancies require coach approval before invitations are sent

#### NOTIFICATIONS-CONFIG-27: Coach configures cancellation deadline in Settings (PAD-45)
- **Given** an authenticated coach on Settings → Notifications
- **When** they open the Restrictions section
- **Then** a "Cancellation deadline" control is shown with an hours-before-class value defaulting to 24
- **And** changing the value and saving persists it via POST `/app/notify/config` under `restrictions.cancellationDeadlineHours`
- **And** the new value survives a page reload

#### NOTIFICATIONS-CONFIG-28: The config API keeps its shape over typed columns (PAD-279)
- **Given** a coach whose settings were saved before PAD-279 as JSON blobs — a nested `reminderTiming`, a `restrictions` object with a non-default `maxSimultaneous` and `cancellationDeadlineHours`, and an `invitation_start_timing` column of its own
- **When** the migration runs and the coach loads GET `/api/app/notify/config`
- **Then** `reminderTiming`, `restrictions` and the resolved invitation window read exactly as before, from the typed columns, and no `rounds` key is present
- **And** running the migration a second time changes nothing
- **And** a row whose old blob is not valid JSON keeps every default for that blob and the migration still completes

#### NOTIFICATIONS-CONFIG-29: An empty invitation-group list means the built-in groups (PAD-279)
- **Given** a coach whose `invitation_groups` is `[]`
- **When** a vacancy opens
- **Then** the engine runs the three built-in groups in order, exactly the waves the removed `rounds` fallback produced

#### NOTIFICATIONS-CONFIG-30: A timing the scheduler could not fire becomes the default, its counts survive (PAD-279)
- **Given** a coach whose stored `reminder_timing` is `{"reminderCount": 2, "hoursBetweenReminders": 6}` (no `firstReminder`, no `type`) and whose `restrictions` carry `"enabled": 1` and `"enabled": "false"` values
- **When** the migration runs
- **Then** the row still sends no reminder (`reminder_type = "none"`, the scheduler creates no reminder job), is logged with its id, and `reminderCount` is 2 and `hoursBetweenReminders` is 6
- **And** the `1` reads as enabled and the `"false"` as disabled

#### NOTIFICATIONS-CONFIG-31: maxTotal is one budget per class date, shared by its open spots (PAD-432)
- **Given** a coach with `maxTotal` = 3 (enabled) and a class occurrence with two open spots, where 2 invitations for it are already `sent`
- **When** the engine builds the next invitation batch for that occurrence, with 5 eligible students
- **Then** at most 1 invitation goes out (the batch is trimmed to the remaining budget of 3 − 2), whichever open spot it is for
- **And** once 3 are `sent`/`confirmed` for that occurrence, the eligibility gate refuses further invitations for it

#### NOTIFICATIONS-CONFIG-32: An expired invitation gives its place back (PAD-432)
- **Given** the same occurrence at its budget of 3, where one of the 3 invitations then expires
- **When** the engine checks the occurrence again
- **Then** one more invitation may be sent: `expired` (and `queued`) invitations do not count against `maxTotal`

#### NOTIFICATIONS-CONFIG-33: iOS shows the same ten restriction controls as web (PAD-433)
- **Given** a coach on iOS Settings with restrictions `maxSimultaneous {enabled: true, value: 3}`, `maxTotal {enabled: true, value: 10}`, `quietHours {enabled: true}` and `cancellationDeadlineHours` 24
- **When** they open the Restrictions section of the Auto-Invite Engine card
- **Then** the ten controls of rule 14 are shown, in web's order, with "3", "10" and "24" as the values and the quiet-hours switch on

#### NOTIFICATIONS-CONFIG-34: A step clamps at the shared bounds (PAD-433)
- **Given** `maxSimultaneous` at 20, `maxInactiveTime` at 15, and `cancellationDeadlineHours` at 0
- **When** the coach presses + on `maxSimultaneous`, − on `maxInactiveTime` and − on the cancellation deadline, on either client
- **Then** the values stay 20, 15 and 0, and the pressed button is disabled; a − on `maxInactiveTime` at 60 gives 45 (step 15)

#### NOTIFICATIONS-CONFIG-35: An excluded player is named after a reload (PAD-433, B-168)
- **Given** a coach whose saved `restrictions.excludedPlayers` is `{enabled: true, playerIds: ["<Alice's player id>"]}`
- **When** they load `GET /api/app/notify/config` and open the Restrictions section on either client
- **Then** the response carries `excludedPlayerNames: {"<Alice's player id>": "Alice Andrade"}` and the chip reads "Alice Andrade", not the id
- **And** a `POST` carrying `excludedPlayerNames` changes nothing stored

#### NOTIFICATIONS-CONFIG-36: A restriction changed on iOS survives reopening Settings (PAD-433)
- **Given** a coach on iOS Settings with `maxSimultaneous` at 3
- **When** they press + once, leave Settings and open it again
- **Then** `maxSimultaneous` reads 4, read back from `GET /api/app/notify/config`

#### NOTIFICATIONS-CONFIG-37: An excluded player is never invited (PAD-449)
- **Given** a coach with `restrictions.excludedPlayers` `{enabled: true, playerIds: ["<Excluded Student's player id>"]}`, two students on the roster and one open spot whose invitation group admits both
- **When** the engine evaluates the candidates and sends the first batch
- **Then** the excluded student's verdict is `excluded_by_coach` and only the other student is invited

#### NOTIFICATIONS-CONFIG-38: Quiet hours hold the sweep (B-200)
- **Given** quiet hours on, and an open vacancy with no invitation yet for a class at 09:00 Lisbon
- **When** the sweep runs at 23:30 Lisbon, and again at 07:30
- **Then** nothing is sent at 23:30 and the first batch goes out at 07:30
- **And** with quiet hours off, the 23:30 sweep sends it

#### NOTIFICATIONS-CONFIG-39: A night start trigger does not lose the spot (B-200)
- **Given** quiet hours on, and a never-filled spot whose invitation-start trigger fires at 23:30 Lisbon
- **When** the trigger runs, and the sweep runs at 07:30
- **Then** the trigger sends nothing, and the 07:30 sweep invites for that spot

#### NOTIFICATIONS-CONFIG-40: The coach sets the quiet window, and it can cross midnight (PAD-451)
- **Given** a coach who saves `quietHours` `{enabled: true, start: "23:00", end: "08:00"}`
- **When** the engine checks at 07:30 and at 08:00 Lisbon, and at 22:59 and 23:00
- **Then** 07:30 and 23:00 are inside the window (refused), 08:00 and 22:59 are outside (allowed)
- **And** GET `/api/app/notify/config` returns `quietHours: {enabled: true, start: "23:00", end: "08:00"}`, and a held vacancy is sent at the first tick after 08:00

#### NOTIFICATIONS-CONFIG-41: A window that does not cross midnight (PAD-451)
- **Given** `quietHours` `{enabled: true, start: "13:00", end: "15:00"}`
- **When** the engine checks at 12:59, 13:00, 14:30 and 15:00 Lisbon
- **Then** only 13:00 and 14:30 are refused

#### NOTIFICATIONS-CONFIG-42: Invalid bounds are refused (PAD-451)
- **Given** a coach with quiet hours 22:00–07:00 stored
- **When** POST `/api/app/notify/config` with `quietHours` start "22:00" end "22:00", or start "22:15", or end "25:00"
- **Then** each answers 400 and GET still returns 22:00–07:00

#### NOTIFICATIONS-CONFIG-43: An older app's save keeps the coach's hours (PAD-451)
- **Given** a coach with quiet hours 23:00–08:00 stored
- **When** a client from before PAD-451 posts `restrictions` with `quietHours: {enabled: false}` (no start/end)
- **Then** quiet hours are off and GET returns start "23:00", end "08:00"

#### NOTIFICATIONS-CONFIG-44: Both clients edit the window (PAD-451)
- **Given** a coach on web Settings → Notifications → Restrictions, and on iOS the same section, with quiet hours on
- **When** they pick 23:00 as start and 08:00 as end (30-minute choices)
- **Then** the description reads "Sem notificações entre as 23:00 e as 08:00" (en "No notifications between 23:00 and 08:00") and the saved config carries those bounds
- **And** with quiet hours off the time pickers are hidden, as a disabled stepper hides its value

#### NOTIFICATIONS-CONFIG-45: Automatic acceptance of join requests and semi-automatic mode exclude each other (rule 3a)
- **Given** a coach in semi-automatic mode
- **When** a save turns `autoAcceptJoinRequests` on
- **Then** it answers 400; the same save together with a switch to automatic mode is accepted
- **When** a coach who has it on saves the mode `semi_automatic`
- **Then** the save is accepted, `autoAcceptJoinRequests` comes back false, and the response carries `notice: "auto_accept_off"`; a save that changes neither carries no notice
- **And** on web and iOS the switch is held until Save and sent once with the rest of the engine's changes; in semi-automatic mode it is disabled with a one-line reason; a save answered with the notice tells the coach it was switched off
test: `backend/padel_app/tests/test_pad672_auto_accept_join_requests.py` › `test_it_cannot_be_turned_on_in_semi_automatic_mode` (+8 more)

#### NOTIFICATIONS-CONFIG-46: A setting nobody saved reads its built-in default, and a saved one reads as saved (rule 12)
- **Given** a configuration row with nothing saved
- **When** its settings are read
- **Then** the mode is `automatic`; the first reminder is `48` hours before and the invitation start `24` hours before; one reminder per student, `24` hours apart; the cancellation deadline is `24` hours
- **And** the limits read `maxSimultaneous` on at `3`, `maxTotal` at `10`, `maxInactiveTime` on at `120`, no excluded players, and the same-day restriction on
- **And** the invitation groups are the three built-in ones, the last with no rules, and the tiebreakers the five built-in ones
- **And** a setting that was saved reads as saved, the others keeping their defaults; a reminder count or spacing stored as zero or as something that is not a number reads as its default
test: `backend/padel_app/tests/test_semi_auto_approval.py` › `test_default_mode_is_automatic` (+34 more)

#### NOTIFICATIONS-CONFIG-47: The same-day switch says once that it now comes on by default (rule 6e, PAD-685)
- **Given** a coach on web or iOS Settings who has not dismissed the note
- **When** they open Restrictions
- **Then** the same-day switch shows on, and a note above it says the restriction now comes on by default
- **When** they dismiss the note
- **Then** it is gone, and stays gone on that device; storage that cannot be read or written never breaks the section and the note simply shows
- **And** flipping the switch changes only its own flag in the restrictions sent
test: `frontend/packages/config/src/same-day-default-note.test.ts` › `keeps the key web and iOS both store under` (+9 more)

#### NOTIFICATIONS-CONFIG-48: Each restrictions control changes its own value and nothing else (rule 14)
- **Given** a coach on the Restrictions section
- **When** they flip a switch, step the cancellation deadline, or add and remove an excluded player
- **Then** the restrictions reported are the whole object with only that value changed: a switch its own `enabled`, the deadline a plain number of hours, the excluded list its ids
- **And** a player already excluded is not offered again by the search
- **And** with the engine off the switches and steppers are disabled
- **And** the simultaneous limit is worded as invitations, not notifications, in Portuguese and in English
test: `frontend/apps/mobile/src/features/settings/restrictions-i18n.test.ts` › `pt` (+5 more)

#### NOTIFICATIONS-CONFIG-49: A past-due check that cannot be made does not fail the save, and the coach is told (rule 10f)
- **Given** a coach whose timing save would list past-due classes, and a listing that fails
- **When** they save the timing
- **Then** the save answers 200 with the saved timing, no `pastDue`, and `pastDueUnknown: true`; the failure is logged with the coach
- **And** the card says the check could not be made and asks nothing, also with the reminders section closed, on web and iOS; the line goes after the next timing save whose answer lacks the flag
test: `backend/padel_app/tests/test_pad478_ask_before_sending.py` › `test_a_listing_that_fails_does_not_turn_a_saved_config_into_an_error` (+3 more)

#### NOTIFICATIONS-CONFIG-50: A switched coach's sessions that have not started inviting run on the new engine (rule 18)
Given a coach on `old` with one session whose invitation window has opened and one whose has not, when
the coach is switched to `new`, then the second runs on the new engine (listed by its `sessions()`, never
by the old tick) and the first stays on the old engine until it starts.
test: `backend/padel_app/tests/test_engine_switch.py` › `test_a_switched_coach_drains_old_sessions_and_starts_new_ones_on_the_new_engine`

#### NOTIFICATIONS-CONFIG-51: A coach not switched never reaches the new engine (rule 18)
Given a coach on `old`, when a spot opens, an answer arrives or the tick runs, then only the old engine
acts for the coach's sessions and the new engine's `sessions()` lists none of them.
test: `backend/padel_app/tests/test_engine_switch.py` › `test_a_coach_not_switched_never_reaches_the_new_engine`

#### NOTIFICATIONS-CONFIG-52: A new-engine coach's settings are the stored values, the traps mapped off (rule 19)
Given a coach with `minTimeBeforeClass` off, `quietHours` off, `maxSimultaneous` 4 disabled and
`maxInactiveTime` 45 minutes, when the store builds the coach's `EngineSettings`, then `last_invite_before`
is zero, `quiet_hours` none, `invites_per_spot` 4 and both timing values 45 minutes.
test: `backend/padel_app/tests/test_engine_settings_mapping.py` › `test_stored_values_map_and_off_traps_stay_off`

#### NOTIFICATIONS-CONFIG-53: Eligibility, caps and exclusions stay in the app's pool (rule 19)
Given a coach with an eligibility rule, a daily per-student cap reached by one student, an excluded
student and `noSameDayClass` on for a student with a class that day, when the store builds a snapshot,
then the capped student is in `postponed`, and the student below the bar, the excluded one and the one
with a class that day are not in `pool`.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_app_gates_build_the_pool`

#### NOTIFICATIONS-CONFIG-60: The engine's eligibility bar is wide open (rule 19)
Given a coach with an eligibility rule, when the store builds the coach's `EngineSettings`, then the
engine's own bar admits every student, so the rule acts only through `pool` (CONFIG-53).
test: `backend/padel_app/tests/test_engine_settings_mapping.py` › `test_the_engine_bar_is_wide_open`

#### NOTIFICATIONS-CONFIG-54: A session the coach or class turned off is never listed (rule 19)
Given a new-engine coach with `autoNotifyEnabled` off, and another with one class's `auto_invites` off,
when the store lists sessions, then none of the first coach's sessions and not that class's are listed.
test: `backend/padel_app/tests/test_engine_settings_mapping.py` › `test_sessions_turned_off_are_not_listed`

#### NOTIFICATIONS-CONFIG-55: A new-engine coach's ordering is the enabled priority criteria, then the enabled tiebreakers (rule 19)
Given a coach with priority criteria and tiebreakers, some off, each list in the coach's order, when
the store builds the coach's `EngineSettings`, then `ordering` holds the enabled priority criteria in
their order followed by the enabled tiebreakers in theirs, and nothing that is off.
test: `backend/padel_app/tests/test_engine_settings_mapping.py` › `test_ordering_is_the_enabled_priority_criteria_then_the_enabled_tiebreakers`

#### NOTIFICATIONS-CONFIG-56: The cancellation deadline is the absence cutoff (rule 19)
Given a coach with `cancellationDeadlineHours` 24, when the store builds the coach's `EngineSettings`,
then `absence_cutoff_before` is 24 hours.
test: `backend/padel_app/tests/test_engine_settings_mapping.py` › `test_cancellation_deadline_maps_to_the_absence_cutoff`

#### NOTIFICATIONS-CONFIG-57: Each invitation group becomes one tier, in the coach's order (rule 19)
Given the reference groups (level same + side same; level same; no rules), when the store builds the
coach's `EngineSettings`, then `tiers` is the coach's list, the students' list, then one tier per group
in order: (pool, side same, level 0), (pool, side any, level 0), (pool, side any, level any).
test: `backend/padel_app/tests/test_engine_settings_mapping.py` › `test_invitation_groups_map_to_tiers_one_for_one`

#### NOTIFICATIONS-CONFIG-58: The invitation mode is carried (rule 19)
Given a coach in `semi_automatic` mode and one in `automatic`, when the store builds each coach's
`EngineSettings`, then each carries its stored mode.
test: `backend/padel_app/tests/test_engine_settings_mapping.py` › `test_invitation_mode_is_carried`

#### NOTIFICATIONS-CONFIG-59: Every stored group maps, an unknown rule included (rule 19)
Given a group with a rule whose attribute the engine does not know and a group with an unknown level
operation, when the store builds the coach's `EngineSettings`, then no `SettingsError` is raised and
each group is one tier carrying its rules as stored.
test: `backend/padel_app/tests/test_engine_settings_mapping.py` › `test_every_stored_group_maps_an_unknown_rule_included`

#### NOTIFICATIONS-CONFIG-61: A session the old engine already started stays on the old engine (rule 18)
Given a coach on `old` with a session whose window has not opened but for which the coach pressed
"invite now", when the coach is switched to `new`, then that session drains on the old engine and the
new engine's `sessions()` never lists it.
test: `backend/padel_app/tests/test_engine_switch.py` › `test_a_session_the_old_engine_already_started_stays_on_the_old_engine`

#### NOTIFICATIONS-CONFIG-62: The reminder count and interval are the attendance request's max and every (rule 19)
Given a coach with `reminder_count` 2 and `hours_between_reminders` 6, when the store builds the coach's
`EngineSettings`, then `attendance_request.max` is 2 and `attendance_request.every` is 6 hours.
test: `backend/padel_app/tests/test_engine_settings_mapping.py` › `test_reminder_count_and_interval_map_to_the_attendance_request`

#### NOTIFICATIONS-CONFIG-63: An occurrence that first exists after the switch runs on the new engine (rule 18)
Given a coach whose invitation window opens at creation, with one materialised occurrence, when the
coach is switched to `new` and a later occurrence of the same class is materialised, then the first
drains on the old engine and the later one is on the new engine, with its session row written when it
was materialised.
test: `backend/padel_app/tests/test_engine_switch.py` › `test_an_occurrence_that_first_exists_after_the_switch_runs_on_the_new_engine`

### Open questions
- The timing floor (rule on `between_rounds`/`between_groups`, swap decision 7) — Decision (coordinator, owner away, PAD-912, 2026-11-11; the owner can reverse it): the clients'
  15-minute floor drops to the engine's one minute with the new timing controls
  (`notifications.engine-settings`, const:ENGINE_T_FLOOR there).
- iOS at the swap — Decision (coordinator, owner away, PAD-912, 2026-11-11; the owner can reverse it): every setting the new engine needs ships on web and iOS together, the
  groups editor (now tiers) included; the iOS deferrals recorded before the swap stand with their
  reasons.
- A coach created during cutover (rule 18) — options: `old` until switched; `new` from the start.
  Decision (S, owner away, PAD-913; the owner can reverse it): `old` until switched, because the
  coordinator switches coaches one at a time (staging first, one real coach, then all) and a new
  coach on `new` would skip that order.
- `maxInactiveTime` or `maxSimultaneous` disabled, for a new-engine coach (rule 19) — options: the
  stored value; the engine's default; for the timer, T until `last_invite_at`. Decision (S, owner away,
  PAD-913; the owner can reverse it): the stored value, because the engine has no "off" for either
  (X ≥ 1, T ≥ const:ENGINE_T_FLOOR) and the stored value is the one the coach last chose.
- The swap decisions 2–5 the store left unmapped (rule 19) — answered by the owner (2026-11-11):
  semi-automatic is kept ("exactly the same engine, but instead of sending directly the message it
  should ask the coach permission"), `maxTotal` is dropped, the cancellation deadline marks on time or
  late only ("justified or unjustified is always a coach's judgement"), and groups become tiers one
  for one ("it cannot be well built if it doesn't take into account these important rules"). Once the
  tier carried the group rules (N, PAD-915), every stored group maps; S's earlier interim refusal of a
  group the tier could not express is retired with it.
- The switch's way back, and a session the old engine started early (rule 18) — decisions (R, PAD-917,
  owner away; the coordinator agrees; the owner can reverse them): the switch is one way, because rule
  18 names no way back and a session moving between engines mid-flight would lose its invitations; a
  session the old engine had already started inviting for before its window ("invite now", an
  approved semi-automatic spot) is "already inviting" and drains on the old engine.
- Ordering ids the engine does not know, `maxSimultaneous` below 1, a criterion in both lists —
  decisions (R, PAD-917, owner away): dropped from `ordering` rather than refusing the coach, mapped to
  1, ranked once, so a coach's stored settings never block the switch.
