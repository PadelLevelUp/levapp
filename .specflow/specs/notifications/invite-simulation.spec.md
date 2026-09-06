---
id: notifications.invite-simulation
status: draft
depends_on: [notifications.invitations, notifications.config, notifications.waiting-list, notifications.semi-auto-approval, eligibility.rules, eligibility.cascade, eligibility.enforcement, calendar.student-blockers, notifications.student-block-preferences, classes.instances]
implements: ../../specs-business/notifications/coach-understands-who-gets-invited.business.md
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

### Rules
1. `POST /api/app/notify/invite_simulation` with body `{lessonInstanceId, departingPlayerId}` runs
   the simulation. Coach-only via `require_coach()` — a student caller gets **403**
   (`settings.role-scope` rule 6). The instance must be one of the coach's (404 otherwise) and the
   departing player must be enrolled in it (400 otherwise). The response is camelCase (R-022).
2. `POST /api/app/notify/invite_simulation/explain` with body
   `{lessonInstanceId, departingPlayerId, playerId}` returns the verdict for **one** roster player:
   `{playerId, name, stage, details}`. Same authorization as rule 1; a `playerId` outside the
   coach's roster is a 404.
3. **No writes.** The simulation creates no `Vacancy` row, no `NotificationEvent`, no `Message`,
   no `ReplacementApprovalPrompt`, consumes no waiting-list credit and sends nothing. It also does
   **not** run the lazy deactivation of expired standing entries that `_check_waiting_list`
   performs on the real path: on this path an expired entry is skipped, not deactivated. The
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
   - `unavailable` — an availability blocker overlaps the class window
     (`calendar.student-blockers` rule 5)
   - `auto_invites_off` — the student switched automatic invitations off
     (`notifications.student-block-preferences`)
   - `no_round_matched` — passed everything above but matched no round; `details` carry the
     structured failures per round, from `_group_rule_failures`, in both vocabularies (invitation
     groups and legacy rounds)
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
   - `invitation_window` with `opensAt` (from `_compute_invite_start_dt`), blocked while now is
     before it
   - `quiet_hours` with `until` (next 07:00 club-local, `notifications.config` rule 6a)
   - `min_time_before_class` with `minutes`
   - `max_total_reached` with `sent` and `limit`
   A blocked gate means "nobody would be contacted right now". The queue is **still returned** so
   the coach sees who *would* be contacted once the gate clears. `evaluatedAt` (ISO 8601, UTC) is
   always included because the answer depends on the clock.
7. `approvalRequired` is `true` when `invitation_mode` is `semi_automatic`: the coach would first
   receive the approval prompt carrying this same list (rule 5 makes that literal, not
   approximate).
8. `waitingListPlacement` is `{playerId, name, standing}` when an active waiting-list entry for
   the class passes the bar and the unconditional guards (`notifications.waiting-list` rules
   4a–4c) — that student is placed directly and no invitation goes out for this spot — and `null`
   otherwise. When a placement is reported the queue is still returned, marked as what would
   happen if the placement did not go through.
9. `spot` is `{side, levelId, levelCode, levelSource}` snapshotted exactly as
   `notifications.invitations` rules 2 and 2a: side from the departing player; level from the
   departing player (`levelSource: "player"`), falling back to the class's effective level
   (`"class"`), else `null` with `"none"`.
