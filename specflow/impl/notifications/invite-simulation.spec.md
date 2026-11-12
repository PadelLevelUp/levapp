---
id: notifications.invite-simulation
status: implemented
depends_on: [notifications.invitations, notifications.config, notifications.waiting-list, notifications.semi-auto-approval, eligibility.rules, eligibility.cascade, eligibility.enforcement, calendar.student-blockers, notifications.student-block-preferences, classes.instances]
serves: [P-NOTIFICATIONS-4]
governed_by: [R-002, R-005, R-022, R-023]
---

# notifications.invite-simulation


### Intent
A read-only dry run of the invitation engine for a **hypothetical vacancy**, evaluated as if the
spot opened right now. It is the data source for the "Understand invites" tutorial
(`settings.tutorials`) and it must be produced by the same code path the real engine uses, so
that what the tutorial shows and what the engine does can never disagree.

### Entities
- **READS:** LessonInstance, Lesson, Association_CoachPlayer, Association_PlayerLessonInstance,
  Presence, NotificationConfig, NotificationEvent (for the per-class total and per-student daily
  counts only), WaitingListEntry, StandingWaitingListEntry, CalendarBlock (availability
  blockers), the student notification preferences.
- **WRITES:** nothing. See rule 3.
- **CREATES:** nothing persistent. The hypothetical **Vacancy** is an unsaved in-memory object.

### Rules for a session on the new engine (PAD-913)
Which engine runs a session is `notifications.config` rule 18. **For an old-engine session every rule
below holds as written.** For a session on the new engine (the swap, PAD-912; swap
plan §4) the items in the table are replaced and the readings below
hold; the rest hold unchanged. Not marked inline: this section is the one place. When every coach is
drained, the old engine is deleted and the replaced items go with it.

