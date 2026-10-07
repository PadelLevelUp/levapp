---
id: notifications.config
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/notifications/coach-tunes-the-invitation-engine.business.md
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
4. First reminder timing (`reminder_type`, `reminder_value`, `reminder_time`; on the wire `reminderTiming.firstReminder`): `{type: "hours_before", value: N}` or `{type: "days_before", days: N, time: "HH:MM"}`. `hours_before` counts real hours before the class's start, and `time` is the club's wall clock on the class's own date (`notifications.reminders` rule 15, PAD-256)
5. Invitation window (`invitation_start_type`, `invitation_start_value`, `invitation_start_time`; on the wire `reminderTiming.invitationStart`): when to start sending invitations after a vacancy. One home only — the duplicate `invitation_start_timing` column and its precedence dance are gone (PAD-279)
6. Restrictions (typed columns, composed on the wire as the `restrictions` object): maxSimultaneous, maxTotal, maxInactiveTime, minTimeBeforeClass, maxInvitesPerStudentPerDay, quietHours, excludedPlayers, excludeUnpaidSubscription (labelled "Exclude inactive accounts" — rule 7c)
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
   `_send_invitation_batch`). **Queued and expired invitations do not count**: a queued one is not
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
10. Updating timing configs reschedules all future scheduler jobs
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
   (PAD-540) says what opens it instead: the next tick, once the class exists; the save itself
   still sends nothing. The class gets nothing from the save itself; rule 10f says how the coach can have it sent. A
   job already armed at exactly the implied time is left alone, even when that time has just
   passed, so it fires or expires inside its grace time. No job armed from a previous or an
   intermediate value remains. The startup re-arm and the daily window pass use the same
   derivation, and for them a past fire time always means no job and nothing sent. Both passes
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
   failure is logged with the coach, and the response carries `rescheduleFailed: true`. The web
   form then treats the save as saved, like any saved value (the tab is clean), and says on a line of its
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
   saver; that model, and what a closing tab could lose under it, are gone.) iOS has no control
   for these fields.
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
   again sends every key again, which the server's own check makes harmless. Web only, and deliberately: the question is asked from a timing save, and iOS has no
   control that saves a reminder timing (rule 10d), so there is nothing to ship there. Only an explicit yes sends, through `POST /api/app/notify/past_due/send`: the
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
   by picking a timing in Settings, as before. Booleans stored as `0`/`1` or `"true"`/`"false"` by an older client are read the
   way the old truthiness check read them, not reset to the default.

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
   (Settings → Auto-Invite Engine → Restrictions) show the same nine controls over the same
   `restrictions` object of `GET|POST /api/app/notify/config`: `maxSimultaneous` 1–20 step 1,
   `maxTotal` 1–50 step 1, `maxInactiveTime` 15–1440 min step 15 (the server also clamps a saved
   value below 15 up to 15, PAD-495), `minTimeBeforeClass` 5–240 min
   step 5, `maxInvitesPerStudentPerDay` 1–10 step 1, the `quietHours`, `excludedPlayers` and
   `excludeUnpaidSubscription` toggles, and `cancellationDeadlineHours` 0–168 h step 1 (no toggle).
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

### Acceptance Criteria

#### Get or create config
- **Given** a coach with no existing config
- **When** GET `/api/app/notification_config`
- **Then** a default config is created and returned

#### Update config
- **Given** an existing config
- **When** POST `/api/app/notification_config` with `{"auto_notify_enabled": true, "reminder_timing": {"type": "hours_before", "value": 24}}`
- **Then** the config is updated
- **And** scheduler jobs are rescheduled based on new timing

#### A timing moved into the past leaves no job from the old timing (PAD-478)
- **Given** a class on Monday 18:00 (Lisbon), now Saturday 11:00, and a reminder "1 day before at 18:00", so `reminder_<id>` is armed for Sunday 18:00
- **When** the coach saves "2 days before at 09:00", which for this class was two hours ago
- **Then** no `reminder_<id>` job remains, and running whatever is armed sends the student nothing
- **And** the same holds for `invite_start_<id>`, for an occurrence job `reminder_lesson_<lesson>_<date>`, and for a timing of type `none`

#### A class's jobs come from its primary coach (PAD-478)
- **Given** a class with coaches P (assigned first) and S, P's reminder "1 day before at 18:00" (future) and S's "2 days before at 09:00" (past)
- **When** S saves their settings, or the startup pass walks every coach
- **Then** `reminder_<id>` and `invite_start_<id>` are still armed at P's time, and `invite_start_<id>` carries P
- **And** with the timings swapped, no job is armed at S's time
- **And** the same holds when the occurrence's own coach is a substitute and the lesson's coach has the other timing
- **And** an occurrence not materialised yet follows the lesson's first coach
- **And** a class coached through its lesson, with two reminders, gets its follow-up armed at the lesson coach's spacing
- **And** a co-coach's save creates no configuration row for a primary coach who has none

#### The coach is asked before past-due reminders are sent (PAD-478)
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

#### The tab's Save asks, and only a yes sends (PAD-478, PAD-506)
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

