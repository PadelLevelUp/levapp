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
- **NotificationEvent** (`notification_events`): coach_id, lesson_instance_id, player_id, message_id, vacancy_id, type (manual|auto), round_number, status (sent|confirmed|expired|queued), answer (yes|no|null — the student's answer, rule 18) — indexed on (vacancy_id, status), (lesson_instance_id, status), (coach_id, created_at) and (player_id, coach_id)

### Rules
1. `trigger_invitations(instance, coach_id)` creates a Vacancy and starts matching. In automatic mode the vacancy gets approval_status "not_required" and sending proceeds as below; in semi-automatic mode it gets approval_status "pending" and no invitations are sent until the coach approves (see notifications.semi-auto-approval)
1b. **Starting is once per vacancy (PAD-493, ledger B-259).** `trigger_invitations` only ever
   *starts* a vacancy: it sends the first batch to a sendable open vacancy that has never started
   (`last_activity_at` is null — no batch sent, no round deferred). A vacancy that has started is
   left to `process_invitation_batches` (rule 5), which alone sends later batches and advances
   rounds. So the function is safe to call any number of times — a second decline, a coach's
   repeated attendance confirm, a re-armed invitation-start job — and a call that starts nothing
   sends nothing and returns an empty list. The start is claimed in its own short transaction:
   the vacancy row is locked (`SELECT … FOR UPDATE`) and re-read, the claim is stamped on it
   (`last_activity_at`) and committed, and only then is the batch sent. The lock and the re-read
   make a second caller wait and then see the committed stamp, so two concurrent callers — two
   triggers, or a trigger and the tick's fresh-vacancy branch — cannot both start one vacancy;
   sending after the commit means no push goes out for a claim a rollback could undo. A batch that
   sent nothing and advanced no round (`maxTotal` used up), or that raised, gives the claim back
   (under the lock, only if nothing has moved since), so the vacancy is retried on the next tick
   like any never-started one. A claim whose first batch never completed (round 1, batch 0: the
   process died before the batch, or part-way through it after committing some invitations)
   lapses after `START_CLAIM_LEASE` (10 minutes) and is started again by the next caller or tick,
   whatever `maxInactiveTime` is; the restart's dedupe skips the students already invited, and the
   invitations they hold count toward `maxSimultaneous`, so the restart tops the first batch up
   instead of sending a full one on top (PAD-495). Only the first batch is capped this way: an
   invitation does not expire before the class starts, so counting every live one would stop all
   later batches; later batches are paced by `maxInactiveTime` alone. Each invitation is committed
   together with its message, never before it, so a message that fails to send leaves no live
   invitation behind (PAD-495).
   **Assumption, not a guarantee:** a live sender completes its first batch inside the lease (a
   batch is at most `maxSimultaneous` students, seconds of work). The window the lapse can race is
   the whole first batch, from the claim's commit to the batch counter's update: a sender that
   stalls longer than 10 minutes anywhere in it is raced by the restart, and both send. Not covered by the lapse:
   a started vacancy (batch 1 or later). One with an invitation of its own still out is paced by
   `maxInactiveTime` (and with it off waits for the class start); one with nothing of its own out
   is looked at on every tick (rule 18). A decline's follow-up invitation (one
   more, to the next candidate) is not a start and is unchanged. Every call also creates a
   vacancy for each absent student who has no vacancy of any status on the class (one whose earlier
   vacancy was filled or expired and who is marked absent again gets none, as on staging), even
   while another vacancy of the class is open,
   but only as many as the absences free (places minus filled spots minus open vacancies): an
   absence on an over-full roster creates none (rule 13); never-filled places get theirs, as before, when the class has no
   open vacancy.
