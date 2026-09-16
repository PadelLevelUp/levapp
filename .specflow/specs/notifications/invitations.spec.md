---
id: notifications.invitations
status: implemented
depends_on: [notifications.config, notifications.reminders, eligibility.rules]
implements: ../../specs-business/notifications/coach-fills-vacancies-automatically.business.md
governed_by: []
---

# notifications.invitations


### Intent
When a spot opens in a class (player drops out), the invitation engine invites students through
multi-round matching. The rounds are an **ordering** — who gets asked first — inside the floor set by
`eligibility.rules`. They decide priority; they never decide permission.

### Entities
- **Vacancy** (`vacancies`): lesson_instance_id, coach_id, original_player_id, side, level_id, status (open|filled|expired), approval_status (not_required|pending|approved|dismissed), current_round_number, current_batch_number, filled_by_player_id, last_activity_at, filled_at (rule 13: closed by `enrol()` and by the tick whenever capacity no longer supports it) — indexed on (lesson_instance_id, status), plus a partial index on status WHERE status = 'open' for the engine's open-vacancy sweep
- **NotificationEvent** (`notification_events`): coach_id, lesson_instance_id, player_id, message_id, vacancy_id, type (manual|auto), round_number, status (sent|confirmed|expired|queued) — indexed on (vacancy_id, status), (lesson_instance_id, status), (coach_id, created_at) and (player_id, coach_id)

### Rules
1. `trigger_invitations(instance, coach_id)` creates a Vacancy and starts matching. In automatic mode the vacancy gets approval_status "not_required" and sending proceeds as below; in semi-automatic mode it gets approval_status "pending" and no invitations are sent until the coach approves (see notifications.semi-auto-approval)
2. Vacancy snapshots the departing player's side and level for matching (the snapshotted side may be `left`, `right`, or `both`; structural vacancies with no departing player have side `null`)
2a. The **effective level** of a class is resolved with a single rule used everywhere in the engine
   (vacancy creation, eligibility, invitation-group previews, and the `{level}` message
   placeholder): `lesson_instance.level_id`, falling back to `lesson.default_level_id` when the
   instance carries no level of its own. A structural vacancy (no departing player) snapshots the
   class's effective level; a vacancy created from a departing player snapshots that player's
   level, falling back to the class's effective level when the player has none.
3. Multi-round matching based on `invitation_groups` config:
   - Round 1: Exact match (same level + same side)
   - Round 2: Same level only
   - Round 3: Open to all eligible
3a. **(pending PAD-128) Every round is capped at the eligibility bar.** Candidate selection applies, in this order:
   `effective_eligibility()` for the class (`eligibility.cascade`) → the current round's
   `invitation_groups` criteria → `restrictions` → the priority criteria and tiebreakers that rank
   what survives. The widest round therefore means "everyone **eligible**", never "everyone". The
   widening behaviour itself is unchanged: rounds still open up in the same order, at the same
   timings, and a spot still reaches progressively more students — it simply stops at the floor.
3b. **(pending PAD-128) Round criteria and eligibility parameters are different sets and stay different.** Playing side
   is a round criterion (rules 4a/4b) and is deliberately **not** an eligibility parameter
   (`eligibility.rules` rule 4). Removing side from the bar must not remove it from the rounds:
   `both`-side handling and its acceptance criteria below are unaffected by this work.
3c. **An empty round never cascades (PAD-87).** When the current group/round yields no
   eligible candidate, the engine advances the round counter and **stops** — it does not send
   the next round in the same call. The next round goes out on the next
   `process_invitation_batches()` tick (rule 5, every 2 minutes), one round per tick, so eight
   groups of which the first seven are empty reach the eighth after seven ticks, never all at
   once. `maxInactiveTime` is not applied to an empty round: that timer waits for invited
   students to answer, and an empty round invited nobody. When the counter passes the last
   group the vacancy expires, as before. Decision recorded in the PR: the engine tick is the
   spacing, because waiting the full inactivity timeout (120 min by default) per empty group
   could push a vacancy past the class start with nobody ever invited.