| Item | For a new-engine session | Source |
|---|---|---|
| Entities: the unsaved `Vacancy` | no vacancy: the caller builds a hypothetical snapshot without writing ("this student drops out") | `notifications.engine-tiers` rule 12 |
| Rule 2 (explain) | one verdict per student per open spot type | `notifications.engine-tiers` rule 12 |
| Rule 4 (stages) | the stages are rule 12's (`in_session`, `said_no`, `removed_by_coach`, `not_in_pool`, `busy_same_time`, `postponed`, `failed_eligibility`, `failed_tier_rule`, `invited_before`, `invited`, `invited_for_other_type`, `invited_earlier`, `waiting`), preceded by the stages of the gates the app applies before the snapshot (exclusions, inactive accounts, eligibility per swap decision 6), which the caller explains; `already_invited` is `invited_earlier` | `notifications.engine-tiers` rule 12 |
| Rule 5 (one pipeline) | the simulation runs the engine's evaluator, never a copy | `notifications.engine-tiers` rule 11, TIERS-9 |
| Rule 6, `max_total_reached` | no such gate: the new engine does not read `maxTotal` | swap decision 3 (owner) |
| Rule 6, the window and quiet hours | the dry run's "may plan now"; `min_time_before_class` is `last_invite_before` | `notifications.engine-tiers` rule 12; `notifications.config` rule 19 |
| Rule 8 (group 0) | two waiting lists, the coach's first; with automatic entry on, a member can be placed rather than invited | `notifications.engine-tiers` rules 4–6; `notifications.engine-settings` rule 3 |
| Rule 9 (the spot's side and level) | from the session's counts and the class's level, never the leaver's | `notifications.engine-spots` rules 6–8 |
| Rules 10, 11, 13 (rounds, first batch, queued, daily quota) | queues per spot type by tier, then by rule 8's ordering; X per covered spot and M instead of batches; a capped student is `postponed` | `notifications.engine-planning` rules 5, 6, 8; `notifications.engine-tiers` rules 8, 10 |
| Criteria 1, 3, 5, 8, 9, 13, 14, 18 | replaced with their rules; new criteria are written at swap step 7 (criterion 8's against `planner.evaluate`'s queues) | — |

Readings:
- Intent, rules 1 and 3: unchanged in purpose; "the engine" is the session's engine (`notifications.config` rule 18).
- Rule 6's class switches (`auto_invites`, `notifications_enabled`) are the store's listing (`notifications.config` rule 19).
- Eligibility: an app session's bar is applied in `pool`, so a student below it is `not_in_pool`, and the simulation explains it from the caller's own pool gates (`failed_eligibility` arises only where the engine's bar is not open).
- Rule 7 and criterion 8 (semi-automatic; owner ruling D2): `approvalRequired` reads the carried `invitation_mode` (`notifications.config` rule 19) as today; the list the coach approves is the dry run's queue per spot type (`notifications.engine-planning` rule 14), the same evaluator, so the request and the simulation agree.

Not yet specified, needed before this spec's swap step (each under Open questions):
- the wire shape of a per-type verdict and its client rendering (web and iOS, the tutorial's payload, `settings.tutorials`).

### Rules
1. `POST /api/app/notify/invite_simulation` with body `{model, originalId, date, departingPlayerId}`
   runs the simulation. `model`/`originalId`/`date` address the class exactly as
   `eligibility_check` does and resolve through `get_or_materialize_instance` (R-001) — the only
   sanctioned way to reach a virtual occurrence. Coach-only via the blueprint's coach check — a
   student caller gets **403** (`settings.role-scope` rule 6). The instance must be one of the
   coach's (404 otherwise) and the departing player must be enrolled in it (400 otherwise). The
   response is camelCase (R-022).
2. `POST /api/app/notify/invite_simulation/explain` with body
   `{model, originalId, date, departingPlayerId, playerId}` returns the verdict for **one** roster player:
   `{playerId, name, stage, details}`. Same authorization as rule 1; a `playerId` outside the
   coach's roster is a 404.
3. **No writes.** The simulation creates no `Vacancy` row, no `NotificationEvent`, no `Message`,
   no `ReplacementApprovalPrompt`, consumes no waiting-list credit and sends nothing. It also does
   **not** run the lazy deactivation of expired standing entries that the waiting-list candidate
   list performs on the real path: on this path an expired entry is skipped, not deactivated. The
   hypothetical vacancy is an unsaved in-memory `Vacancy` whose `id` is `None`, and every query
   keyed on `vacancy_id` must treat a `None` id as "no events" rather than letting SQLAlchemy match
   the NULL-vacancy rows that manual notifications leave behind.
4. **One pipeline, stage-tagged.** `get_eligible_students` and `_get_eligible_students_for_group`
   become thin wrappers over one shared candidate pipeline that evaluates **every** roster player
   and tags each with the **first** stage that dropped them, in the engine's existing order:
   - `departing_player` — the player being simulated as missing
   - `already_enrolled` — holds an enrolment association for this instance
   - `eligibility` — fails the effective bar (`eligibility.cascade`); `details` are the PAD-133
     structured failure records from `eligibility_failures`
   - `excluded_by_coach` — `restrictions.excludedPlayers`
   - `inactive_account` — `restrictions.excludeUnpaidSubscription` (reads `users.status`, which is
     account activation, not payment — `notifications.config` rule 7c)
   - `has_class_same_day` — `restrictions.noSameDayClass`: holds a spot in another class that
     club-local day (`notifications.config` rule 6e, PAD-523)
   - `unavailable` — an availability blocker overlaps the class window
     (`calendar.student-blockers` rule 5)
   - `auto_invites_off` — the student switched automatic invitations off
     (`notifications.student-block-preferences`)
   - `no_round_matched` — passed everything above but matched no round; `details` carry the
     structured failures per round, from `_group_rule_failures` (invitation groups only — the
     legacy rounds vocabulary was removed by PAD-279)
   - `invited` — survives, with the round that admits them
   The engine keeps the survivors; the simulation keeps everything. The two existing functions
   keep their signatures and return values, so every existing invitation test passes untouched.
   The existing `already_invited` exclusion (an active invitation for the same vacancy) stays in
   the pipeline for the engine and is unreachable in the simulation, because a hypothetical vacancy
   has no events.
5. **The agreement invariant is load-bearing.** For any config, bar and roster, the set of players
   the real engine invites for a real vacancy (across all rounds) equals the set the simulation
   tags `invited` for the same class and departing player, in the same order. This is the same
   principle `eligibility.enforcement` rule 7b applies to the bar, and the same test shape as
   `test_failures_and_bool_never_disagree`. `compute_full_invite_queue`
   (`notifications.semi-auto-approval`) is rewritten to read from the same pipeline output, so the
   approval prompt and the tutorial are one list.
6. **Right-now gates are reported, never silently applied.** The response carries
   `gates: [{code, blocked, ...}]` for every gate the engine checks before sending, each with the
   data a client needs to say when it clears:
   - `auto_notify_disabled`
   - `class_notifications_disabled` (`notifications.toggle-class`)
   - `class_over`
   - `invitation_window` with `opensAt` (from `_compute_invite_start_dt`: a naive UTC instant the
     client formats in `Europe/Lisbon`, `notifications.invitations` rule 11), blocked while now is
     before it
   - `quiet_hours` with `until` (the end of the coach's quiet window, club-local, `notifications.config`
     rule 6a) and, while blocked, `untilAt` (that end as a UTC instant)
   - `class_auto_invites_off` for a client that declares `class-type-defaults`
     (`notifications.toggle-class`, NOTIFICATIONS-TOGGLE-CLASS-10)
   - `min_time_before_class` with `minutes`
   - `max_total_reached` with `sent` and `limit`
   A blocked gate means "nobody would be contacted right now". The queue is **still returned** so
   the coach sees who *would* be contacted once the gate clears. `evaluatedAt` (ISO 8601, UTC) is
   always included because the answer depends on the clock.
7. `approvalRequired` is `true` when `invitation_mode` is `semi_automatic`: the coach would first
   receive the approval prompt carrying this same list (rule 5 makes that literal, not
   approximate).
8. **Group 0, the waiting list (PAD-446).** `waitingList` is the ordered list
   `[{playerId, name, standing, joinedAt}]` of the class's waiting-list students the engine would
   ask first (`notifications.invitations` rule 8a), in its order (join time) and under the same
   rules (`notifications.waiting-list` rules 4–4c), `[]` when there are none. Those students appear in
   no round: the engine asks them in group 0 and their offer keeps them out of later rounds. The
   agreement invariant of rule 5 covers `waitingList` followed by the rounds. `waitingListPlacement`
   stays in the response, always `null`: older builds read it, and showing nothing there is
   honest, where showing a placement would not be.
9. `spot` is `{side, levelId, levelCode, levelSource, sideCounts}` snapshotted exactly as
   `notifications.invitations` rules 2 and 2a: side as `notifications.invitations` rule 2c would choose it for the departing player (PAD-541: the side the class is short of, a tie keeping theirs); `sideCounts` is `{left, right, leaverSide, chosen, going, open}` — the numbers rule 2c used (the players going minus the departing player, plus the class's other open freed spots; never-filled spots are not counted, PAD-565), the departing player's own side and the side chosen (equal to `side`), and the two parts of `left`/`right` (PAD-825): `going` `{left, right}` is the players going without the departing player, `open` `{left, right}` the class's other open freed spots on their reserved side, so `left = going.left + open.left` and `right = going.right + open.right`, or `null` when the coach's roster has no `left`/`right` player — so a tutorial explains the choice with the engine's numbers and never recounts them; level from the
   departing player (`levelSource: "player"`), falling back to the class's effective level
   (`"class"`), else `null` with `"none"`.
10. `rounds` is `[{number, kind, label, rules, candidates}]` in engine order, where `kind` is
    `"group"` or `"legacy"`, `rules` is the round's structured criteria `[{attribute, operation,
    value}]` (an empty list means "everyone eligible"), and a player appears only in the **first**
    round that admits them, exactly as `compute_full_invite_queue` deduplicates.
11. Each candidate is `{playerId, name, levelCode, side, rank, priority, sendStatus}`. `rank` is
    1-based within the round. `priority` is an **ordered list** with one entry `{id, …}` per
    **enabled** priority criterion, in the coach's configured order (a list, not an object, so the
    client renders values in the order the engine sorted by), carrying the value the sort key
    actually used:
    `level: {ladderDistance}` (signed, negative = stronger than the spot),
    `attendance: {rate}`, `justifiedMisses: {owed, rate}` (`owed` = classes owed, `attendance.stats` rule 3, the value sorted on since PAD-505; `rate` stays for clients released before PAD-505, and a client shows `owed` whenever it is present), `playingSide: {match}` with `match` one of
    `"exact" | "both" | "other"`, `subscriptionStatus: {active}`. `sendStatus` is:
    - `first_batch` — within `restrictions.maxSimultaneous` (and within the remaining `maxTotal`
      budget) in the first non-empty round
    - `queued` — contacted only when an earlier invitation expires or is declined, or a later round
      opens
    - `daily_quota` — skipped today by `maxInvitesPerStudentPerDay`, counted over the club-local
      day (`notifications.config` rule 6b)
12. **Structured codes, never prose** (`eligibility.enforcement` rule 7a). Every `stage`, gate
    `code`, failure record and priority value is data; each client renders it in the user's
    locale. The backend emits no sentences.
13. The explain verdict (rule 2) for a player who **is** invited returns `stage: "invited"` with
    `details: {roundNumber, rank, sendStatus}`. For any other stage `details` carries that stage's
    structured failures: the PAD-133 records for `eligibility`, the per-round records for
    `no_round_matched`, and an empty object for the boolean stages.

### Acceptance Criteria

#### NOTIFICATIONS-INVITE-SIMULATION-1: The simulation invites exactly who the engine invites — unset bar
- **Given** a coach with `eligibility_rules` `NULL`, the default invitation groups, and a roster of
  six students at mixed levels and sides
- **And** a class instance with three enrolled players, one of them Alice (level `5`, side `left`)
- **When** a real vacancy is created for Alice's cancellation and the engine's full queue is
  computed with `compute_full_invite_queue`
- **And** the simulation is run for the same instance with `departingPlayerId` = Alice
- **Then** the ordered list of `playerId`s across the simulation's `rounds` equals the engine's
  queue, player for player and round for round

#### NOTIFICATIONS-INVITE-SIMULATION-2: The simulation invites exactly who the engine invites — level bar
- **Given** the same roster with `eligibility_rules` `[{level, within_n_of_class, value: 1}]`
- **When** the engine queue and the simulation are computed for the same departing player
- **Then** the two ordered lists are identical
- **And** a student two ladder steps away is in neither

#### NOTIFICATIONS-INVITE-SIMULATION-3: The simulation invites exactly who the engine invites — empty groups (PAD-279)
- **Given** a coach whose `invitation_groups` is `[]`
- **When** the simulation runs
- **Then** its rounds are the three built-in groups, every round has `kind: "group"`, and the queue and first batch match the engine's

#### NOTIFICATIONS-INVITE-SIMULATION-4: The simulation writes nothing
- **Given** a coach in semi-automatic mode with an active standing waiting-list entry whose
  `expires_at` is in the past, and a class with enrolled players
- **When** the simulation is run
- **Then** the row counts of `vacancies`, `notification_events`, `messages`,
  `replacement_approval_prompts`, `waiting_list_entries` and `standing_waiting_list_entries` are
  unchanged
- **And** the expired standing entry is still `is_active = true` (the lazy deactivation did not run)
- **And** no `credits_used` value changed

#### NOTIFICATIONS-INVITE-SIMULATION-5: The missing player and the players still in the class are never candidates
- **Given** a class with enrolled players Alice, Bob and Carol
- **When** the simulation is run with `departingPlayerId` = Alice
- **Then** neither Alice, Bob nor Carol appears in any round
- **And** the explain verdict for Alice is `stage: "departing_player"`
- **And** the explain verdict for Bob is `stage: "already_enrolled"`

#### NOTIFICATIONS-INVITE-SIMULATION-6: Quiet hours are reported on the club wall clock (PAD-136 style)
- **Given** a coach with `quietHours.enabled = true`
- **When** the simulation is run at **22:30 club-local in summer** (21:30 UTC)
- **Then** the `quiet_hours` gate is `blocked: true` with `until` at the end of the coach's window (07:00 by default)
- **And** the `rounds` are still returned with their candidates
- **And** at **07:30 club-local** the same gate is `blocked: false`

#### NOTIFICATIONS-INVITE-SIMULATION-7: The invitation window is reported, not applied
- **Given** a coach whose `invitation_start_timing` opens invitations 2 hours before class
- **And** a class starting in 6 hours
- **When** the simulation is run
- **Then** the `invitation_window` gate is `blocked: true` with `opensAt` 4 hours from
  `evaluatedAt`
- **And** the `rounds` are still returned

#### NOTIFICATIONS-INVITE-SIMULATION-8: Semi-automatic mode reports the approval step with the prompt's list
- **Given** a coach with `invitation_mode = "semi_automatic"`
- **When** the simulation is run
- **Then** `approvalRequired` is `true`
- **And** the ordered candidates equal what `compute_full_invite_queue` returns for a real vacancy
  of the same class and departing player

#### NOTIFICATIONS-INVITE-SIMULATION-9: A waiting-list member who passes the bar is asked first (PAD-446)
- **Given** a coach with `eligibility_rules` `[{level, same_as_class}]`
- **And** a class at level `5` with an active waiting-list entry for Dora (level `5`) linked to a
  standing entry, and one for Eva (level `5`, her own entry) who joined earlier
- **When** the simulation is run
- **Then** `waitingList` is `[Eva, Dora]` with `standing` false and true
- **And** neither appears in any round, and `waitingListPlacement` is `null`

#### NOTIFICATIONS-INVITE-SIMULATION-10: Explain names the eligibility rule, in PAD-133's records
- **Given** a coach with `eligibility_rules` `[{level, within_n_of_class, value: 1}]` and a
  ladder `4`, `5`, `5-`
- **And** a class at level `4` and a student Eve at level `5-`
- **When** the explain endpoint is called for Eve
- **Then** `stage` is `"eligibility"`
- **And** `details` contains one record with `attribute: "level"`,
  `operation: "within_n_of_class"`, `threshold: 1` and `ladder_distance: 2`

#### NOTIFICATIONS-INVITE-SIMULATION-11: Explain reports an availability blocker
- **Given** a student Frank with an `unavailable` blocker overlapping the class window and no
  eligibility problem
- **When** the explain endpoint is called for Frank
- **Then** `stage` is `"unavailable"` and `details` is empty

#### NOTIFICATIONS-INVITE-SIMULATION-12: Explain reports a switched-off student
- **Given** a student Gina who has blocked automatic class invitations
  (`notifications.student-block-preferences`) and no eligibility problem
- **When** the explain endpoint is called for Gina
- **Then** `stage` is `"auto_invites_off"`

#### NOTIFICATIONS-INVITE-SIMULATION-13: Explain reports the position of an invited student
- **Given** a coach with `maxSimultaneous` enabled at 2 and a class whose simulation lists four
  candidates in round 1
- **When** the explain endpoint is called for the third candidate
- **Then** `stage` is `"invited"` with `details.roundNumber = 1`, `details.rank = 3` and
  `details.sendStatus = "queued"`
- **And** for the first candidate `details.sendStatus` is `"first_batch"`

#### NOTIFICATIONS-INVITE-SIMULATION-14: Explain reports the daily quota
- **Given** a coach with `maxInvitesPerStudentPerDay` enabled at 1 and a student Hugo who was
  already sent one invitation today (club-local day)
- **And** Hugo is otherwise the first candidate of round 1
- **When** the simulation is run
- **Then** Hugo's `sendStatus` is `"daily_quota"` and he keeps `rank` 1

#### NOTIFICATIONS-INVITE-SIMULATION-15: The make-up tiebreaker shows classes owed, as a count (rule 11, PAD-505)
- **Given** Ana owes 2 classes (20 % justified misses) and Bruno 1 (50 %), with only the `justified_misses` tiebreaker on
- **When** the coach simulates a vacancy
- **Then** Ana is listed before Bruno, Ana's priority entry is `{id: "justified_misses", owed: 2, rate: 0.2}`, and the tutorial reads "2 aulas por repor", not "faltas justificadas 20%"
- **And** an entry from a server before PAD-505, with only `rate`, still reads "faltas justificadas 33%"

#### NOTIFICATIONS-INVITE-SIMULATION-16: A student caller is refused
- **Given** an authenticated student
- **When** they call either endpoint
- **Then** the response status is exactly 403 and nothing is computed

#### NOTIFICATIONS-INVITE-SIMULATION-17: The simulation is asked for a class and a player who is in it (rules 1, 2)
- **Given** a class with Alice enrolled and Jo on the roster, not enrolled
- **When** the coach asks what happens if Alice leaves
- **Then** the answer is 200 with the spot's side, level and where the level came from, the candidates, the gates and the time it was evaluated, and Jo is among the candidates
- **And** asking why Jo would be invited answers the stage `invited`
- **And** naming Jo, who is not in the class, as the one leaving answers 400
test: `backend/padel_app/tests/test_pad196_invite_simulation.py` › `test_routes_happy_path`

#### NOTIFICATIONS-INVITE-SIMULATION-18: The spot's side is the side the engine would choose, with the counts behind it (rule 9)
- **Given** a class with six left and three right players, and a left player leaving
- **When** the simulation runs
- **Then** the spot's side is right: the leaver is counted out although still in the class, and a tie keeps the leaver's side
- **And** `sideCounts` carries the two totals, the leaver's side, the chosen side, and each total split into players going and open spots; spots that were never filled are left out
- **And** the spot the engine then creates for that player has the side the simulation chose
test: `backend/padel_app/tests/test_pad541_freed_spot_balances_sides.py` › `test_the_simulation_shows_the_side_the_engine_would_choose` (+4 more)

### Notes
- Why the pipeline is shared rather than re-stated:
  `.cortex/atlas/decisions/2026-09-06-invite-simulation-shares-the-engine-pipeline.md`.
- `already_invited` is listed in rule 4 for completeness of the engine's order; the simulation
  never produces it.
- The `evaluatedAt`-dependent gates are the reason this is a dry run "as of now" and not a stable
  answer — the owner chose this on 2026-09-06 over a clock-independent structural view.
- OPEN: whether the tutorial should also expose the round *timing* (`maxInactiveTime`) as a gate
  entry. Left out of v1; `queued` covers the coach-facing meaning.

### Open questions
- The explain payload for a new-engine session (plan §4, §6.3 item 5) — open until swap step 7, which writes it with `settings.tutorials`; decision (S, owner away, PAD-913; the owner can reverse it): one entry per student per open spot type, rule 12's stage and tier, so the simulation states exactly what the engine would do.
- `departing_player` and the `unavailable` blocker on a new-engine session — the leaver is simply in no session snapshot as going; whether the blocker is a pool gate is for H's store (PAD-916) to state.