2. Vacancy snapshots the departing player's side and level for matching (the snapshotted side may be `left`, `right`, or `both`). A structural vacancy (no departing player) gets a balancing side instead (rule 2b).
2b. **Never-filled spots balance the class's sides, if possible (PAD-421; owner, 2026-09-24).** When
   structural vacancies are created, each new spot gets side `left` or `right`, chosen to leave the
   class as close to even as possible. The count is the players holding a spot (`effective_filled_spots`'s predicate: an
   absent player gave theirs up; `left` / `right`, with `both` and no side flexible and counted on
   neither) plus the sides its open vacancies already carry, so a player who dropped out counts once,
   through the vacancy they opened. Each new spot takes the side with fewer, and a tie gives `left` then alternates. Round 1
   ("same level and same side", `both`-inclusive, rule 4a) then invites that side first. Rounds 2–3
   widen as they always do, so a spot never stays empty for lack of a player of its side. Balancing
   ranks and orders, and it is never an eligibility bar (`eligibility.rules` rule 4). If no player on
   the coach's roster plays `left` or `right`, the spots keep side `null` exactly as before. A sided
   spot would only empty round 1 (a player with no side matches no side, rule 4a) and delay the fill
   by a tick (rule 3c). Open structural vacancies created before this rule keep side `null` and are
   not rewritten. There is no per-class or coach-wide opt-out: the owner's words ("invite players in a
   way that makes the class simetrical if possible") named none, so balancing is the default for
   every class. Add an opt-out if the owner asks (coordinator, 2026-09-24).
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
3a. **Every round is capped at the eligibility bar.** Candidate selection applies, in this order:
   `effective_eligibility()` for the class (`eligibility.cascade`) → the current round's
   `invitation_groups` criteria → `restrictions` → the priority criteria and tiebreakers that rank
   what survives. The widest round therefore means "everyone **eligible**", never "everyone". The
   widening behaviour itself is unchanged: rounds still open up in the same order, at the same
   timings, and a spot still reaches progressively more students — it simply stops at the floor.
3b. **Round criteria and eligibility parameters are different sets and stay different.** Playing side
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
4b. Exact-side preference: the "same side" criterion admits `both` players, but within a round the playing-side tiebreaker PREFERS an exact-side match first, then falls back to `both` players, then any remaining. So for a `left` vacancy, `left` candidates rank ahead of `both` candidates, which rank ahead of `right` candidates (if a later, looser round admits them). **A vacancy with no side ranks every side equally (PAD-420):** the tiebreaker contributes the same value for `left`, `right`, `both` and unset players, so it never favours a side; the remaining criteria decide.
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
   still-open invitation all count. The next round applies its own criteria (B-056), within the
   class-wide exclusions of rule 18: a student who said "no" is never asked again for the class,
   in any round.
9. Coach can manually record response: `POST /api/app/notification/{event_id}/coach_respond`
10. **One winner per vacancy (PAD-261).** A "yes" takes a row lock (`SELECT … FOR UPDATE`) on the
    vacancy and then the class instance, re-reads both — the vacancy's state and the class's filled
    spots, never copies loaded earlier in the request — and only then enrols. PAD-68's "class is over" check runs again on the re-read class, so an answer that
    waited on the lock past the start (or across a move to start now) is expired exactly as the early
    check expires it. A second "yes" for the
    same last spot waits on the lock, finds the spot taken and gets the normal spot-filled answer and
    waiting-list offer. The lock lasts until the enrolment commits: closing the vacancy, the
    winner's confirmation and the enrolment land in ONE commit (PAD-499, ledger B-261). Retiring
    the other candidates' invitations only flushes, and their live message edits are published
    after that commit, so no helper can end the lock early and a failed enrolment leaves nothing
    changed (the student can answer again). The reconcile that enrolment runs locks the other
    vacancies it may close without waiting (`SKIP LOCKED`): one that another answer is deciding on
    is left to that answer, which then finds the class full, and the tick reconciles it. Vacancies are created only under
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

14. **One open vacancy per departing player per occurrence, enforced by the database (PAD-303,
    B-046 step 5 / B-051; numbered 14 after PAD-271's 13 and before PAD-317's 15).** `vacancies` has a partial unique index
    `uq_vacancies_open_original_player` on `(lesson_instance_id, original_player_id)` where
    `status = 'open' AND original_player_id IS NOT NULL`. Filled and expired rows and structural
    vacancies (no departing player) are not covered, so a spot can be vacated again later. Rule 10's
    get-or-create under the row lock stays the only writer; the index is the backstop for a writer
    that bypasses it. The migration refuses (raises, naming the groups) when duplicate open
    vacancies exist — zero on the staging copy of prod on 2026-09-11 — and its downgrade drops the
    index.

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
16. **A spot is not dropped while someone asked can still say yes (PAD-493, ledger B-259).** When a
    vacancy's last round has nobody left to invite, it expires only if none of its invitations is
    still live (`LIVE_INVITATION_STATES`). With a live invitation it **holds**: it stays `open` on
    its last round, and a "yes" in that window is accepted as on any open vacancy. A held vacancy
    is still looked at on each `maxInactiveTime` pass of the tick, so a student who has become
    eligible meanwhile is invited; nobody already asked in that round is asked again. It expires
    on the first pass through the round logic after its last live invitation has resolved: at once
    when that is a student's own "no" (the decline's follow-up runs it); on the next tick when the
    coach records the "no" (a vacancy with nothing of its own out is looked at every tick, rule 18);
    and otherwise at the class start (PAD-68). While automatic invitations are off for the class,
    which skips both the decline's follow-up and the tick, the class start is the only later point. Holding sends no message of its own, and because the vacancy stays open, no second vacancy is created for that same place while it holds (other places get theirs,
    rule 1b). (Before this, the rounds could run out under live offers and a "yes" was answered
    `spot_filled` on a spot nobody had taken.) `queued` counts as live because it is in
    `LIVE_INVITATION_STATES` (rule 15); nothing writes it today.