4. Within each round, players sorted by tiebreaker criteria (attendance, level, etc.)
4a. Side eligibility with "both" (eligibility is symmetric and inclusive):
   - A `both` player is eligible for a vacancy of ANY side (`left`, `right`, or `both`).
   - A `left`/`right` player is eligible for a `both` vacancy (a both-side vacancy accepts any player).
   - A `null`-side vacancy accepts any player (no side constraint).
   - Formally, a candidate passes a "same side" criterion when: `vacancy.side is None` OR `cp.side == vacancy.side` OR `cp.side == "both"` OR `vacancy.side == "both"`.
4b. Exact-side preference: the "same side" criterion admits `both` players, but within a round the playing-side tiebreaker PREFERS an exact-side match first, then falls back to `both` players, then any remaining. So for a `left` vacancy, `left` candidates rank ahead of `both` candidates, which rank ahead of `right` candidates (if a later, looser round admits them).
4c. Level rules are evaluated against the coach's **level ladder position**, never against the
   raw `display_order` integer. The ladder is the coach's levels ordered by the convention in
   levels.coach-levels rule 3 (lower `display_order` = stronger; unset order sorts last). Given
   the ladder as a 0-indexed list where index 0 is the strongest level:
   - `same_as_vacancy` — candidate level == vacancy level
   - `one_above_vacancy` — candidate sits at exactly `index(vacancy) - 1` (empty when the vacancy
     is already the strongest level)
   - `one_below_vacancy` — candidate sits at exactly `index(vacancy) + 1` (empty when the vacancy
     is already the weakest level)
   - `all_above_vacancy` / `all_below_vacancy` — candidate index is strictly smaller / larger
   Because adjacency is positional, a level that is two or more steps away in the coach's ladder
   can never satisfy a "one level above/below" rule, regardless of what integers the levels
   happen to carry. A candidate whose level is not in the coach's ladder never passes a level rule.
4d. Level rules fail **closed**. When a vacancy has no effective level at all (neither the
   instance nor its parent lesson defines one), every level rule in an invitation group evaluates
   to "no candidate passes" — a level-only group invites nobody. A missing level is never read as
   "the level filter is switched off", which would silently widen a level-restricted group to the
   coach's entire roster. (The legacy `rounds` vocabulary was removed by PAD-279; an empty
   `invitation_groups` list resolves to the built-in groups — `notifications.config` rule 12.)
5. `process_invitation_batches()` runs every 2 minutes (IntervalTrigger). The manual trigger
   `POST /api/app/notify/process_rounds` is **superadmin-only** (PAD-258): any JWT holder used to
   be able to run the batch processor concurrently with the scheduler.
   Details:
   - Skips vacancies with approval_status "pending" or "dismissed"
   - Sends batched invitations (maxSimultaneous at a time)
   - Respects restrictions (quiet hours, max per student per day, etc.)
   - Expires unanswered invitations after maxInactiveTime
6. Player responds: `POST /api/app/notification/{event_id}/respond` with yes/no
7. If confirmed: Vacancy.status = "filled", player added to instance
8. If all decline or expire: moves to next round. A player invited for a vacancy in a round is
   not invited for it again in that round, whatever they answered: a decline, a timeout and a
   still-open invitation all count. The next round applies its own criteria (B-056).
9. Coach can manually record response: `POST /api/app/notification/{event_id}/coach_respond`
10. **One winner per vacancy (PAD-261).** A "yes" takes a row lock (`SELECT … FOR UPDATE`) on the
    vacancy and then the class instance, re-reads both — the vacancy's state and the class's filled
    spots, never copies loaded earlier in the request — and only then enrols. PAD-68's "class is over" check runs again on the re-read class, so an answer that
    waited on the lock past the start (or across a move to start now) is expired exactly as the early
    check expires it. A second "yes" for the
    same last spot waits on the lock, finds the spot taken and gets the normal spot-filled answer and
    waiting-list offer. The lock lasts until the enrolment commits. Vacancies are created only under
    the class lock: a departing player has at most one open vacancy (a found one is returned without
    a lock; a new one is created after looking again under the lock), and structural vacancies are
    counted again under the same lock and added in one commit. Every locked section ends in a
    commit, so no lock outlives the decision it protects. The partial unique key on open vacancies
    is deferred to the B-046 cleanup plan (duplicates on the staging copy of prod first).