10. `rounds` is `[{number, kind, label, rules, candidates}]` in engine order, where `kind` is
    `"group"` or `"legacy"`, `rules` is the round's structured criteria `[{attribute, operation,
    value}]` (an empty list means "everyone eligible"), and a player appears only in the **first**
    round that admits them, exactly as `compute_full_invite_queue` deduplicates.
11. Each candidate is `{playerId, name, levelCode, side, rank, priority, sendStatus}`. `rank` is
    1-based within the round. `priority` carries one entry per **enabled** priority criterion, in
    the coach's configured order, with the value the sort key actually used:
    `level: {ladderDistance}` (signed, negative = stronger than the spot),
    `attendance: {rate}`, `justifiedMisses: {rate}`, `playingSide: {match}` with `match` one of
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

#### The simulation invites exactly who the engine invites — unset bar
- **Given** a coach with `eligibility_rules` `NULL`, the default invitation groups, and a roster of
  six students at mixed levels and sides
- **And** a class instance with three enrolled players, one of them Alice (level `5`, side `left`)
- **When** a real vacancy is created for Alice's cancellation and the engine's full queue is
  computed with `compute_full_invite_queue`
- **And** the simulation is run for the same instance with `departingPlayerId` = Alice
- **Then** the ordered list of `playerId`s across the simulation's `rounds` equals the engine's
  queue, player for player and round for round

#### The simulation invites exactly who the engine invites — level bar
- **Given** the same roster with `eligibility_rules` `[{level, within_n_of_class, value: 1}]`
- **When** the engine queue and the simulation are computed for the same departing player
- **Then** the two ordered lists are identical
- **And** a student two ladder steps away is in neither

#### The simulation invites exactly who the engine invites — legacy rounds
- **Given** a coach whose `invitation_groups` is `NULL`, so the engine uses `get_rounds()`
- **When** the engine queue and the simulation are computed for the same departing player
- **Then** the two ordered lists are identical
- **And** every simulated round has `kind: "legacy"`

#### The simulation writes nothing
- **Given** a coach in semi-automatic mode with an active standing waiting-list entry whose
  `expires_at` is in the past, and a class with enrolled players
- **When** the simulation is run
- **Then** the row counts of `vacancies`, `notification_events`, `messages`,
  `replacement_approval_prompts`, `waiting_list_entries` and `standing_waiting_list_entries` are
  unchanged
- **And** the expired standing entry is still `is_active = true` (the lazy deactivation did not run)
- **And** no `credits_used` value changed

#### The missing player and the players still in the class are never candidates
- **Given** a class with enrolled players Alice, Bob and Carol
- **When** the simulation is run with `departingPlayerId` = Alice
- **Then** neither Alice, Bob nor Carol appears in any round
- **And** the explain verdict for Alice is `stage: "departing_player"`
- **And** the explain verdict for Bob is `stage: "already_enrolled"`

#### Quiet hours are reported on the club wall clock (PAD-136 style)
- **Given** a coach with `quietHours.enabled = true`
- **When** the simulation is run at **22:30 club-local in summer** (21:30 UTC)
- **Then** the `quiet_hours` gate is `blocked: true` with `until` at the next 07:00 club-local
- **And** the `rounds` are still returned with their candidates
- **And** at **07:30 club-local** the same gate is `blocked: false`

#### The invitation window is reported, not applied
- **Given** a coach whose `invitation_start_timing` opens invitations 2 hours before class
- **And** a class starting in 6 hours
- **When** the simulation is run
- **Then** the `invitation_window` gate is `blocked: true` with `opensAt` 4 hours from
  `evaluatedAt`
- **And** the `rounds` are still returned

#### Semi-automatic mode reports the approval step with the prompt's list
- **Given** a coach with `invitation_mode = "semi_automatic"`
- **When** the simulation is run
- **Then** `approvalRequired` is `true`
- **And** the ordered candidates equal what `compute_full_invite_queue` returns for a real vacancy
  of the same class and departing player

#### A waiting-list member who passes the bar is placed, not invited
- **Given** a coach with `eligibility_rules` `[{level, same_as_class}]`
- **And** a class at level `5` with an active waiting-list entry for Dora (level `5`) linked to a
  standing entry
- **When** the simulation is run
- **Then** `waitingListPlacement` is `{playerId: Dora, standing: true}`
- **And** Dora appears in no round

#### Explain names the eligibility rule, in PAD-133's records
- **Given** a coach with `eligibility_rules` `[{level, within_n_of_class, value: 1}]` and a
  ladder `4`, `5`, `5-`
- **And** a class at level `4` and a student Eve at level `5-`
- **When** the explain endpoint is called for Eve
- **Then** `stage` is `"eligibility"`
- **And** `details` contains one record with `attribute: "level"`,
  `operation: "within_n_of_class"`, `threshold: 1` and `ladder_distance: 2`

#### Explain reports an availability blocker
- **Given** a student Frank with an `unavailable` blocker overlapping the class window and no
  eligibility problem
- **When** the explain endpoint is called for Frank
- **Then** `stage` is `"unavailable"` and `details` is empty

#### Explain reports a switched-off student
- **Given** a student Gina who has blocked automatic class invitations
  (`notifications.student-block-preferences`) and no eligibility problem
- **When** the explain endpoint is called for Gina
- **Then** `stage` is `"auto_invites_off"`

#### Explain reports the position of an invited student
- **Given** a coach with `maxSimultaneous` enabled at 2 and a class whose simulation lists four
  candidates in round 1
- **When** the explain endpoint is called for the third candidate
- **Then** `stage` is `"invited"` with `details.roundNumber = 1`, `details.rank = 3` and
  `details.sendStatus = "queued"`
- **And** for the first candidate `details.sendStatus` is `"first_batch"`

#### Explain reports the daily quota
- **Given** a coach with `maxInvitesPerStudentPerDay` enabled at 1 and a student Hugo who was
  already sent one invitation today (club-local day)
- **And** Hugo is otherwise the first candidate of round 1
- **When** the simulation is run
- **Then** Hugo's `sendStatus` is `"daily_quota"` and he keeps `rank` 1

#### A student caller is refused
- **Given** an authenticated student
- **When** they call either endpoint
- **Then** the response status is exactly 403 and nothing is computed

### Notes
- Why the pipeline is shared rather than re-stated:
  `.cortex/atlas/decisions/2026-09-06-invite-simulation-shares-the-engine-pipeline.md`.
- `already_invited` is listed in rule 4 for completeness of the engine's order; the simulation
  never produces it.
- The `evaluatedAt`-dependent gates are the reason this is a dry run "as of now" and not a stable
  answer — the owner chose this on 2026-09-06 over a clock-independent structural view.
- OPEN: whether the tutorial should also expose the round *timing* (`maxInactiveTime`) as a gate
  entry. Left out of v1; `queued` covers the coach-facing meaning.