17. **The same answer twice is answered once (PAD-493, ledger B-260).** A second "no" on an
    invitation that is no longer live, and a second "yes" on one already `confirmed`, change nothing
    and send nothing: no second decline message, no next invitation, no `spot_filled` to the student
    who holds the spot. The check runs on the invitation re-read under a lock — the vacancy's
    (rule 10's order) for an automatic invitation, the invitation row itself for a manual one,
    which has no vacancy —
    and the answer is recorded before the lock can end: a "no" marks the invitation `expired`
    before anything commits, and a "yes" marks it `confirmed` before the spot is closed (closing
    retires the other invitations, and that commits). So a double tap racing itself is answered
    once. A "no" on an invitation already `confirmed` is the same no-op: the student keeps the spot
    and the invitation stays `confirmed`, and the answer reports `confirmed`, so both clients show
    the Accepted badge (PAD-495). Leaving a class after
    winning it goes through the attendance cancel, not the invitation. A "yes" after the
    student's own "no" on the same invitation is the same no-op too (rule 18). **Not covered
    here:** a student who lost the spot and answers "yes" again is told `spot_filled` and offered
    the waiting list again each time (PAD-495).
18. **A student's "no" is final for that class; one live offer per student per class (PAD-497,
    absorbing PAD-494; owner, 2026-10-02: "a student no means I dont want a spot in this class.
    He should never be invited to that class again").** "That class" is the single occurrence
    (`lesson_instance_id`), not the recurring series; the key is chosen in one place. The answer a
    student gives is stored on the invitation (`NotificationEvent.answer`, `yes`|`no`), written by
    the student's own answer and by the coach recording it for them (rule 9). Only an answer is a
    "no": an invitation retired because someone else took the spot, expired with the class, or
    never answered is not one. Then, for every automatic path of that occurrence:
    - a student who answered "no" to any of its invitations is never invited again — not in a
      later round, not for another spot, not by a re-created vacancy — and is skipped by its
      automatic waiting-list fill;
    - a student holding a live invitation (`LIVE_INVITATION_STATES`) for one spot is skipped for
      its other spots until that offer resolves; if it resolves without a "no" (the spot went to
      someone else), they may be asked for another spot on the next pass.
      This is checked by reading the class's live invitations, not under a lock: two senders
      choosing at the same moment for two spots of one class can still both pick the same free
      student (PAD-509, a class-level lock while choosing). Within ONE spot every sender — the tick's
      next batch, a decline's follow-up — decides each student under that vacancy's row lock, held
      until the student's invitation commits with its message, so two senders on the same spot never
      invite the same student (PAD-495).
    **Who counts as holding a spot (#513 review).** `offered_another_spot` is decided LAST, after
    every other check of the round (eligibility, the coach's exclusions, inactive accounts,
    unavailability, the student's own opt-out, the round's rules): it means "this round would ask
    them but for that other offer". A live **manual** invitation for the occurrence counts as
    "another offer" for that skip — the student already has an offer for this class and is not
    sent an automatic one on top — but, like any offer, holds a spot only for a student the round
    would otherwise ask, so a student the coach excluded never holds a spot with a manual
    invitation. No invitation, automatic or manual, is ever left live without its message: it is
    committed together with the message (PAD-495 item 8, landed here), and one whose message a
    backstop withholds (an empty body, PAD-67; availability, PAD-107; block-all, PAD-112) or that has
    no account to message is discarded — so a student cannot hold a spot with an invitation they
    never received.
    **Rounds.** A round whose candidates all hold another spot's offer moves on, like an empty
    round (one round per tick, PAD-87), whatever `maxInactiveTime` is: a starved spot reaches its
    last round within (groups − 1) ticks, asking on the way any student a later group admits. Only
    the **last** round (`current_round_number >= _round_max_count(config)`, the expression
    `_defer_next_round` uses; with one invitation group that is round 1) waits instead of
    expiring. A student freed later (their other offer retired) is judged by the round the spot is
    then in: with the default groups the last round is the widest, but a coach whose last group is
    narrower than an earlier one will not re-ask a freed student whom only the earlier group
    admitted, and the spot then expires.
    **How the wait ends.** A waiting spot is looked at again on every tick (a never-started spot
    gives its claim back; a started one with no invitation of its own out is not paced by
    `maxInactiveTime`), so the wait ends on the first tick after any of: the other offer is
    declined (that student is out; the spot expires as usual), accepted or retired (that student is
    enrolled or free), a new candidate becomes eligible, capacity closes the spot (rule 13), or the
    class starts (PAD-68). An offer nobody answers keeps it waiting until the class starts, exactly
    as that offer keeps its own spot holding (rule 16).
    **Reach.** A spot never sits with a free place and an uninvited student its current round would
    ask, and each student holds one invitation per class instead of one per spot. With invitation
    groups nested widest-last (the default groups), the same students are reached as fast or faster
    than before. When the last group is NOT the widest — any group a student could match earlier but
    not last, such as a ladder ending on `one_below_vacancy` — a spot can step past a student who is
    holding a sibling's offer and reach its last round without them; if that offer is later retired
    (someone else took that spot), the student is not asked for this spot, where before PAD-497 they
    would have been asked for both spots at once.
    **Known side effect until PAD-495 lands:** a started spot whose batch the daily per-student limit
    skipped entirely is re-examined every tick and, until PAD-495 item 9, advances its batch counter
    and `last_activity_at` each time without sending anything (nothing reaches anyone).
    A "yes" after the student's own "no" on the same invitation changes nothing and sends
    nothing; the answer reports `declined`, so both clients keep the invitation marked
    "Declined" (they already show that badge, without buttons, once a "no" is recorded). A
    change of mind goes through the coach or the student's own request. Unchanged, because they
    are not automatic invitations: the coach's manual invite and manual add (the manual picker
    marks the student "declined this class" but keeps them selectable), and the student's own
    class or join request. The invite explanation names both skips — `declined_this_class` and
    `offered_another_spot` — on web and iOS (a build older than these stages shows the raw stage
    key; builds from this change on fall back to a generic line for any stage they do not know).
    **A coach-recorded "no"** (rule 9) is final in the same way. Its only undo is the coach
    recording a "yes" on that invitation; removing the student and adding them back does not clear
    it. (Until PAD-495 item 2, `coach_respond_to_notification` has no repeat guard and writes the
    answer even on a confirmed invitation; no client calls it today.)

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

#### The widest round is capped at the eligibility bar
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

#### The playing-side tiebreaker favours no side for a vacancy with no side (PAD-420)
- **Given** a vacancy with no side (a side-less player dropped out; or a never-filled spot of a coach whose roster plays no left or right side, rule 2b; or one opened before PAD-421)
- **And** the "Playing side" priority criterion is enabled
- **And** an eligible player Right-Rita with side "right" listed ahead of an eligible player Left-Leo with side "left"
- **When** the candidates are ranked
- **Then** the playing-side tiebreaker gives them the same rank, and Right-Rita stays ahead of Left-Leo
- **And** for a vacancy with side "right" the same criterion still ranks "right" ahead of "both" ahead of "left"

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

#### Never-filled spots balance the class's sides (PAD-421)
- **Given** a class of 16 with 6 enrolled players (4 `left`, 2 `right`) and no open vacancy
- **When** the structural vacancies are created
- **Then** 10 vacancies are created, 6 with side `right` and 4 with side `left`, so the class would end 8/8

#### "Both" and side-less players count on neither side when balancing (PAD-421)
- **Given** a class of 6 with 4 enrolled players: 2 `left`, 1 `both` and 1 with no side
- **When** the structural vacancies are created
- **Then** 2 vacancies are created, both with side `right`

#### A roster with no left or right player keeps never-filled spots side-less (PAD-421)
- **Given** a coach whose roster has no player with side `left` or `right`, and a class of 3 with 2 enrolled players (one `both`, one with no side)
- **When** the structural vacancies are created
- **Then** 1 vacancy is created, with side `null`

#### A player who gave the spot up counts only through their open vacancy (PAD-421)
- **Given** a class of 3 with a `left` player marked absent (their open vacancy has side `left`) and a present `right` player
- **When** the structural vacancies are created
- **Then** 1 vacancy is created, with side `left` (1 right holding + 1 left open is a tie), not `right`

#### A balancing side is filled by that side first, and by anyone if nobody matches (PAD-421)
- **Given** a structural vacancy with side `right`, and the rounds "same level and same side" then "same level"
- **When** eligible players Rui (`right`) and Leo (`left`) are both available
- **Then** round 1 invites Rui and not Leo
- **And** if no `right` or `both` player is eligible, round 1 invites nobody and round 2 invites Leo

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

#### A repeated start changes nothing (PAD-493, B-259)
- **Given** a class with one open spot whose first batch has gone out and is still unanswered
- **When** `trigger_invitations` runs again for the class — a second decline minutes later, a coach confirming attendance twice, the invitation-start job firing again
- **Then** the started vacancy keeps its round, batch and status, gains no invitation, and the call returns an empty list
- **And** a vacancy whose first batch `maxTotal` stopped is retried on the next tick, with `maxInactiveTime` on or off
- **And** a vacancy opened by the second decline is started by that same call
- **And** the next batch for the first spot still goes out from `process_invitation_batches` once `maxInactiveTime` has passed

#### Two callers cannot both start one vacancy (PAD-493, B-259)
- **Given** a never-started open vacancy
- **When** two callers try to start it at once (two triggers, or a trigger and the tick)
- **Then** the start is decided on the vacancy row re-read under `SELECT … FOR UPDATE`, and only the first caller sends

#### Rounds that run out under a live invitation hold the spot (PAD-493, B-259)
- **Given** an open vacancy on its last round with an invitation still `sent` and nobody left to invite
- **When** the round would advance past the last one
- **Then** the vacancy stays `open` on its last round, and a "yes" to the live invitation enrols the student
- **And** when the coach later marks another student absent, that place gets its own vacancy, started at once
- **And** no second vacancy is created for the class while it holds
- **And** when the last live invitation is declined, the vacancy expires

#### The same answer twice is answered once (PAD-493, B-260)
- **Given** a student who has answered an invitation
- **When** they send the same answer again — "no" twice, or "yes" after winning the spot
- **Then** nothing changes: no further invitation goes to anyone, the winner keeps the spot and a `confirmed` invitation, and nobody is told the spot was filled
- **And** the same holds when the two identical answers arrive at once (Postgres, forced interleave)
- **And** a "no" after winning the spot changes nothing: the invitation stays `confirmed`, the student stays enrolled, and nobody else is invited

#### A "no" is final for that class (PAD-497)
- **Given** a class with an open spot and a student who answered "no" to its invitation
- **When** the spot reaches a later round, a second spot of the class opens, the spot is re-created, or the class's waiting list is filled automatically
- **Then** the student is not invited and not placed, and the invite explanation gives `declined_this_class`
- **And** the same holds when the coach recorded the "no" for them
- **And** a "yes" from that student on the same invitation enrols nobody and reports `declined`
- **And** the coach can still invite them by hand, and the invitation is sent

#### One live offer per student per class (PAD-497, absorbing PAD-494)
- **Given** a class with two open spots and the same eligible students
- **When** both spots invite
- **Then** no student holds two live invitations for the class, and a skipped student's reason is `offered_another_spot`
- **And** when a student's offer for the first spot is retired because someone else took it, they are invited for the second spot on the next pass
- **And** when it is declined instead, they are not

#### An unanswered or retired invitation is not a "no" (PAD-497)
- **Given** a student whose invitation was retired (spot filled by someone else) without an answer
- **When** another spot of the same class invites
- **Then** the student may be invited for it

#### Only the last round waits; an earlier round moves on (PAD-497, rule 18)
- **Given** two spots and invitation groups "same side" then "everyone", with the same-side students all holding the first spot's offers
- **When** the second spot's round 1 finds nobody it can ask
- **Then** it moves to round 2 on the next tick and asks a student only round 2 admits; only a last round in that state waits

#### A holder the round would never ask does not hold a spot (PAD-497, rule 18)
- **Given** a student the coach excluded from automatic invitations, holding the coach's manual invitation for the class
- **When** a spot's round has nobody else to ask
- **Then** the spot moves on (an earlier round) or expires (the last round) — it does not wait on that student

#### A manual invitation counts for the one-offer skip (PAD-497, rule 18)
- **Given** a student holding the coach's live manual invitation for the class
- **When** the engine starts a spot of that class
- **Then** it sends that student no automatic invitation on top

#### No invitation is left without its message (PAD-497, rule 18)
- **Given** an automatic or manual invitation whose message fails to send, or is withheld by a backstop
- **When** the send returns or raises
- **Then** no live invitation without a message remains for that student

#### Only one open vacancy per departing player per occurrence (PAD-303)
- **Given** an open vacancy on instance 10 for player 7
- **When** a second open vacancy on instance 10 for player 7 is inserted
- **Then** the database refuses it (`uq_vacancies_open_original_player`)
- **And** an expired vacancy on instance 10 for player 7 next to the open one is accepted, and two structural vacancies (no departing player) on instance 10 are accepted
