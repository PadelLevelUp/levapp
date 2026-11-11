---
id: notifications.engine-timeline
status: draft
depends_on: [notifications.engine-spots, notifications.reminders, notifications.config]
serves: [P-NOTIFICATIONS-8]
governed_by: []
---

# notifications.engine-timeline

### Intent
A session's timeline under the redesigned engine, and the clock that decides when an invitation stops
counting (PAD-899; plan §2, §8, D14, D16; coordinator rulings D-E6 and (2) of 2026-11-11).

### Entities
- **READS:** `EngineSettings` (`first_invite`, `attendance_request`, `absence_cutoff_before`,
  `last_invite_before`, `quiet_hours`, `timing`), the session's start, the regulars' answers.
- **WRITES:** each invitation's counting-until instant at send; `Absence` effects; `SideAssigned` for
  each flexible going student at `last_invite_at`, with a const:KIND_SIDE_MOVED message to a regular
  who moved.

### Rules
1. **`first_invite_at` (§8 step 2).** Invitations start for the session's spots, computed as today
   (`notifications.invitations` rules 11, 11a, kept).
2. **`attendance_request_at` (§8 step 3; owned by the engine after the swap, PAD-912).** The engine
   sends the attendance requests (`invitation_engine/messages.py`, `due`): the first at
   `attendance_request_at` (`EngineSettings.attendance_request`: days before, wall-clock time, Lisbon),
   then every `every`, at most `max` sends, each only to who has not answered. The recipients are the
   going students placed as a regular, a returning regular, by automatic entry or by direct join;
   never a student placed by accepting an invitation, an absent regular or one who confirmed. A
   student placed after a send waits for the next one; a run that comes late sends the latest send
   once, never the missed ones; quiet hours hold a send until they end; nothing goes out once the
   class has started. Silence keeps the spot. At a coach's cutover the app's reminder flow
   (`notifications.reminders`) stops for that coach's sessions: the engine's requests replace it,
   never alongside it.
3. **Quiet hours (D14).** Nobody is invited during them, from any tier; they never reorder tiers; they
   pause every invitation's counting. Answers during them count.
4. **An invitation's T is fixed when it is sent (ruling D-E6).** For each invitation the run creates (or
   re-offers), T is `between_rounds` when, after that run's sends, the invitation's tier still has
   uninvited candidates for any type in the offer, and `between_groups` when it has none; with Method B,
   T is the tier's share (`notifications.engine-settings` rule 2). The invitation counts until T has
   run, quiet hours not counted; then it stops counting and stays open. A No never changes another
   invitation's T. With the two settings equal this is the plan's single T, and D9, D16 and D17 run
   unchanged: no clock gives a spot to the next tier while it is covered.
5. **A regular's No and the absence cutoff (§8 steps 4–5).** The spot enters the next run. A No before
   `absence_cutoff_at` is a justified absence, after it unjustified. The engine decides by the cutoff;
   the coach can still correct it (`attendance.confirm`).
6. **`last_invite_at` (§8 step 6; ruling (2)).** No new invitation after it. Flexible going students
   get their final side and are told it (const:KIND_SIDE_MOVED): {left, right} students their usual
   side when possible; when a side is over its quota, one regular moves — the coach's choice, else the
   one who moved least recently, ties to the one who joined the class most recently (`joined_at`). The
   engine records each move. Open invitations can still be accepted.
7. **After the class (§8 step 7).** A regular who did not answer and did not come gets an unjustified
   absence.

### Not this spec
- The class's start stopping everything: kept as `notifications.invitations` rule 20.
- A clock that hands a spot to the next tier while it is covered (contradicts D9, D16). Method B's
  rounds inside one tier are `notifications.engine-settings` rule 2 (PAD-911).

### Today
- Pacing is `maxInactiveTime` per vacancy batch, restarted on every No (the code stamps
  `last_activity_at`), in `_send_invitation_batch` (`backend/padel_app/services/notification_service.py:5094`)
  and `_send_next_on_decline` (`:5467`); its 15-minute floor is `MIN_INACTIVE_MINUTES`
  (`backend/padel_app/models/notification_config.py:382`). Quiet hours hold sends in
  `_check_restrictions` (`:2134`) without pausing the clock; `notifications.invitations` rules 5, 8.
  Pinned by `test_pad451_quiet_hours_hold_the_sweep.py`, `test_pad495_answers_and_sends.py:219`.
- Absences: `cancellationDeadlineHours` only flags a late cancellation and the coach decides
  (`notification_service.py:4922`–`:4979`); `attendance.confirm`.
- No regular is ever moved to the other side by the engine; no move history exists.
- Attendance requests today are the app's reminders: a `reminder_lesson_{lesson_id}_{date}` job per
  occurrence calls `send_class_reminders` (`notification_service.py:3846`), answered through
  `respond_to_reminder` (`:4300`); `notifications.reminders`. The engine's producer exists since #946
  (`invitation_engine/messages.py`, `AttendanceRequested`), pinned by
  `backend/padel_app/tests/test_invitation_engine_messages.py`; no app path calls it yet.