11. **When the invitation window opens (PAD-256).** `invitation_start_timing` is computed exactly
    like a reminder (`notifications.reminders` rule 15):
    - `hours_before` counts real hours before the class's real start;
    - `days_before` takes the class's own date at HH:MM on the club's clock.

    The result is a UTC instant. `Vacancy.invite_not_before` stores it as naive UTC, because it
    is a moment the server computes (R-023), and every gate compares it with UTC now.
    `minTimeBeforeClass` counts real minutes to the class's real start.

12. **A wave costs a bounded number of statements, whatever the roster size (PAD-276, audit M17).**
   `evaluate_candidates` reads the roster once (player and user eager-loaded), asks for the
   roster's availability blockers in one `calendar_blocks` query
   (`blocked_user_ids_for_window`) and the ranking asks for every survivor's attendance in
   one `presences` query (`_attendance_stats_for`). Per-candidate work is in-memory; a
   300-student roster evaluates in ~13 statements, not ~900. The verdicts and the ranking
   are exactly those of the per-player functions (`user_is_blocked_for_window`,
   `_attendance_stats`), which delegate to the batched ones. Measured and reproducible with
   `backend/scripts/notification_cost_probe.py`; the send path (~30 statements and 6
   commits per invitation sent) and the blocking push calls are recorded in the
   2026-09-11 notification-engine-cost decision, not changed here.

13. **Vacancies follow capacity (PAD-271, audit M4; number self-assigned by Session H on
   2026-09-11, unconfirmed).** A `Vacancy` is a promise that a spot is open; capacity
   (`LessonInstance.effective_filled_spots`, `calendar.view` rule 9) is the truth it follows.
   - **Every enrolment closes a vacancy.** `enrol()` (`classes.instance-enrollment` rule 4) is
     the one place a spot gets taken, so after it writes the row it reconciles the instance:
     while the instance has more open vacancies than open spots, one open vacancy is marked
     `filled` — the departing player's own if the enrolled player is that player, else a vacancy
     with no live invitation, else the oldest — with `filled_by_player_id` set to the enrolled
     player and `filled_at` to now, and its `sent` invitations expire with their messages retired
     (rule 7's fill message is not re-sent; the fill paths that already marked their own vacancy
     find nothing left to close).
   - **The tick reconciles too.** `process_invitation_batches()` runs the same reconciliation
     on every open vacancy's instance before it sends anything, so a coach edit, an import or a
     raw write that never called `enrol()` cannot leave the engine inviting for a full class.
     A dismissed vacancy stays open (`notifications.semi-auto-approval` rule 7) until the class
     is full or over, and then closes like any other.
   - A vacancy on a started, cancelled or completed class expires (rule 5 today, unchanged).
   - Reconciliation never opens a vacancy: a spot that frees up still opens one only through the
     decline, cancellation and structural paths.

15. **A vacancy is closed in exactly one place, and closing retires every live invitation
    (PAD-317, ledger B-081; numbered 15 because 14 is taken by PAD-303 on PR #228, which is
    open and merges first).** `_close_vacancy` is the only writer of `Vacancy.status =
    "filled"`: it stamps `filled_by_player_id` and `filled_at`, expires every
    `NotificationEvent` for that vacancy whose status is still non-terminal —
    `LIVE_INVITATION_STATES`, today `sent` and `queued` — and retires each one's invitation
    message so its Yes/No buttons stop rendering. All five closing paths go through it: the
    student accept, the coach accept on the student's behalf, the waiting-list placement, the
    accepted join request, and capacity reconciliation (rule 13). `except_event_id` spares the
    winner's own invitation, which its caller marks `confirmed`. The routine returns the events
    it retired, because a caller that still has to tell those candidates cannot find them again
    afterwards — a query for live invitations returns nothing once they are expired.
    **Retiring is not the same as telling.** The two accept paths and the join-request accept
    send the other candidates the `spot_filled` message; the waiting-list placement and
    reconciliation retire silently, as they always have. Whether a candidate should be told
    their seat went is a product question, deliberately left open here.