#### One failure does not cost the rest (PAD-478)
- **Given** two coaches with a class each, and a derivation that fails for the first coach
- **When** the startup re-arm or the daily pass runs
- **Then** the second coach's class is armed, and the failure is logged with the first coach
- **And** creating a class, or editing a series, whose derivation fails still answers as saved

#### An intermediate value leaves nothing behind (PAD-478)
- **Given** the same class and reminder
- **When** the coach saves "2 days before at 18:00" and then "2 days before at 09:00"
- **Then** no job remains at Saturday 18:00

#### The implied job is not removed when it is merely due (PAD-478)
- **Given** `reminder_<id>` armed for Sunday 18:00 and a restart 20 seconds after that instant
- **When** the startup re-arm runs
- **Then** the job is still armed for Sunday 18:00

#### The startup and daily passes send nothing (PAD-478)
- **Given** a class whose reminder time is already past and whose student was never reminded
- **When** the startup re-arm and the daily window pass run
- **Then** no reminder is sent and no reminder job is armed for it

#### A pending follow-up moves with the spacing (PAD-478)
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

#### A failed reschedule is reported (PAD-478)
- **Given** a scheduler whose job store cannot be reached
- **When** the coach saves a new `reminderTiming`
- **Then** the response is 200 with the saved configuration and `rescheduleFailed: true`, and the failure is logged with the coach
- **And** a save whose reschedule succeeded carries no `rescheduleFailed`

#### The timing is held until the tab's Save (PAD-506, rule 10d)
- **Given** the reminders form with "24 hours before"
- **When** the coach taps "+" five times and types 09:30 in the time field
- **Then** the control shows 29 and 09:30 at once and nothing is sent
- **And** closing and reopening the section still shows 29 and 09:30, unsent
- **When** they press the tab's Save
- **Then** one save is sent, with 29 and 09:30, and the tab is clean
- **And** a response with `rescheduleFailed` also shows the line that says the timing is saved but scheduled reminders may still follow the previous one

#### A reschedule that runs late arms what is saved (PAD-478)
- **Given** save A then save B of one coach
- **When** A's reschedule runs after B's
- **Then** the jobs are B's
- **And** two derivations for one primary coach started on two threads run one after the other
- **And** a derivation triggered by a co-coach, by the startup pass or by the daily pass holds the primary coach's lock
- **And** a configuration changed after the session loaded it is read again: the job is armed from the saved row
- **And** a derivation that cannot get the lock within its bound is reported as `rescheduleFailed`

#### Update invitation mode
- **Given** an existing config with `auto_notify_enabled: true`
- **When** POST `/api/app/notification_config` with `{"invitation_mode": "semi_automatic"}`
- **Then** the config is updated
- **And** subsequently created vacancies require coach approval before invitations are sent

#### Coach configures cancellation deadline in Settings (PAD-45)
- **Given** an authenticated coach on Settings → Notifications
- **When** they open the Restrictions section
- **Then** a "Cancellation deadline" control is shown with an hours-before-class value defaulting to 24
- **And** changing the value and saving persists it via POST `/app/notify/config` under `restrictions.cancellationDeadlineHours`
- **And** the new value survives a page reload

#### The config API keeps its shape over typed columns (PAD-279)
- **Given** a coach whose settings were saved before PAD-279 as JSON blobs — a nested `reminderTiming`, a `restrictions` object with a non-default `maxSimultaneous` and `cancellationDeadlineHours`, and an `invitation_start_timing` column of its own
- **When** the migration runs and the coach loads GET `/api/app/notify/config`
- **Then** `reminderTiming`, `restrictions` and the resolved invitation window read exactly as before, from the typed columns, and no `rounds` key is present
- **And** running the migration a second time changes nothing
- **And** a row whose old blob is not valid JSON keeps every default for that blob and the migration still completes

#### An empty invitation-group list means the built-in groups (PAD-279)
- **Given** a coach whose `invitation_groups` is `[]`
- **When** a vacancy opens
- **Then** the engine runs the three built-in groups in order, exactly the waves the removed `rounds` fallback produced

#### A timing the scheduler could not fire becomes the default, its counts survive (PAD-279)
- **Given** a coach whose stored `reminder_timing` is `{"reminderCount": 2, "hoursBetweenReminders": 6}` (no `firstReminder`, no `type`) and whose `restrictions` carry `"enabled": 1` and `"enabled": "false"` values
- **When** the migration runs
- **Then** the row still sends no reminder (`reminder_type = "none"`, the scheduler creates no reminder job), is logged with its id, and `reminderCount` is 2 and `hoursBetweenReminders` is 6
- **And** the `1` reads as enabled and the `"false"` as disabled

#### maxTotal is one budget per class date, shared by its open spots (PAD-432)
- **Given** a coach with `maxTotal` = 3 (enabled) and a class occurrence with two open spots, where 2 invitations for it are already `sent`
- **When** the engine builds the next invitation batch for that occurrence, with 5 eligible students
- **Then** at most 1 invitation goes out (the batch is trimmed to the remaining budget of 3 − 2), whichever open spot it is for
- **And** once 3 are `sent`/`confirmed` for that occurrence, the eligibility gate refuses further invitations for it