- Not read beyond the lines above. The new producers: `invitation_engine/timeline.py` (`due`, counting),
  `invitation_engine/absences.py`; the counting-until instant is a new field on `effects.Invited` and
  `snapshot.Invitation` (shared-module change).

### Acceptance Criteria

#### NOTIFICATIONS-ENGINE-TIMELINE-1: Quiet hours send nothing and pause counting (rules 3, 4; S30)
Given quiet hours 22:00–07:00, T of one hour, an invitation sent at 21:30 and a spot opening at 23:00, when
the clock runs to 07:31, then nothing is sent from 22:00 to 07:00, group 1 is planned first at 07:00,
and the 21:30 invitation stops counting at 07:30.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P30-quiet-hours]`

#### NOTIFICATIONS-ENGINE-TIMELINE-2: A send that empties its tier gets between_groups, the others between_rounds (rule 4)
Given `between_rounds` 20 min, `between_groups` one hour, one right spot, X = 3 and 4 right-siders in one
tier, when the run sends 3 at 19:00, then those count until 19:20; when the 4th is sent at 19:20, then it
counts until 20:20, and the next tier gets the spot at 20:20.
test: `backend/padel_app/tests/test_invitation_engine_timeline.py` › `test_t_at_send_follows_the_tier_state`

#### NOTIFICATIONS-ENGINE-TIMELINE-3: Scenario 4 under the two timing settings (rule 4)
Given scenario 4 (Method A, 20 minutes between rounds, an hour between groups), when it runs, then group 4 is invited at 20:20.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[04-grupo-esgota-se-sem-resposta]`

#### NOTIFICATIONS-ENGINE-TIMELINE-4: Equal settings give one T whichever branch fires (rule 4)
Given `between_rounds` and `between_groups` set to one value, when invitations are sent that leave the
tier with and without uninvited candidates, then every one gets that value.
test: `backend/padel_app/tests/test_invitation_engine_timeline.py` › `test_equal_settings_are_the_single_t`

#### NOTIFICATIONS-ENGINE-TIMELINE-5: A No does not restart anyone's T (rule 4)
Given an invitation sent at 19:00 with T 20 min, when another invitee says No at 19:10, then the first
still stops counting at 19:20.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[80-uma-recusa-a-meio-de-uma-ronda]`

#### NOTIFICATIONS-ENGINE-TIMELINE-6: A silent regular keeps the spot and is absent unjustified (rules 2, 7; S16)
Given 4 left and 4 right regulars and a right regular who never answers and does not come, then nothing
is sent for their spot, and after the class they have an unjustified absence.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P16-silent-regular]`

#### NOTIFICATIONS-ENGINE-TIMELINE-7: A No before the cutoff is justified, after it unjustified (rule 5)
Given the cutoff 12 h before the class, when one regular says No 20 h before and another 6 h before,
then the first absence is justified and the second unjustified.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[61-falta-justificada-e-injustificada]`

#### NOTIFICATIONS-ENGINE-TIMELINE-8: A side over quota sheds the regular who moved least recently (rule 6; S18)
Given capacity 8, 1 left and 5 right regulars, none ever moved, the latest joined being R5, 10
left-siders and X = 3, when 2 left-siders accept, then 6 were invited and at `last_invite_at` R5 moves
left and gets const:KIND_SIDE_MOVED.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P18a-one-side-over-two-accept]`

#### NOTIFICATIONS-ENGINE-TIMELINE-9: A No from the over-quota side means nobody moves (rule 6; S18)
Given S18's start, when a right regular says No first, then nobody moves and the invitations top up to 9.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P18b-one-side-over-regular-no-first]`

#### NOTIFICATIONS-ENGINE-TIMELINE-10: Flexible regulars balance the sides at last_invite_at (rule 6; S19)
Given 1 left, 5 right and 1 {left, right} regular and 5 left-siders, when a left-sider says Yes, then 3
were invited and at `last_invite_at` the "both" regular and one right regular play left: 4 / 4.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P19-unbalanced-with-a-both-regular]`

#### NOTIFICATIONS-ENGINE-TIMELINE-11: A "both" regular fills the side left open (rule 6; S11)
Given 3 left, 3 right and 1 {left, right} regular and 1 right-sider, when the right-sider says Yes, then
only they were invited and at `last_invite_at` the "both" regular plays left and gets const:KIND_SIDE_MOVED.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P11a-both-regular-fills-other-side]`

#### NOTIFICATIONS-ENGINE-TIMELINE-12: The remaining "both" regular takes the open side (rule 6; S13)
Given 3 left, 3 right and 2 {left, right} regulars and 5 left-siders, when one "both" regular says No and
a left-sider says Yes, then 3 left-siders were invited and the other "both" regular plays right and gets const:KIND_SIDE_MOVED.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P13-both-regular-says-no]`

#### NOTIFICATIONS-ENGINE-TIMELINE-13: Several "both" regulars split to balance (rule 6; S12)
Given 2 left, 2 right and 3 {left, right} regulars and one either spot, when a left-sider says Yes, then
at `last_invite_at` 1 "both" regular plays left and 2 play right, and a later Yes gets const:KIND_SORRY.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P12-several-both-regulars]`