### Acceptance Criteria

#### A coach add closes the open vacancy (rule 13)
- **Given** instance 10 with `max_players=2`, Alice enrolled, Bob declined (his vacancy open with
  one invitation `sent` to Carol)
- **When** the coach adds Dave to instance 10
- **Then** Bob's vacancy is `filled` with `filled_by_player_id` = Dave, Carol's invitation is
  `expired` and her message retired, and no batch is sent for that vacancy on the next tick

#### The tick closes a vacancy the engine would otherwise keep inviting for (rule 13)
- **Given** instance 10 full (2/2 presences, none absent) and an open structural vacancy that
  nothing has closed
- **When** `process_invitation_batches()` runs
- **Then** the vacancy is `filled` (`filled_by_player_id` null) and no invitation is sent

#### Only as many vacancies close as spots were taken (rule 13)
- **Given** instance 10 with `max_players=3`, Alice enrolled, and two open structural vacancies
  (as many as its open spots)
- **When** the coach adds Bob
- **Then** exactly one vacancy is `filled` and one stays `open`

#### A dismissed vacancy closes only when the class is full (rule 13)
- **Given** instance 10 with `max_players=2`, Alice enrolled and Bob's vacancy `open` with
  `approval_status=dismissed`
- **When** the tick runs
- **Then** the vacancy stays `open`
- **And** when the coach adds Carol, it is `filled` with `approval_status` still `dismissed`

#### Empty invitation groups advance one round per tick (PAD-87)
- **Given** a coach with eight invitation groups, the first seven matching nobody on the roster and the eighth open to everyone
- **When** a vacancy is triggered
- **Then** no invitation is sent in that call and the vacancy sits at round 2 with `last_activity_at` set
- **And** each subsequent `process_invitation_batches()` tick advances exactly one round
- **And** the seventh tick sends the eighth group's invitations, with no invitation ever sent for rounds 1–7
- **And** with all eight groups empty, the eighth tick expires the vacancy and nobody was invited

#### Trigger invitations
- **Given** a class with a vacancy (player Alice dropped out, level "Beginner", side "left")
- **When** coach triggers invitations (or auto-trigger fires)
- **Then** a Vacancy is created with original_player_id=Alice, level snapshotted
- **And** Round 1 matching starts: same-level + same-side players identified

#### Batch processing
- **Given** an open Vacancy with 5 eligible players and maxSimultaneous=2
- **When** `process_invitation_batches()` runs
- **Then** 2 NotificationEvents are created with status "sent"
- **And** invitation messages sent to those 2 players

#### Player accepts invitation
- **Given** a NotificationEvent with status "sent" for player Bob
- **When** Bob responds with action "yes"
- **Then** the event status becomes "confirmed"
- **And** the Vacancy status becomes "filled", filled_by_player_id=Bob
- **And** Bob is added to the instance (Presence + PlayerLessonInstance association)

#### Quiet hours are evaluated on the club wall clock, not UTC (PAD-136)
- **Given** a coach with `quietHours.enabled = true`
- **When** the engine evaluates restrictions at an instant that is **22:30 club-local in summer**
  (21:30 UTC, WEST = UTC+1)
- **Then** the send is suppressed, because 22:30 local is inside the 22:00–07:00 window
- **And** at **07:30 club-local in summer** (06:30 UTC) the send is allowed, because 07:30 local
  is outside it