#### An expired invitation gives its place back (PAD-432)
- **Given** the same occurrence at its budget of 3, where one of the 3 invitations then expires
- **When** the engine checks the occurrence again
- **Then** one more invitation may be sent: `expired` (and `queued`) invitations do not count against `maxTotal`

#### iOS shows the same nine restriction controls as web (PAD-433)
- **Given** a coach on iOS Settings with restrictions `maxSimultaneous {enabled: true, value: 3}`, `maxTotal {enabled: true, value: 10}`, `quietHours {enabled: true}` and `cancellationDeadlineHours` 24
- **When** they open the Restrictions section of the Auto-Invite Engine card
- **Then** the nine controls of rule 14 are shown, in web's order, with "3", "10" and "24" as the values and the quiet-hours switch on

#### A step clamps at the shared bounds (PAD-433)
- **Given** `maxSimultaneous` at 20, `maxInactiveTime` at 15, and `cancellationDeadlineHours` at 0
- **When** the coach presses + on `maxSimultaneous`, − on `maxInactiveTime` and − on the cancellation deadline, on either client
- **Then** the values stay 20, 15 and 0, and the pressed button is disabled; a − on `maxInactiveTime` at 60 gives 45 (step 15)

#### An excluded player is named after a reload (PAD-433, B-168)
- **Given** a coach whose saved `restrictions.excludedPlayers` is `{enabled: true, playerIds: ["<Alice's player id>"]}`
- **When** they load `GET /api/app/notify/config` and open the Restrictions section on either client
- **Then** the response carries `excludedPlayerNames: {"<Alice's player id>": "Alice Andrade"}` and the chip reads "Alice Andrade", not the id
- **And** a `POST` carrying `excludedPlayerNames` changes nothing stored

#### A restriction changed on iOS survives reopening Settings (PAD-433)
- **Given** a coach on iOS Settings with `maxSimultaneous` at 3
- **When** they press + once, leave Settings and open it again
- **Then** `maxSimultaneous` reads 4, read back from `GET /api/app/notify/config`

#### An excluded player is never invited (PAD-449)
- **Given** a coach with `restrictions.excludedPlayers` `{enabled: true, playerIds: ["<Excluded Student's player id>"]}`, two students on the roster and one open spot whose invitation group admits both
- **When** the engine evaluates the candidates and sends the first batch
- **Then** the excluded student's verdict is `excluded_by_coach` and only the other student is invited

#### Quiet hours hold the sweep (B-200)
- **Given** quiet hours on, and an open vacancy with no invitation yet for a class at 09:00 Lisbon
- **When** the sweep runs at 23:30 Lisbon, and again at 07:30
- **Then** nothing is sent at 23:30 and the first batch goes out at 07:30
- **And** with quiet hours off, the 23:30 sweep sends it

#### A night start trigger does not lose the spot (B-200)
- **Given** quiet hours on, and a never-filled spot whose invitation-start trigger fires at 23:30 Lisbon
- **When** the trigger runs, and the sweep runs at 07:30
- **Then** the trigger sends nothing, and the 07:30 sweep invites for that spot

#### The coach sets the quiet window, and it can cross midnight (PAD-451)
- **Given** a coach who saves `quietHours` `{enabled: true, start: "23:00", end: "08:00"}`
- **When** the engine checks at 07:30 and at 08:00 Lisbon, and at 22:59 and 23:00
- **Then** 07:30 and 23:00 are inside the window (refused), 08:00 and 22:59 are outside (allowed)
- **And** GET `/api/app/notify/config` returns `quietHours: {enabled: true, start: "23:00", end: "08:00"}`, and a held vacancy is sent at the first tick after 08:00

#### A window that does not cross midnight (PAD-451)
- **Given** `quietHours` `{enabled: true, start: "13:00", end: "15:00"}`
- **When** the engine checks at 12:59, 13:00, 14:30 and 15:00 Lisbon
- **Then** only 13:00 and 14:30 are refused

#### Invalid bounds are refused (PAD-451)
- **Given** a coach with quiet hours 22:00–07:00 stored
- **When** POST `/api/app/notify/config` with `quietHours` start "22:00" end "22:00", or start "22:15", or end "25:00"
- **Then** each answers 400 and GET still returns 22:00–07:00

#### An older app's save keeps the coach's hours (PAD-451)
- **Given** a coach with quiet hours 23:00–08:00 stored
- **When** a client from before PAD-451 posts `restrictions` with `quietHours: {enabled: false}` (no start/end)
- **Then** quiet hours are off and GET returns start "23:00", end "08:00"

#### Both clients edit the window (PAD-451)
- **Given** a coach on web Settings → Notifications → Restrictions, and on iOS the same section, with quiet hours on
- **When** they pick 23:00 as start and 08:00 as end (30-minute choices)
- **Then** the description reads "Sem notificações entre as 23:00 e as 08:00" (en "No notifications between 23:00 and 08:00") and the saved config carries those bounds
- **And** with quiet hours off the time pickers are hidden, as a disabled stepper hides its value