#### NOTIFICATIONS-ENGINE-TIMELINE-14: After last_invite_at nothing is sent but open invitations still place (rule 6; S21)
Given 3 left, 4 right and 1 {left, right} regular placed left, `last_invite_at` passed and one open right
invitation, when a right regular says No, then nothing new is sent and the open invitation's Yes takes
the spot.
test: `backend/padel_app/tests/invitation_scenarios/test_scenarios.py` › `test_scenario[P21-cancellation-after-last-invite]`

#### NOTIFICATIONS-ENGINE-TIMELINE-15: The first attendance request goes at attendance_request_at (rule 2)
Given a session and the coach's attendance-request setting, when runs happen before and at
`attendance_request_at`, then nothing is sent before it and each recipient gets one request at it.
test: `backend/padel_app/tests/test_invitation_engine_messages.py` › `test_the_first_request_goes_at_attendance_request_at_and_not_before`

#### NOTIFICATIONS-ENGINE-TIMELINE-16: Repeats go only to who has not answered, at most max sends (rule 2)
Given `every` and `max`, when some recipients answer after the first send, then each later send goes
only to who has not answered, never twice for one send, and none after the `max`-th.
test: `backend/padel_app/tests/test_invitation_engine_messages.py` › `test_repeats_go_every_interval_only_to_who_has_not_answered_and_stop_at_max`

#### NOTIFICATIONS-ENGINE-TIMELINE-17: The recipients are the students placed other than by accepting an invitation (rule 2)
Given going students placed as a regular, a returning regular, by automatic entry, by direct join and
by accepting an invitation, and an absent regular, when a send is due, then all but the acceptor and
the absent regular are asked.
test: `backend/padel_app/tests/test_invitation_engine_messages.py` › `test_automatic_entrants_and_direct_joiners_are_asked_and_invitation_acceptors_are_not`

#### NOTIFICATIONS-ENGINE-TIMELINE-18: A late run sends the latest send once (rule 2)
Given no run between two sends, when a run comes after the second, then each recipient gets one
request, for the second.
test: `backend/padel_app/tests/test_invitation_engine_messages.py` › `test_a_late_run_sends_the_latest_slot_once_not_the_missed_ones`

#### NOTIFICATIONS-ENGINE-TIMELINE-19: Quiet hours hold a request until they end (rule 2; D14)
Given a send that falls in quiet hours, when runs happen during and after them, then the request goes
at the first run after they end.
test: `backend/padel_app/tests/test_invitation_engine_messages.py` › `test_quiet_hours_hold_the_request_until_they_end`

### Waves
Cross-spec order: `notifications/_overview.md`, "Engine waves".
1. (W1) TIMELINE-2, TIMELINE-4 — `invitation_engine/timeline.py` (T at send), `invitation_engine/settings.py`
   (`Timing` gains `between_groups`; `inactivity` becomes `between_rounds`), `effects.Invited` and
   `snapshot.Invitation` (a counting-until field), `store.py`, `adapters/new.py` (`_timing` stops
   reporting `between_groups` as a gap). Shared-module changes, agreed with their owners.
2. (W4) TIMELINE-1, TIMELINE-5 — `invitation_engine/timeline.py` (quiet hours, counting).
3. (W7) TIMELINE-3, TIMELINE-6, TIMELINE-7 — `invitation_engine/absences.py`, scenario pins.
4. (W7) TIMELINE-8 to TIMELINE-14 — `invitation_engine/timeline.py` (`due` at `last_invite_at`, move
   history), `effects.SideAssigned`, `adapters/new.py` (`side_moved`).
5. (built, #946) TIMELINE-15 to TIMELINE-19 — `invitation_engine/messages.py`; the tests exist and gain
   their criterion tags with the next engine change.
6. (Swap, per coach at cutover) rule 2's hand-over — the store applies `AttendanceRequested` as the
   app's reminder message and `ReminderAttempt`, answers go to the engine (`ConfirmAttendance`, the
   regular's No by rule 5), and the coach's `reminder_lesson_*` jobs stop (`notifications.reminders`).

### Open questions
- Ruling (2) settled who moves.
- Who sends attendance requests after the swap (swap plan §3.1, "Reminders") — options: the app's
  reminder flow stays; the engine sends them (`messages.due`, #946). Decision (coordinator, owner away,
  PAD-912; the owner can reverse it): the engine, and the app's reminder jobs retire per coach at
  cutover, because the engine's requests already know who was placed how (an invitation acceptor is
  not asked) and run inside the engine's quiet hours, and two senders for one class would ask twice.