#### The same UTC hour falls on opposite sides of the window in summer and winter (PAD-136)
- **Given** a coach with `quietHours.enabled = true`
- **When** restrictions are evaluated at **21:30 UTC** on a summer date and on a winter date
- **Then** the summer evaluation suppresses the send (22:30 WEST, inside the window) and the
  winter evaluation allows it (21:30 WET, outside the window)
- **And** this asymmetry is the discriminating evidence that the check performs a timezone
  conversion rather than applying a constant offset — a regression to a naive-UTC comparison
  makes both evaluations agree and fails this criterion

#### The daily invite quota counts over the club-local day, not the UTC day (PAD-144)
- **Given** a coach with `maxInvitesPerStudentPerDay` enabled with value 2, and a student who has
  already been sent 2 invitations at **10:00 club-local today** (09:00 UTC, WEST = UTC+1)
- **When** the engine evaluates the limit at **00:30 club-local the next day** (23:30 UTC, still
  the *previous* UTC day)
- **Then** the student is allowed a further invitation, because the local calendar day has rolled
  over and their quota has reset
- **And** a naive-UTC boundary would still count the 2 earlier events and wrongly suppress the send

#### Events in the first local hour of the day belong to that day (PAD-144)
- **Given** a coach with `maxInvitesPerStudentPerDay` enabled with value 1
- **And** an invitation sent to a student at **00:30 club-local in summer** (23:30 UTC the previous
  day)
- **When** the limit is evaluated later that same club-local day
- **Then** the student is blocked, because that 00:30 event falls **inside** the current local day
- **And** a naive-UTC boundary attributes it to the previous day and wrongly allows a second
  invitation — letting the student receive 2 invitations within one local day under a limit of 1

#### The same UTC instant falls on opposite sides of the day boundary in summer and winter (PAD-144)
- **Given** a coach with `maxInvitesPerStudentPerDay` enabled
- **When** the day boundary is derived for **23:30 UTC** on a summer date and on a winter date
- **Then** the summer derivation places that instant in the *next* local day (00:30 WEST) and the
  winter derivation places it in the *same* local day (23:30 WET)
- **And** this asymmetry is the discriminating evidence that the boundary performs a timezone
  conversion rather than applying a constant offset — a regression to a naive-UTC day boundary
  makes both derivations agree and fails this criterion

#### Escalate to next round
- **Given** all Round 1 players declined or expired
- **When** `process_invitation_batches()` runs
- **Then** the Vacancy advances to Round 2
- **And** new matching criteria are applied

#### A student who declines is not invited again in that round (B-056)
- **Given** one open spot, two students eligible in Round 1, and one invitation at a time
- **When** the first-ranked student declines
- **Then** the next invitation goes to the other student, and the first student has exactly one
  invitation for that vacancy in Round 1
- **And** a decline recorded by the coach is treated the same on the next batch
- **And** when the other student declines too, the vacancy advances to Round 2 instead of
  re-inviting either of them

#### The widest round is capped at the eligibility bar (pending PAD-128)
- **Given** a coach whose eligibility is `[{level, within_n_of_class, value: 1}]`
- **And** a vacancy whose earlier rounds have all been exhausted
- **When** the engine advances to the round whose `invitation_groups` entry has no rules
- **Then** only students within one ladder step of the class are invited
- **And** students further away are invited in no round
- **And** with an unset eligibility bar that same round invites the whole roster, exactly as today

#### "Both" player is eligible for a side-specific vacancy, exact side preferred
- **Given** a vacancy with side "left" and level "Beginner"
- **And** an eligible "Beginner" player Left-Lucy with side "left" and an eligible "Beginner" player Both-Bob with side "both"
- **When** Round 1 (same level + same side) eligibility is computed
- **Then** both Left-Lucy and Both-Bob are eligible (Both-Bob is NOT filtered out by the same-side criterion)
- **And** Left-Lucy is ranked ahead of Both-Bob by the playing-side tiebreaker (exact side preferred over "both")

#### "Both"-side vacancy accepts any-side players
- **Given** a vacancy with side "both" (a "both" player dropped out)
- **When** Round 1 (same level + same side) eligibility is computed
- **Then** same-level players of side "left", "right", and "both" are all eligible

#### "One level above" follows the coach's ladder, not the raw display_order value
- **Given** a coach whose ladder is `4` (strongest), `5`, `5-` (weakest)
- **And** an invitation group whose only rule is `level one_above_vacancy`
- **And** a vacancy snapshotted at level `5`
- **When** eligibility for that group is computed
- **Then** only students at level `4` pass
- **And** students at level `5-` (two steps away from `4`, one step below the vacancy) do NOT pass

#### A level with no explicit display_order never masquerades as the strongest level
- **Given** a coach whose ladder is `4` (display_order 1), `5` (display_order 2)
- **And** a level `5-` created through a path that left `display_order` unset (`NULL` or `0`)
- **And** an invitation group whose only rule is `level one_above_vacancy`
- **And** a vacancy snapshotted at level `4`
- **When** eligibility for that group is computed
- **Then** no student passes (level `4` is the top of the ladder, so nothing is one level above it)
- **And** students at level `5-` are NOT invited

#### A structural vacancy inherits the level from the parent lesson
- **Given** a class instance with no `level_id` of its own whose parent lesson has `default_level_id` = `Beginner`
- **And** the class is not full, so the engine creates a structural vacancy (no departing player)
- **And** an invitation group whose only rule is `level same_as_vacancy`
- **When** the vacancy is created and eligibility for that group is computed
- **Then** the vacancy carries level `Beginner`
- **And** only `Beginner` students pass the group — students at other levels are NOT invited
- **And** the `{level}` placeholder in the invitation message renders `Beginner`

#### A vacancy with no level anywhere invites nobody through a level rule
- **Given** a class instance with no `level_id` whose parent lesson has no `default_level_id` either
- **And** an invitation group whose only rule is a level rule (`same_as_vacancy`, `one_above_vacancy`, …)
- **When** eligibility for that group is computed
- **Then** no student passes (the level rule fails closed)
- **And** the group does not fall back to the coach's whole roster

#### Two students accept the last spot at once (PAD-261, Postgres)
- **Given** a class with one open spot and two invited students
- **When** both answer "yes" at the same moment
- **Then** exactly one is enrolled and the other gets the spot-filled answer

#### An answer that waits past the start enrols nobody (PAD-261, PAD-68)
- **Given** a student's "yes" that passed the early "class is over" check
- **When** the class reaches its start while the answer waits on the lock
- **Then** nobody is enrolled, the answer is `expired`, and the invitation and the open vacancy are expired

#### A departing player gets one open vacancy (PAD-261)
- **Given** an open vacancy already exists for a student's absence
- **When** the absence is processed again
- **Then** the existing vacancy is returned and no second one is created

#### A wave costs the same for a big roster as for a small one (PAD-276)
- Given a coach with 6 roster students and another with 60, each roster with recurring availability blockers and attendance history, and one open vacancy each
- When the widest wave is evaluated and ranked for each vacancy
- Then the 60-student wave issues no more SQL statements than the 6-student wave plus two, and fewer than 60 in total
- And every blocked student's verdict is `unavailable`, every other student is `invited`, and the batched attendance stats equal the per-player stats for every survivor (0.0/0.0 for a student with no history)

#### A filled vacancy stops inviting, whichever door filled it (PAD-317)
- **Given** an open vacancy with one `sent` invitation and one `queued` invitation out for it
- **When** the spot is filled by any path — a student accepting, a coach accepting for them, a waiting-list placement, an accepted join request, or capacity reconciliation
- **Then** the vacancy is `filled` and neither invitation is left in a live state
- **And** neither candidate's invitation message stays actionable
- **And** the winner's own invitation is untouched by the close, and is marked `confirmed` by the path that accepted it
