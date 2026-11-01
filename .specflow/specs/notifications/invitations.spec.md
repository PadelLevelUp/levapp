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
- **NotificationEvent** (`notification_events`): coach_id, lesson_instance_id, player_id, message_id, vacancy_id, type (manual|auto), round_number, status (sent|confirmed|expired|queued), answer (yes|no|null — the student's answer, rule 18), retired_reason (null|"side_balanced" — rule 2d, PAD-581) — indexed on (vacancy_id, status), (lesson_instance_id, status), (coach_id, created_at) and (player_id, coach_id)

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
   later batches; later batches are paced by `maxInactiveTime` alone. An invitation, its message and
   its `message_id` land in one commit (rule 18), so a message that fails leaves no live invitation
   behind.
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
   **A write that opens a spot asks for the start; it does not send (PAD-733).** A student's
   cancellation or reminder "no" (`_free_spot_for_declining_player`), a coach's attendance sheet
   (`POST /class_instance/presences/confirm`) and a student's "no" to an invitation
   (`POST /notify/respond`) commit their own change, arm a one-shot scheduler job that runs now
   (`invite_now_<instance>` → `trigger_invitations`; `decline_next_<vacancy>_<event>` → the
   decline's follow-up, `_send_next_on_decline`) and answer. The job runs on whichever process
   runs the jobs: with `WORKER_SPLIT` off (production today) the API's own scheduler thread, with
   it on the worker, which reads the shared store within `WORKER_WAKE_SECONDS`
   (`delivery.worker-role`). One id per target, so a repeated ask replaces the armed job instead of
   adding one. This rule's claim makes the job one more caller like the sweep and `invite_start`:
   the same students, once. With no scheduler in the process (the CLI, the test suite outside the
   scheduler fixtures) the request sends inline as before. Consequence on a "no": the coach's
   decline message is now written before the next student's invitation instead of after it; no
   rule orders the two, and this is intended, not a regression. In semi-automatic mode a student's
   cancellation or reminder "no" asks for the coach's approval the same way: it commits the pending
   vacancy, arms `approval_now_<instance>_<vacancy>` (→ `create_vacancy_approval_prompt` for that
   vacancy, if it is still open, pending approval and without a prompt) and answers. The coach's
   approval prompt follows within seconds, and the student's answer never waits on it. Building the
   prompt's queue ranks the coach's whole roster once per wave, which is seconds of work on a large
   roster (PAD-733). One job per vacancy (PAD-764): with one id per class, a decline that landed
   while the class's job was running re-armed that id and the scheduler skipped the run (one running
   instance per id), so the second spot never got a prompt. Each declined spot is now asked about by
   its own job, and declines seconds apart get one bundle each, as on the inline path. A vacancy
   that already has a prompt is skipped, so a second run asks nothing. With no scheduler in the
   process the prompt is built inline, as before. The coach's attendance sheet
   (`POST /class_instance/presences/confirm`) still builds its prompt in the request: its reply
   carries `approvalBundle`, which web's class detail shows at once.
1c. **A never-filled place has a start of its own (PAD-540, ledger B-301; numbering unconfirmed).**
   An absence opens its vacancy the moment it is recorded, and the tick (rule 5) starts it once
   the window is open. A place nobody ever filled has no such moment, and before this rule it was
   opened only by the one-shot `invite_start_<instance>` job, which exists only for a materialised
   occurrence and is armed only for a future time (`notifications.config` rule 10). An
   invitation start earlier than or equal to the first reminder, reminders off, a class created
   or opened inside its window, or a restart across the fire time therefore left the place
   silent (B-301). Two paths now open it, at the later of the window opening (rule 11) and the
   moment the engine can see the class:
   - **an occurrence not yet materialised** carries a lesson-level
     `invite_start_lesson_<lesson>_<date>` job beside its reminder job, derived by the same walk
     (`schedule_lesson_reminder_jobs`), under the lesson's primary coach, removed and pruned with
     it. When it fires it materialises the occurrence and calls `trigger_invitations`. Materialising
     an occurrence removes that job and leaves the instance's `invite_start_<instance>` as the
     occurrence's only start job (the reminders rule 20 shape), so the two never both fire;
   - **a materialised class** whose window is open, which is still ahead on the club's clock, has
     a free seat no spot stands for (rule 1d), automatic invitations on (`toggle-class` rule 5),
     notifications on and **no open vacancy** is opened by the next tick through `trigger_invitations`, so every
     gate applies unchanged: the engine switch, semi-automatic approval (an approval prompt, not an
     invitation), the restrictions and quiet-hours hold (config rule 6d), the start-once claim
     (rule 1b), and the creation under the class lock (rule 10, PAD-261) — a tick and a start job
     or an absence racing on one class create its places once and start them once. An expired
     vacancy is not reopened: rule 1d counts its seat as taken care of, so the tick opens only the
     class's other free seats; capacity changes are rule 13's. (Until PAD-763 any vacancy row
     stopped the scan, and the start job counted a filled spot's seat twice, so a class whose freed
     spot was filled or had expired never opened its other free seats: B-701, rule 1d.)
     An invitation start of type `none` opens nothing from the tick, as it arms no job;
   - **an occurrence not yet materialised whose window is already open when its jobs are derived
     (PAD-661, ledger B-501)**. Neither path above sees it: the derivation
     (`schedule_lesson_reminder_jobs`: a config or lesson save, the startup re-arm, the daily
     pass) arms nothing for a past fire time (config rule 10a) and the tick reads only materialised
     classes, so the place stayed silent until the reminder materialised it — five days late for a
     7-day window with a 48 h reminder. A derivation that finds the occurrence not materialised,
     still ahead on the club's clock, with an invitation timing that is not `none` and an
     invite-start time already past, now arms `invite_start_lesson_<lesson>_<date>` for the
     **catch-up**: two minutes after the derivation (`INVITE_START_CATCH_UP`), not at the past
     time, unless the job is already armed. The runner is the same, so every gate above holds
     (semi-automatic approval, the restrictions and the quiet-hours hold, the start-once claim,
     the class lock), materialising still removes the job, and a later derivation finds the date
     materialised and arms no second catch-up. Reminder jobs are untouched: a past reminder time
     still means no job, so a save re-sends nothing (rule 10a). The first startup after this rule
     arms a catch-up for every such occurrence of every engine-on coach, which opens those classes
     two minutes later (the deploy burst; owner, 2026-10-14).
   The tick opens every such class it can see, so a deploy or a save that lands inside open
   windows opens those classes on the next tick (coordinator, 2026-10-07: the burst is accepted,
   measured on staging before merge). A save still sends nothing itself (config rule 10).
1d. **A free seat is a seat nobody holds (PAD-763, ledger B-701; numbering unconfirmed).** A
   class's free seats are its capacity minus the seats held: the players going plus those who have
   not answered (`effective_filled_spots`, the same count as the participants header's "K vagas",
   `calendar.event-detail` rule 5). A filled spot is not counted again: the student who filled it
   holds that seat and is already in the held count. An open spot stands for a free seat being
   offered; an expired spot for a free seat whose rounds ran out, which stays closed and never
   comes back as a never-filled spot (no loop re-asking the same pool). Never-filled spots are
   opened for the free seats no open or expired spot stands for, under the class lock (rule 10), at
   the invitation start (rule 1c's start job and `trigger_invitations`), on a coach's edit (rule
   13a) and, for a class with no open spot, at the tick's scan (rule 1c): a seat that never had a
   spot gets its own rounds, whatever happened to the class's other spots. Each is a
   never-filled spot like any other: the waiting list is asked first (rule 8a), then the rounds, with
   its balancing side (rule 2b); rule 18's "no is final for that class" and rule 18c's one live offer
   per student per day apply unchanged, and the filler, being in the class, is never asked. A class that holds such a seat when this
   rule ships is opened by the first tick after it, once its window is open; no data repair.
2. Vacancy snapshots the departing player's level for matching, and takes a side by rule 2c, which starts from the departing player's side in that occurrence (`left`, `right` or `both`). A structural vacancy (no departing player) gets a balancing side instead (rule 2b).
   **A player's side, wherever rules 2–2d count or start from one, is their side in that
   occurrence (PAD-551):** the presence's override when the coach set one, else the coach–player
   link's side (`classes.instance-enrollment` rule 13). Candidate ranking and round 1's "same
   side" filter (rules 4a, 5) keep reading an invitee's usual side, since an invitee has no
   presence yet.
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
2c. **A freed spot asks first for the side the class is short of (PAD-541; owner, 2026-10-08,
   option A; counting corrected by PAD-565; owner, 2026-10-09, option A).** When a player's
   cancellation opens a vacancy, the vacancy's side is the side the class needs, not automatically
   the leaver's. The count is **the players going**: the players still holding a spot
   (`effective_filled_spots`'s predicate; `left` / `right`, with `both` and no side on neither),
   minus the leaver, plus the sides of the class's other open **freed** spots (vacancies with a
   departing player). **The class's never-filled spots are not counted (PAD-565, ledger B-401):**
   rule 2b sides them toward an even class at capacity, and counting them made a freed spot in a
   class that is not full balance that projection instead of the roster — 6 left / 2 right going
   in a class of 16 asked `left` for a left leaver, because the 8 never-filled spots carried 6
   right and 2 left. The spot takes `left` or `right`, whichever has fewer. **On a tie it keeps the
   leaver's side**, which may be `both` or none. So several freed spots balance across one
   another, each counted as its side for the next, whether they open together or one by one. A
   class of 6 left and 3 right whose two leavers both played left ends 5 / 4: the first spot asks
   right (it counts 5 / 3 if the second leaver still holds their place, 4 / 3 if both are already
   out), and the second counts 4 / 4 with that spot and keeps left. A class of 16 with 6 left and
   2 right going whose left player leaves asks right (5 / 2), whether or not its never-filled spots
   are already open. Rule 2b is unchanged: a never-filled spot still counts every open vacancy,
   freed ones included, so the never-filled spots balance around a freed one. The side is chosen
   under the class lock that already serialises vacancy creation (rule 10), so two cancellations
   at once still see each other's spot; nothing in that section commits before the new vacancy
   does (the coach's settings are read first). As in rule 2b, if no player on the coach's roster
   plays `left` or `right`, the leaver's side is kept as before; balancing ranks and orders and is
   never an eligibility bar. Open vacancies created before this rule keep their side. The invite
   simulation shows the side this rule would choose and the numbers it used
   (`notifications.invite-simulation` rule 9), so a tutorial never recounts them.
2d. **The sides re-balance as the class fills (PAD-581; owner, 2026-10-10, via the coordinator,
   option C with the proposal's defaults except Q3).** A spot's side is no longer fixed at creation:
   it is **re-counted** — the count of rule 2b for a never-filled spot (players going plus the sides
   of the class's other open spots), of rule 2c for a freed one (players going plus the other open
   **freed** spots, never the never-filled ones, B-401), the spot itself left out, a tie keeping the
   spot's current side — at two moments, and stored on the spot when it changes:
   - **each batch** of the spot, under its lock, before the candidates are read (round 1's
     "same side" and the side sort use the re-counted side);
   - **each "yes"** of the class (a student's or the coach's) **and each accepted join request**
     (PAD-715, `classes.join-requests` rule 6), under rule 10's locks and in the same one commit,
     for the class's **other** open spots, the new player counted as going;
   - **each change of a player's side in the occurrence** (`classes.instance-enrollment` rule 13,
     PAD-551), set or cleared by the coach, under the same locks and in the same one commit, for
     all the class's open spots, counted with the new side — the same re-count as a yes, so the
     balancing stays dynamic. A spot another
     answer holds is passed over (SKIP LOCKED) and re-counted at its own next batch.
   When a re-count flips a spot to the other side, its live **round-1** invitations to students of
   the side it left (exactly `left` or `right`; a `both` or side-less student stays invited) are
   **withdrawn for balance**: the invitation is expired with `retired_reason = "side_balanced"`,
   `answer` NULL and no `withdrawn_by_coach_at`, and its bubble reads `response: "side_balanced"`,
   "Já não é preciso deste lado" / "No longer needed on this side", with no second message
   (PAD-501), its edit published after the commit. The spot then invites the new side at its next
   batch. In the owner's class of 12 (5 right + 2 left going; spots 4 left + 1 right by rule 2b)
   nothing flips while left students fill the left spots; if a left student takes the right spot in
   a widened round, the remaining left spot re-counts to right and its live left invitations are
   withdrawn. Rounds 2–3 still widen to any side (Q1: they do not wait for balance), and only
   round-1 invitations are withdrawn. Before it is withdrawn, an invitation is offered to the
   class's other open spots by rule 18a's move (PAD-679); only one that does not move is withdrawn.
   A withdrawal for balance:
   - is **not a "no"** (rule 18, Q4): the student may be invited again by a widened round — but
     **not by round 1 of that class again** (one round-1 invitation per student and class);
   - **offers the class's waiting list** from the bubble (Q3, owner): the student may join it even
     while the class has places (the `has_spots` refusal does not apply to them) and even with
     open spots hidden (rule 15); on that list they are group 0 (rule 8a) only for a spot of their
     own side or one with no side, so the list never undoes the balance.
   A class whose coach's roster plays no side keeps every spot's side as it is (rule 2b's `None`).
   In a class whose roster does play sides, a `both` or side-less spot re-counts like any other and
   takes the side the count gives (as rule 2c would have at creation); nothing is withdrawn when a
   spot leaves `both` or no side, since its invitations were not for one side. A batch already
   running when a "yes" lands (its spot locked, so passed over) sends to the side it counted; the
   spot re-counts at its next batch and withdraws then if it flipped.
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
3d. **An empty round says why (PAD-771).** Before the round is deferred, `_send_invitation_batch`
   logs one INFO line `empty round: vacancy <id> round <n> stages {<stage>: <count>, …}`. The counts
   are `evaluate_candidates`' first-failing stage for every roster student in that wave. The line
   carries stage names and counts only, never a student id or name. It is what explains a vacancy
   that runs out of rounds with nobody invited. Like every container log it does not survive a
   redeploy, so it is read before the next rollout.
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
   - After maxInactiveTime without a yes, sends the next batch or round. **An invitation never
     expires because nobody answered it (PAD-609; owner, 2026-10-10):** while its spot is open it
     stays live and can be accepted; it ends only when the spot is filled (rule 15, "spot_filled"),
     the student answers, the coach withdraws it (rule 19) or the class starts (rule 9's stale
     sweep).
6. Player responds: `POST /api/app/notification/{event_id}/respond` with yes/no
7. If confirmed: Vacancy.status = "filled", player added to instance
8. If all decline, or maxInactiveTime passes with no yes: moves to next round, and the earlier
   rounds' invitations stay live alongside it (PAD-609) — the first yes wins. A player invited for
   a vacancy is not invited for it again while that invitation is live, in that round or a later
   one (rule 18's one-offer skip); in that round, whatever they answered, a decline and a
   still-open invitation both count. The next round applies its own criteria (B-056), within the
   class-wide exclusions of rule 18: a student who said "no" is never asked again for the class,
   in any round.
8a. **The waiting list is group 0 (PAD-446; numbering unconfirmed).** Every batch for a vacancy
   first asks the class's waiting-list students who have not yet been invited for it, in the order
   they joined, up to the batch size (`notifications.waiting-list` rules 4–4c, 16). Their
   invitations carry `round_number = 0` and use the `waiting_list_invite` template; the vacancy's
   own round counter does not move for them. Only when no waiting-list student is left to ask
   **today** — one at `maxInvitesPerStudentPerDay` is not, so they never hold the spot from the
   groups for the rest of the club day — does the batch go to the vacancy's current invitation group, so rounds, pacing (`maxSimultaneous`,
   `maxInactiveTime`), the start-once claim (rule 1b), the hold (rule 16) and rule 18 work as before,
   with group-0 invitations counted like any other. A student who joins the list while the rounds
   run is asked on the next batch, ahead of the group. A group-0 invitation is answered through the
   same paths (rules 9, 10, 17, 18); its yes and its no also settle the waiting-list entry
   (`notifications.waiting-list` rule 15).
9. Coach can manually record response: `POST /api/app/notify/coach_respond` with `{notificationEventId, action: "yes" | "no"}` (path corrected, PAD-548). The answer stamps `NotificationEvent.answered_by = "coach"`; a student's own answer stamps `"student"` (PAD-548), and the class detail says which (`calendar.event-detail` rule 16).
   **The coach's answer reaches the student's chat (PAD-563; owner, 2026-10-09).** Recording it
   also writes the invitation message's metadata — `responded: true`, `response: "yes" | "no"`,
   `answeredBy: "coach"` (a student's own answer writes `answeredBy: "student"`) — flushed into
   the same commit as the answer (a "yes": with the close and the enrolment, as `_record_yes`
   does; a "no": with the expiry), and its `message_edited` is queued with `on_commit` and
   published only after that real commit (`messaging.sse-realtime` rule 18). Both shells then
   show the bubble as "Marcado como aceite pelo treinador" / "Marcado como recusado pelo
   treinador" ("Marked as accepted / declined by the coach"), to the student and to the coach
   alike, with the Yes/No buttons gone, live and without a reload. A student's later answer to
   an invitation the coach resolved is refused by the server, not only hidden: a "yes" after the
   coach's "no" answers `declined` and enrols nobody (rule 18), a "no" or "yes" after the
   coach's "yes" answers `confirmed` and the student keeps the spot (rule 17). "Eliminar
   convite" (rule 19) already shows "Vaga preenchida" at once, the same way.
10. **One winner per vacancy (PAD-261).** A "yes" takes a row lock (`SELECT … FOR UPDATE`) on the
    vacancy and then the class instance, re-reads both — the vacancy's state and the class's filled
    spots, never copies loaded earlier in the request — and only then enrols. PAD-68's "class is over" check runs again on the re-read class, so an answer that
    waited on the lock past the start (or across a move to start now) is expired exactly as the early
    check expires it. A second "yes" for the
    same last spot waits on the lock, finds the spot taken and gets the normal spot-filled answer and
    waiting-list offer. The lock lasts until the enrolment commits: closing the vacancy, the
    winner's confirmation and the enrolment land in ONE commit (PAD-499, ledger B-261). Retiring
    the other candidates' invitations only flushes, and their live message edits are queued before
    that commit and sent by its real commit (dropped if it rolls back; a SAVEPOINT's release or
    rollback inside it does neither), so no helper can end the lock early and a
    failed enrolment leaves nothing changed (the student can answer again). Every path that seats a
    student on a vacancy decides the same way and in the same order (vacancy, then class): the
    student's yes (a waiting-list student's included, rule 8a), the coach's recorded yes, the join-request accept, and a
    student taking back the place they had given up (the reminder return, ledger B-284). **This is
    the engine's one lock order (PAD-509, ledger B-300): a vacancy, then its class.** A sender
    choosing whom to invite takes it too: its spot's lock and then the class lock, per student,
    until that student's invitation commits. No path takes the class lock and then waits for a
    vacancy's — the reconcile, which runs under the class lock, takes vacancies only with
    `SKIP LOCKED` — so a sender and an accept on the same spot cannot deadlock. The
    reconcile that an enrolment runs counts every open vacancy of the class but locks only the one
    it is about to close, without waiting (`SKIP LOCKED`): one that another answer is deciding on is
    passed over for the next, and that answer either fills it or finds the class full, and the tick
    reconciles what is left. Vacancies are created only under
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

11a. **The window follows the saved timing (PAD-776).** An automatic invitation, whether the first
    wave, a later round or the waiting list, goes out only once the coach's currently saved
    invitation start has opened for that class; the setting in force when the spot opened does not
    count. When a save moves a class's window later, nothing more goes out for that class until the
    new window opens, and invitations already sent stay live and answerable. When a save moves it
    earlier, a spot held for the old window starts at the next tick after the new one opens. Two
    exemptions: a spot the coach approved with 'Yes, right now' (semi-auto rule 'bypassing the
    invitation window') and the coach's own manual invitations. Mechanism: the save re-derives
    `invite_not_before` for every open spot of the coach's future classes, in the primary-coach
    scope of config rule 10a; the sweep keeps gating on `invite_not_before` alone.
    (`rederive_invite_windows`, called by `update_config` whenever the saved invitation start
    differs from the one before, through `invitationStartTiming` or inside `reminderTiming`. A spot
    approved 'Yes, right now' is the approved spot with no `invite_not_before`: `respond_to_approval`
    writes one only for 'at the window'. Pending and dismissed spots are left alone.)
    **A spot with no window takes the current one at the tick (PAD-776 part 2, ledger B-702).** An
    open `not_required` spot with no `invite_not_before` (one opened inside an earlier timing's
    window, or released from approval before semi-auto rule 1a stamped one) is given, by the sweep,
    the window the coach's current invitation start gives the class: when that window is still
    ahead the spot is held like a spot after a later save (invitations already sent stay live);
    when it has passed nothing is stored and the spot goes on. Once per spot in effect, with no coach
    action and no data repair. A spot with a stored window is not re-timed here: that stays the
    save's job (above). 'Yes, right now' spots (approved, no window) are not touched.

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
   2026-09-11 notification-engine-cost decision, not changed here. Since PAD-733 that cost is
   paid by the scheduler job (rule 1b), not by the request that opened the spot.

12a. **The facts a rule reads are read once per wave too (PAD-788, ledger B-712).** The eligibility
   bar's absence count, `has_makeups` and the level-step operations need the coach's occurrence
   set, the unjustified-absence and make-up counts, and the level ladder. Each is read at most once
   per evaluation, for the whole roster (`_RosterFacts`), not once per student, and a fact no rule
   of the wave reads is not read at all. The verdicts are those of the per-student evaluator, which
   callers without the roster bundle (the manual-add warning, `_still_invitable`) keep using. A
   class opening many never-filled spots runs one evaluation per spot and group in one tick, so the
   per-student reads used to multiply by spots × groups × roster. Measured and reproducible with
   `backend/scripts/opening_cost_probe.py`.

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
     decline, cancellation and structural paths, and (rule 13a) a coach's edit.

13a. **A coach's edit brings the vacancies in line at once (PAD-552; coordinator, 2026-10-07;
   numbering unconfirmed).** `edit_class_service` (`POST /edit_class`), once the WHOLE edit is
   written — capacity, the roster, and the class's own flags (automatic invitations, notifications,
   eligibility) on every occurrence it reached — runs `vacancies_after_class_edit` on each of the
   class's future occurrences. An occurrence counts as having a place freed when it has more free
   places (capacity minus filled spots) than before the edit, read per occurrence before anything is
   written, so a "this and future" edit (the lesson is edited before its occurrences) sees the rise
   too (#577 review):
   - it always reconciles (rule 13), so a capacity lowered below the open vacancies closes the
     surplus and retires their live invitations now, not at the next tick;
   - when the edit freed a place (a higher capacity, a student taken off) and the coach's invitation
     window is open (rule 11), it creates the missing never-filled vacancies (under the class lock)
     and calls `trigger_invitations`, so every gate applies: engine on, automatic invitations,
     semi-automatic approval (an approval prompt, not an invitation), the restrictions and the
     quiet-hours hold, the start-once claim. Before the window opens it creates nothing: the class's
     `invite_start` job opens the place when the window does. An edit that frees nothing sends
     nothing.
   A "yes" that finds the class full while its own spot is still open (a capacity drop whose
   reconcile passed over that spot because the answer held its lock, rule 10) is refused as before
   and also closes that spot under its own locks, so the other offers for the missing seat are
   retired at once. Before PAD-552 the tick closed it.

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
    student accept (a waiting-list student's group-0 invitation included), the coach accept on the
    student's behalf, the accepted join request, and capacity reconciliation (rule 13). (The
    waiting-list placement that was a fifth path is gone with PAD-446.) `except_event_id` spares the
    winner's own invitation, which its caller marks `confirmed`. The routine returns the events
    it retired, because a caller that still has to tell those candidates cannot find them again
    afterwards — a query for live invitations returns nothing once they are expired.
    **Retiring is the telling (PAD-501).** No closing path sends the other candidates a
    `spot_filled` message: their retired invitation shows "Vaga preenchida", and a second chat
    message saying the same was redundant (owner: "no message when an invitation expires or the
    spot is filled"; `notifications.message-templates` rule 15). The join-request accept still
    tells pending join requesters whose request it closes (`classes.join-requests` rule 10).
    **Every fill reads "spot_filled" (PAD-609; owner, 2026-10-10).** The retired message's
    `response` is `"spot_filled"` on every closing path — a student's yes, the coach's recorded
    yes, an accepted join request, any enrolment that leaves no place — so the bubble offers the
    waiting list (rule 15a). A **manual** invitation carries no vacancy and no close reaches it:
    when an enrolment takes the class's last place, capacity reconciliation (rule 13) retires the
    class's live manual invitations the same way, sparing the students who hold a place and passing
    over one another answer holds (that answer finds the class full and records `spot_filled`
    itself). The tick and a class edit retire none: a coach may invite by hand to a class that is
    already full, and that invitation stays live (its late yes reads `spot_filled`).
    `"expired"` stays for the class starting (rule 9's stale sweep) and the coach's withdrawal
    (rule 19). A student who held an invitation to the class (one with its message), neither
    answered "no" nor withdrawn by the coach, may join its
    waiting list from the bubble even when the coach's open spots are hidden (`classes.academy-class-booking`
    rule 6's `not_visible` does not apply to them: the invitation already showed them the class).
15a. **A retired invitation offers the waiting list (PAD-577).** When a student's invitation
    reads "Vaga preenchida" because someone else took the spot (`response: "spot_filled"`), the
    bubble — web and iOS, the chat and anywhere else the invitation is shown — adds "Juntar-me à
    lista de espera" / "Join the waiting list". Pressing it puts the student on **that
    occurrence's** waiting list through the student's own join (`notifications.waiting-list` rule
    14, `POST /api/app/class-waiting-list` with the message's `lessonInstanceId`): group 0, no
    automatic enrolment, asked first when a spot opens. The bubble then reads "Estás na lista de
    espera" / "You're on the waiting list" with "Sair" / "Leave" (rule 14's leave). The button is
    **not** shown when: the class has started (`startsAt` on the invitation's metadata, written at
    send; an older message without it relies on the join's `class_closed` refusal), the student is
    already on that class's list (their own lists, `GET /api/app/class-waiting-list`), or the
    invitation ended for another reason — a timeout (`expired`), the coach's withdrawal
    (`withdrawn`), the student's own "no". A join the server refuses (`has_spots`; `ineligible`) shows the refusal and hides the button. The
    join is subject to the engine's exclusions when a spot opens, as any waiting-list row (PAD-576).
    **At the fill, not at the answer (PAD-621; owner, 2026-10-11):** the bubble turns to "Vaga
    preenchida" with the button the moment the spot fills — a live edit, no push, no new message —
    and a later "yes" is refused (`spot_filled_waiting_list_offered`, the action string clients read)
    without the separate waiting-list offer message it used to post.
    `spot_filled` is written on every fill (rule 15, PAD-609), and a student who held the invitation
    is not refused `not_visible` (rule 15). Manual invitations carry `startsAt` too.
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
    student's own "no" on the same invitation is the same no-op too (rule 18), and so is a "yes"
    repeated by a student who lost the spot: their answer was `spot_filled` (no message since
    PAD-501) and they were offered the waiting list once, and the repeat answers the same and
    sends nothing (PAD-495).
18. **A student's "no" is final for that class; one live offer per student per class (PAD-497,
    absorbing PAD-494; owner, 2026-10-02: "a student no means I dont want a spot in this class.
    He should never be invited to that class again").** "That class" is the single occurrence
    (`lesson_instance_id`), not the recurring series; the key is chosen in one place. The answer a
    student gives is stored on the invitation (`NotificationEvent.answer`, `yes`|`no`), written by
    the student's own answer and by the coach recording it for them (rule 9). Only an answer is a
    "no": an invitation retired because someone else took the spot, expired with the class, or
    never answered is not one. A coach's withdrawal of an invitation (rule 19) is treated as a
    "no" by every automatic path, though it is not the student's answer and `answer` stays NULL. Then, for every automatic path of that occurrence:
    - a student who answered "no" to any of its invitations is never invited again — not in a
      later round, not for another spot, not by a re-created vacancy, not as a waiting-list
      student (group 0, rule 8a), and their waiting-list entry for the class closes
      (`notifications.waiting-list` rule 15);
    - a student holding a live invitation (`LIVE_INVITATION_STATES`) for one spot is skipped for
      its other spots until that offer resolves; if the spot it was for closes or is withdrawn for
      balance while another open spot of the class would have asked them, the offer **moves** to
      that spot instead (rule 18a); otherwise, resolved without a "no" (the spot went to someone
      else), they may be asked for another spot on the next pass.
      Every sender — the tick's next batch, a decline's follow-up, on any spot of the class —
      decides each student under its spot's row lock and then the class's (rule 10's order), held
      until the student's invitation commits with its message. Two senders on the same spot wait on
      the spot (PAD-495); two senders on two spots of one class wait on the class (PAD-509, ledger
      B-300), so the second sees the first's invitation and never offers the same student twice.
    **Who counts as holding a spot (#513 review).** `offered_another_spot` is decided LAST, after
    every other check of the round (eligibility, the coach's exclusions, inactive accounts,
    unavailability, the student's own opt-out, the round's rules): it means "this round would ask
    them but for that other offer". A live **manual** invitation for the occurrence counts as
    "another offer" for that skip — the student already has an offer for this class and is not
    sent an automatic one on top — but, like any offer, holds a spot only for a student the round
    would otherwise ask, so a student the coach excluded never holds a spot with a manual
    invitation. An invitation, automatic or manual, its message and the link between them
    (`message_id`) land in ONE commit: the conversation is fetched first (getting or creating it
    commits), the invitation is flushed, and the message's commit carries all three; delivery (the
    live event, the push) comes after it. A message that fails rolls its invitation back; one a
    backstop withholds (an empty body, PAD-67; availability, PAD-107; block-all, PAD-112), or a
    student with no account to message, leaves no invitation; a delivery that fails after the commit
    leaves the invitation pointing at its message. Tested at those commit points (#526 review).
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
    A started spot whose batch the daily per-student limit skipped entirely is re-examined every
    tick; such a batch does not count (PAD-495 item 9): the batch counter does not move, a first
    batch's start claim is taken and given back (two writes to the vacancy per tick), and nothing
    reaches anyone.
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
    it. The coach recording the same answer twice changes nothing (rule 17).

18a. **A live invitation moves to a sibling spot instead of ending (PAD-679; owner's decisions
    2026-10-21, recorded on the ticket; numbering unconfirmed).** Before PAD-679 a class with two open
    spots told the students asked for the first "Vaga preenchida" when someone took it, and the
    second spot, which had been waiting only on their offers (rule 18), asked them again at the
    next tick: "spot filled", then "a spot opened". Now, when a spot **closes** (rule 10's paths and
    rule 13's reconcile, all through `_close_vacancy`) or one of its live invitations is
    **withdrawn for balance** (rule 2d, `_withdraw_for_balance`), each of its live invitations
    (except the winner's) moves to another open spot B of the same class **if and only if**:
    1. B had no live invitation of its own when the move began (it was waiting only on other
       spots' offers);
    2. B's own candidate pipeline, in B's **current** round (`("group", B.current_round_number)`;
       for a waiting-list invitation, group 0's `("waiting_list", 0)`), gives that student
       `offered_another_spot` — "this round would ask them but for that other offer" — so the
       student fits B (side, level, eligibility, exclusions, the round's rules) and nobody is
       overtaken; this is decided before any invitation of the closing spot changes;
    3. B can send now: not awaiting or dismissed by semi-automatic approval, no
       `invite_not_before` still ahead, automatic invitations on for the class;
    4. at most `maxSimultaneous` (when enabled) invitations move into one B — one batch of B;
    5. B can be locked without waiting (`SKIP LOCKED`, after the closing spot and the class:
       rule 10's order holds), and is locked only when something moves into it, then re-checked
       under that lock — so a close or a reconcile that moves nothing holds no other spot; a B
       another answer holds is passed over, and the invitation ends as before;
    6. a **waiting-list** invitation (group 0), whose message names its spot's side
       (`notifications.waiting-list` rule 16), moves only to a B of the same side (owner,
       2026-10-21); one whose spot had no side moves to any B.
    With several Bs, the lowest `Vacancy.id` that qualifies takes it. A move changes the
    invitation's `vacancy_id` to B and its `round_number` to B's current round (at least 1; group 0 stays 0),
    and its message's `vacancyId` metadata, and records where it came from: `moved_from_vacancy_id`
    (the closing spot; a later move overwrites it, so it always names the immediately previous
    spot) and `moved_at` (PAD-719; the coach's invitation row reads "transferido da vaga anterior",
    `calendar.event-detail` rule 16); the edit is published after the commit as a
    `message_edited` event, with **no push and no new message**: the student sees the same bubble,
    and their "yes" now takes B. B's pacing continues from the invitations it inherited:
    `last_activity_at` becomes the closing spot's last batch stamp (the send time of its newest
    batch), so `maxInactiveTime` counts from when the students were asked, not from the move; the
    moved invitations count as B's current batch (`current_batch_number` at least 1); B's round is
    not touched. A move creates no invitation, so it counts again toward neither `maxTotal` nor the
    one-waiting-list-offer-per-student limit. Otherwise the invitation ends as before:
    `spot_filled` on a close, `side_balanced` on a balance withdrawal (and the balance-withdrawn
    waiting-list filter of rule 2d still applies to it). After a "yes" (the student's or the
    coach's) the class's other spots are re-counted first (rule 2d) and the moves use the
    re-counted sides; a withdrawal that re-count makes is itself tried as a move. Not shown to the
    coach as a separate history line in this change (the owner's decision; a follow-up ticket
    carries it). Manual invitations (no `vacancy_id`) never move. Two "yes" at once on two spots: the
    second spot is locked by its own answer, so nothing moves into it, and its invitations end as
    before.

18c. **One live offer per student per club day (PAD-775; owner, 2026-10-27).**
    - **Automatic paths skip.** A student holding a live invitation (sent/queued, unanswered) for
      another class on the same club-local day as this class (R-023 wall date, with any coach, the
      same day as config rule 6e) is skipped by every automatic path: automatic rounds, the
      semi-automatic queue and suggestions, and group 0 (the waiting list). The stage is
      `pending_invite_same_day`, shown to the coach like every stage. A live invitation for a class
      on another day never blocks.
    - **Eligible again on resolution.** The student is eligible again as soon as that invitation is
      answered, expires, or is retired. Spot filled counts as retired.
    - **Manual invitations are not blocked.** The coach's own manual invitation to such a student
      goes through; the suggestions list shows the `pending_invite_same_day` stage, so the coach can
      see it before inviting.
    - **Accepting closes the others.** When a student accepts one invitation, their other live
      invitations for classes that same club day are retired with a new reason, `booked_same_day`
      ("Já inscrito noutra aula"). They are not a 'no' (rule 18 does not apply).

    It follows config rule 6e's switch (coordinator, 2026-10-28; the owner may reverse it): with
    `noSameDayClass` off nothing is skipped, and a yes withdraws only the invitations of classes whose
    coach keeps it on. (`evaluate_candidates` via `_same_day_live_offers`; the withdrawal is
    `_withdraw_same_day_offers`, in the yes's one commit, on the student's and the coach-recorded
    yes. `booked_same_day` fits `retired_reason`'s 16 characters; both shells label it through
    `retiredInviteLabelKey`.)

19. **A coach withdraws a live invitation (PAD-548).** `DELETE
    /api/app/notify/invitations/<event_id>` by the invitation's coach (403 for any other coach,
    404 for an unknown id).
    - **Live (`sent` or `queued`):** under rule 10's locks — the vacancy, then its class; a manual
      invitation locks its own row, as rule 17's guard does — the invitation is re-read. If the
      student's yes won meanwhile, the answer is `{"action": "confirmed"}` and nothing is written.
      Otherwise, in ONE commit: `status = "expired"`, `answer` stays NULL,
      `withdrawn_by_coach_at` is stamped, the invitation message is retired with flushes only (its
      bubble reads "Vaga preenchida" on both shells and the buttons are gone — the same retire as
      rule 15), the bubble edit is queued with `on_commit` BEFORE that commit, the student's
      waiting-list entry for the class is closed like a "no" (`notifications.waiting-list` rule 15,
      no credit spent) and the vacancy's `last_activity_at` is stamped. After the commit the
      decline follow-up runs: the vacancy stays open and the next candidate is asked at once —
      the same message volume as a student's decline (one next invitation), unlike the
      coach-recorded "no", which waits for the tick (rule 16). The coach's live event is
      `notification_responded` with `response: "withdrawn"`; the student gets no message (the
      retired bubble is the telling, PAD-501). Answer `{"action": "withdrawn"}`.
    - **For the engine it is a "no" (rule 18):** `_declined_player_ids` and `_still_invitable`
      count `withdrawn_by_coach_at IS NOT NULL` exactly as `answer == "no"`, so no automatic path
      asks the student again for that occurrence — any spot, any round, group 0 included. The coach
      may still invite them by hand.
    - **A late yes is refused:** a student's yes on a withdrawn invitation changes nothing and sends
      nothing — no enrolment, no decline notice, no waiting-list offer (the coach removed them) —
      and answers `spot_filled`; both shells already show "Vaga preenchida". Rule 17's guard decides
      it under its lock, keyed on `withdrawn_by_coach_at` — a late yes on a spot that went to
      someone else keeps rule 17's waiting-list offer.
    - **Not live:** `confirmed` → `{"action": "confirmed"}`, nothing written, whether the yes landed
      before the first read or under the lock — one answer for one state (a student leaves a class
      through attendance); already `expired` → `{"action": "<outcome>"}` as
      `calendar.event-detail` rule 16 computes it, nothing written, so a repeated delete is a
      no-op; a class that is over → `{"action": "expired"}` after the stale sweep, as rule 9's coach
      answer does.
    - **Proven on Postgres:** a withdrawal racing the student's yes ends in exactly one of two
      states — enrolled and `confirmed` (the withdrawal answered `confirmed`), or withdrawn and not
      enrolled (the yes answered `spot_filled`) — never both and never neither; the mutant with the
      withdrawal's locks dropped fails that cell.

20. **The engine stops at the class's start (PAD-798, restating PAD-68; owner, 2026-10-30).** From
   the class's start time on the club's clock (`_instance_is_over`: start <= Lisbon now, or the
   class canceled or completed) the engine opens no vacancy and sends no invitation, first round or
   later. `trigger_invitations` returns nothing; `_send_invitation_batch` sends nothing; the tick
   (`process_invitation_batches`) expires the class's open vacancies and with them the invitations
   still out (rule 15), as before; a decline's follow-up, a waiting-list answer and a semi-automatic
   approval (`semi-auto-approval`) refuse the same way. Nothing here changed in PAD-798: the rule
   states, beside `notifications.manual` rule 10 (manual sends refused with 409 `CLASS_STARTED`),
   what the owner decided for every path, and its criteria pin it.
### Acceptance Criteria

#### An empty round logs its stage counts (rule 3d)
- **Given** an open vacancy on round 1 whose invitation group admits nobody: one roster student
  already enrolled in the class and one whose level the group's rule rejects
- **When** the engine sends round 1 (`trigger_invitations`, or the tick)
- **Then** the round counter moves to 2, no invitation is created, and one INFO line reads
  `empty round: vacancy <id> round 1 stages {'already_enrolled': 1, 'no_round_matched': 1}`, with no
  student id or name in it

#### A window that opens before the first reminder still invites (rule 1c)
- **Given** a one-off class Monday 18:00 Lisbon with `max_players=2`, one roster student enrolled and
  one free roster student, the coach's invitation start 72 h before and first reminder 48 h before,
  the occurrence not materialised, and the lesson walk run four days out
- **When** the `invite_start_lesson_<lesson>_<date>` job fires at 72 h before the class
- **Then** the occurrence is materialised, one structural vacancy is open and the free student holds
  one invitation; the reminder at 48 h then reminds the enrolled student and arms no second start

#### A class materialised inside its window is opened by the next tick (rule 1c)
- **Given** the same class with the default timings (reminder 48 h, invitations 24 h), materialised
  12 h before the class (created late, or opened), so `schedule_instance_jobs` arms no start job
- **When** `process_invitation_batches()` runs
- **Then** one structural vacancy is open and the free student holds one invitation; a second tick
  sends nothing more for that place

#### Materialising removes the lesson-level start job (rule 1c)
- **Given** an occurrence with `invite_start_lesson_<lesson>_<date>` armed
- **When** the occurrence is materialised
- **Then** the lesson-level job is gone and `invite_start_<instance>` is the occurrence's only
  start job; cancelling or moving the series' occurrence jobs removes or moves both families

#### The tick does not reopen an expired spot (rule 1c, rule 1d)
- **Given** a future class inside its window with one free place and one `expired` vacancy
- **When** `process_invitation_batches()` runs
- **Then** no vacancy is created and nothing is sent

#### The invitation start opens the free seat beside a filled spot (rule 1d, PAD-763)
- **Given** a class of 4 inside its window with 3 enrolled, one of whom gave the place up and a candidate filled it (3 seats held, one `filled` vacancy)
- **When** `trigger_invitations` runs
- **Then** exactly one never-filled spot is open and its invitations go to candidates who are not in the class; the filler is not asked

#### The tick reaches a class whose only spot is filled (rule 1d, PAD-763)
- **Given** the same class
- **When** `process_invitation_batches()` runs twice
- **Then** one never-filled spot is open after the first tick with its first batch out, and the second tick opens no other

#### The waiting list is offered the free seat first (rule 1d, PAD-763)
- **Given** the same class with a candidate on its waiting list
- **When** the tick opens the spot
- **Then** the first invitation is that candidate's, at round 0

#### An expired spot stays closed and the other free seats open (rule 1d, PAD-763)
- **Given** a class of 4 inside its window with 2 enrolled, one of whom gave the place up, and that spot (side left) `expired` after its rounds ran out (1 seat held, 3 free)
- **When** the tick runs
- **Then** two never-filled spots open and the expired one stays expired; once those two expire as well, the next tick opens nothing

#### A full class with a filled spot opens nothing (rule 1d, PAD-763)
- **Given** the same class with capacity 3 (all seats held)
- **When** the tick runs
- **Then** no spot is opened and nothing is sent

#### A tick and a start racing on one class open it once (rule 1c, Postgres)
- **Given** a materialised class inside its window with one free place and no vacancy
- **When** the tick's scan and `trigger_invitations` run at once on two connections
- **Then** exactly one vacancy exists for the class and the free student holds exactly one
  invitation; a mutant that counts the places outside the class lock creates two

#### With reminders off, the window opens the places and asks nobody on the roster (rule 1c)
- **Given** the class of the first criterion with the coach's first reminder of type `none` and the
  invitation start 72 h before, the occurrence not materialised
- **When** the `invite_start_lesson_<lesson>_<date>` job fires
- **Then** the free student holds one invitation and no `ask_<instance>_<student>_*` job is armed for
  the enrolled student: the job touches never-filled places only; the roster is asked by reminders

#### The engine itself opens the place when called (control for rule 1c)
- **Given** the class of the second criterion
- **When** `trigger_invitations` is called by hand inside the window
- **Then** one structural vacancy is open and the free student holds one invitation

#### A window already open at derivation is opened by the catch-up (rule 1c, PAD-661)
- **Given** the class of the first criterion with the coach's invitation start "7 days before at
  19:30" and first reminder 48 h before, the occurrence not materialised, and the lesson walk run
  five days before the class (the window opened two days earlier)
- **When** the walk runs and, two minutes later, the `invite_start_lesson_<lesson>_<date>` job fires
- **Then** the occurrence is materialised and the place is opened: in semi-automatic mode one
  `pending` vacancy, one approval prompt and one `replacement_approval` message, no student
  invitation; in automatic mode one `not_required` vacancy and one invitation to the free student

#### A second derivation inside the window re-fires nothing (rule 1c, PAD-661)
- **Given** the class of the previous criterion after its catch-up fired
- **When** the lesson walk runs again inside the window and ticks follow
- **Then** no `invite_start_lesson_<lesson>_<date>` job is armed (the date is materialised), the
  class still has one vacancy and the coach one prompt (or the student one invitation)

#### A materialised date never gets the catch-up (rule 1c, PAD-661)
- **Given** the class of the second criterion (materialised inside its window, no start job)
- **When** the lesson walk runs
- **Then** no `invite_start_lesson_<lesson>_<date>` job is armed for that date: the instance path
  (the tick) owns it

#### A timing of `none` arms no catch-up (rule 1c, PAD-661)
- **Given** an occurrence not materialised, still ahead, with the coach's invitation start of type
  `none`
- **When** the lesson walk runs
- **Then** no `invite_start_lesson_<lesson>_<date>` job is armed

#### A later window pauses a started spot (rule 11a, PAD-776)
- **Given** a class tomorrow 09:00, the coach's invitation start 24 h before (open), one spot whose
  first batch of three is sent and unanswered
- **When** the coach saves an invitation start of 6 h before and the sweep runs three hours later
- **Then** nobody else is invited and the three invitations are still live
- **And** the first tick after the new window opens (02:00 UTC) invites the next batch

#### An earlier window starts a held spot at the next tick (rule 11a, PAD-776)
- **Given** the class with the coach's invitation start 6 h before and a spot opened by a decline,
  held until that window (`invite_not_before` 02:00 UTC tomorrow)
- **When** the coach saves an invitation start of 24 h before
- **Then** the next tick invites the first batch

#### 'Yes, right now' and manual invitations ignore a later window (rule 11a, PAD-776)
- **Given** a semi-automatic coach's spot approved 'Yes, right now', its first batch sent
- **When** the coach saves an invitation start of 6 h before
- **Then** the spot keeps no `invite_not_before` and the next sweep past the inactivity time invites
  the next batch
- **And** a manual invitation by the coach to another student goes out

#### The tick stamps a missing window still ahead and holds the spot (rule 11a, PAD-776 part 2)
- **Given** an automatic spot of a class tomorrow 09:00 started under "24 hours before" with no `invite_not_before` and 3 invitations live, and the timing then saved as "6 hours before" without re-timing it
- **When** the sweep runs at 16:00 UTC today
- **Then** the spot's `invite_not_before` is 02:00 UTC tomorrow, no invitation is sent and the 3 live ones stay live; with the timing still "24 hours before" nothing is stored, and a spot approved 'Yes, right now' keeps no window

#### A save by a coach who is not the primary coach leaves the class alone (rule 11a, PAD-776)
- **Given** a started spot of a class whose second coach is not its primary coach
- **When** the second coach saves an invitation start of 6 h before
- **Then** the class keeps its primary coach's window and the next batch goes out

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

#### A wave whose rules read per-student facts costs the same for a big roster (rule 12a, PAD-788)
- **Given** two coaches with 20 and 40 roster students, attendance history with unjustified and justified absences, an eligibility bar of fewer than 2 unjustified absences, and invitation groups that use `level one_above_vacancy`, `side same_as_vacancy`, `has_makeups is_true`, `level same_as_vacancy` and `subscription_status equals active`
- **When** every group is evaluated for one open vacancy of each coach
- **Then** the 40-student evaluation issues no more SQL statements than the 20-student one plus two per group
- **And** every student's stage is the one the per-student evaluator gives: `eligibility` exactly when the bar fails, otherwise `invited` exactly when the group's rules pass

#### A filled vacancy stops inviting, whichever door filled it (PAD-317)
- **Given** an open vacancy with one `sent` invitation and one `queued` invitation out for it
- **When** the spot is filled by any path — a student accepting (a waiting-list student's group-0 invitation included), a coach accepting for them, an accepted join request, or capacity reconciliation
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
- **When** the spot reaches a later round, a second spot of the class opens, the spot is re-created, or the class's waiting list is asked first (group 0)
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

#### A spot whose side flips withdraws its live round-1 invitations of the old side (rule 2d, PAD-581)
- **Given** a class of 4 with 1 left and 1 right going, two never-filled spots sided left and right, the left spot's round-1 invitations out to Ana and Bia (left) and Carla (both)
- **When** Duarte, a left student, says yes on the right spot (a widened round)
- **Then** in that one commit the left spot re-counts to right (2 left / 1 right going), Ana's and Bia's invitations are expired with `retired_reason = "side_balanced"` and their bubbles read `response: "side_balanced"`
- **And** Carla's invitation stays live, and nobody's answer is recorded

#### A batch invites the side its spot re-counts to (rule 2d, PAD-581)
- **Given** that left spot, now sided right
- **When** its next batch runs
- **Then** round 1 invites right players first, and Ana and Bia are not invited by round 1 of that class again

#### A balance-withdrawn student may join the waiting list while the class has places (rule 2d, PAD-581)
- **Given** Ana's invitation withdrawn for balance, the class with a place open and open spots hidden
- **When** Ana joins the class's waiting list from the bubble
- **Then** she holds an active row; a student never invited to the class is still refused `has_spots`
- **And** group 0 asks Ana for a left or side-less spot of that class, never a right one

#### Every fill retires the others as "spot_filled" (rule 15, PAD-609)
- **Given** Ana and Bruno invited to Friday's one spot, and Carla and Dinis invited to it by hand
- **When** the coach records Ana's yes (or Ana answers yes herself)
- **Then** Bruno's bubble reads `response: "spot_filled"` and offers the waiting list
- **And** once that yes takes the last place, Carla's and Dinis's manual invitations are expired with `response: "spot_filled"`; on a class with a place left they stay live
- **And** a manual invitation the coach sends to a class that is already full stays live through the tick
- **And** a withdrawn invitation and one for a class that started still read `"expired"`

#### An invitation does not time out (rule 5, PAD-609)
- **Given** Bruno's round-1 invitation unanswered past maxInactiveTime, and round 2 sent
- **When** the spot is still open
- **Then** Bruno's invitation is still live, he is not invited again for it, and his yes takes the spot

#### An invited student joins the waiting list with open spots hidden (rule 15, PAD-609)
- **Given** the coach's open spots hidden, and Bruno's invitation retired because Ana took the spot
- **When** Bruno joins that class's waiting list from the bubble
- **Then** he holds an active row on it
- **And** Carla, never invited, Eva, who answered "no", and Filipe, whose invitation the coach withdrew, are still refused `not_visible`

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

#### A student who lost the spot joins that class's waiting list from the message (rule 15a, PAD-577)
- **Given** Carla's invitation for Friday's class reads "Vaga preenchida" because Bruno accepted first, on web and on iOS
- **When** Carla presses "Juntar-me à lista de espera" on it
- **Then** she holds an active row on that occurrence's waiting list (origin `student`, this class only) and the bubble reads "Estás na lista de espera" with "Sair"
- **And** her retired invitation for a class that has started, or one that timed out, or one the coach withdrew, shows no button
- **And** the bubble shows no button when she is already on that class's list

#### A manual invitation counts for the one-offer skip (PAD-497, rule 18)
- **Given** a student holding the coach's live manual invitation for the class
- **When** the engine starts a spot of that class
- **Then** it sends that student no automatic invitation on top

#### No invitation is left without its message (PAD-497, rule 18)
- **Given** an automatic or manual invitation whose message fails to send, or is withheld by a backstop
- **When** the send returns or raises
- **Then** no live invitation without a message remains for that student

#### A live invitation that day from another coach skips the student (rule 18c, PAD-775)
- **Given** class A tomorrow 09:00 (coach A, rule 6e on) with one spot open and a student holding a
  live manual invitation from coach B for B's class the same day at 12:00
- **When** class A's first wave runs
- **Then** the student is not invited and their stage is `pending_invite_same_day`; the others are invited

#### A live invitation for another day does not block (rule 18c, PAD-775)
- **Given** the same, B's class the day after
- **When** class A's first wave runs
- **Then** the student is invited

#### The student is eligible again once that invitation ends (rule 18c, PAD-775)
- **Given** the student skipped for B's live invitation
- **When** that invitation expires
- **Then** class A's next wave no longer gives them `pending_invite_same_day`

#### A yes withdraws the same-day invitations, and that is not a 'no' (rule 18c, PAD-775)
- **Given** the student invited to class A, then by hand to B's class the same day (B keeps rule 6e on)
- **When** the student says yes to class A
- **Then** B's invitation is `expired` with `retired_reason` `booked_same_day`, no `answer`, and its
  bubble reads "Já inscrito noutra aula"

#### Rule 6e off turns rule 18c off (rule 18c, PAD-775)
- **Given** coach A with `noSameDayClass` off and the student holding B's live invitation that day
- **When** class A's first wave runs
- **Then** the student is invited
- **And** a yes to class A leaves the invitation of a class whose coach has `noSameDayClass` off live

#### A manual invitation is not blocked (rule 18c, PAD-775)
- **Given** the student holding B's live invitation that day
- **When** coach A invites them by hand to class A
- **Then** the invitation goes out

#### Only one open vacancy per departing player per occurrence (PAD-303)
- **Given** an open vacancy on instance 10 for player 7
- **When** a second open vacancy on instance 10 for player 7 is inserted
- **Then** the database refuses it (`uq_vacancies_open_original_player`)
- **And** an expired vacancy on instance 10 for player 7 next to the open one is accepted, and two structural vacancies (no departing player) on instance 10 are accepted

#### Two spots sending at once never offer one student twice (PAD-509)
- **Given** a class with two open spots, two free students and `maxSimultaneous` 1
- **When** both spots send their first invitation at the same moment
- **Then** each student holds at most one live offer for the class, and each spot asks one of them

#### An accept and a sender on the same spot never deadlock (PAD-509)
- **Given** a student answering yes on spot V1 while the engine is choosing another student for V1
- **When** the accept holds V1 and the sender reaches its lock section
- **Then** both finish without a database deadlock: the sender waits for V1 (rule 10's order) and then finds the spot taken

#### A coach withdraws a pending invitation (rule 19, PAD-548)
- **Given** a class with one open vacancy whose current invitation to Dinis is `sent`, Dinis also on the class's waiting list, and Eva the next eligible candidate
- **When** the coach calls `DELETE /api/app/notify/invitations/<Dinis's event id>`
- **Then** the answer is `{"action": "withdrawn"}`, Dinis's invitation is `expired` with `answer` NULL and `withdrawn_by_coach_at` set, his bubble's metadata is `responded: true` with a non-answer response, his waiting-list entry is inactive with no credit spent
- **And** the vacancy is still `open` and Eva holds a new `sent` invitation, created after the withdrawal's commit
- **And** the coach received `notification_responded` with `response: "withdrawn"` and Dinis received no new message

#### A withdrawn student is not asked again (rule 19)
- **Given** Dinis's invitation for the occurrence was withdrawn and a second vacancy opens on the same occurrence
- **When** the engine sends the next batch for that occurrence
- **Then** Dinis is tagged `declined_this_class` in `evaluate_candidates` and receives no invitation, while a manual invitation from the coach still reaches him

#### The coach's recorded answer reaches the student's chat (rule 9, PAD-563)
- **Given** Dinis holds a `sent` invitation whose message shows Yes/No in his chat
- **When** the coach records his "yes" (or his "no") from the class detail
- **Then** the invitation message's metadata reads `responded: true`, `response: "yes"` (or `"no"`), `answeredBy: "coach"`, written in the one commit that records the answer
- **And** a `message_edited` for that message is published to Dinis and the coach after that commit, never before it
- **And** both shells show "Marcado como aceite pelo treinador" (or "… recusado …") with no buttons, to Dinis and to the coach, without a reload (test id `invite-recorded-by-coach` replaces `invite-accepted` / `invite-declined` on that bubble; the Yes/No buttons are `invite-respond-yes` / `invite-respond-no` on web, `message-respond-yes` / `-no` on iOS)

#### A manual invitation's recorded answer reaches the chat too (rule 9, PAD-563)
- **Given** a manual invitation (no vacancy) still `sent`
- **When** the coach records the answer
- **Then** the same metadata and the same `message_edited` follow, under the invitation row's own lock

#### A student's answer after the coach's is refused (rules 9, 17, 18, PAD-563)
- **Given** the coach recorded Dinis's "no"
- **When** Dinis taps "yes"
- **Then** the answer is `declined`, Dinis is not enrolled and his bubble still reads declined by the coach
- **And** after a coach-recorded "yes", Dinis's "no" answers `confirmed` and he keeps the spot

#### A late yes on a withdrawn invitation is refused (rule 19)
- **Given** Dinis's invitation was withdrawn and the vacancy is still open
- **When** Dinis answers "yes" on his invitation
- **Then** the answer is `spot_filled`, nothing is written, Dinis is not enrolled, and no message or waiting-list offer is sent

#### A withdrawal racing the student's yes ends in one state (rule 19, Postgres)
- **Given** Dinis's invitation is `sent` on an open vacancy
- **When** the coach's withdrawal and Dinis's yes run at once on two connections
- **Then** either Dinis is enrolled, the invitation is `confirmed` and the withdrawal answered `confirmed`, or Dinis is not enrolled, the invitation is withdrawn and the yes answered `spot_filled`
- **And** the same cell fails when the withdrawal takes no vacancy or class lock

#### A freed spot asks the side the class is short of (rule 2c, PAD-541)
- **Given** a class of 9 whose players play 6 left and 3 right, and two left-side players who cancel
- **When** their vacancies open, one after the other or at the same time
- **Then** the first asks `right` (5 / 3 one at a time, 4 / 3 with both already out) and the second asks `left` (4 / 4 counting that spot; a tie keeps the leaver's side), so the class can end 5 / 4

#### A tie keeps the leaver's side (rule 2c)
- **Given** a class of 3 left and 3 right still coming, and a right-side leaver
- **When** the leaver's vacancy opens
- **Then** it asks `right`, as before PAD-541

#### No sided roster keeps the leaver's side (rule 2c)
- **Given** a coach whose roster has no `left` or `right` player
- **When** a player cancels
- **Then** the vacancy keeps the leaver's side (none), exactly as before

#### Two cancellations at once still balance (rule 2c, Postgres)
- **Given** the 6 left / 3 right class above
- **When** both left-side leavers' vacancies are created on two connections at once
- **Then** the two vacancies are one `right` and one `left`, never two `right`

#### A freed spot in a class that is not full counts the players going, not the never-filled spots (rule 2c, PAD-565)
- **Given** a class of 16 with 6 left and 2 right enrolled, whose 8 never-filled spots are already open with rule 2b's sides (6 right, 2 left)
- **When** a left-side player leaves, through the coach's absent mark, a reminder "no" or a cancellation
- **Then** the freed spot asks `right` (5 / 2 going), not `left` (the 7 / 8 that counting the never-filled spots gave)
- **And** the same leaver gets `right` when no never-filled spot is open yet, and the never-filled spots then balance around that spot (rule 2b counts it)

#### The ticket's table holds in a full class too (rule 2c, PAD-565)
- **Given** a full class of 2 left and 2 right, or of 3 left and 1 right
- **When** a left-side player leaves
- **Then** the first asks `left` (1 / 2) and the second asks `right` (2 / 1)

#### A write that opens a spot answers before the first invitation (rule 1b, PAD-733)
- **Given** a class tomorrow 09:00 with the invitation window open, one enrolled student, three
  eligible others, `maxSimultaneous` 3, and a scheduler running in the process
- **When** the student cancels (`POST /notify/cancel_attendance`), or the coach marks them absent
  (`POST /class_instance/presences/confirm`)
- **Then** the request answers with no invitation written and one job `invite_now_<instance>`
  armed; running the job invites the three; running it again invites nobody more; the sheet's reply
  carries `notifiedPlayers: []` and `invitationsQueued: true`

#### A student's "no" answers before the next invitation (rule 1b, PAD-733)
- **Given** one spot, `maxSimultaneous` 1, three candidates, the first invited, a scheduler running
- **When** the first student answers "no"
- **Then** the answer is `declined` with nobody else invited, one job
  `decline_next_<vacancy>_<event>` is armed, running it invites the second student, and a repeated
  "no" arms nothing and invites nobody

#### A semi-automatic cancellation answers before the coach's approval prompt (rule 1b, PAD-733)
- **Given** the first criterion's class with approval required and a scheduler running
- **When** the student cancels
- **Then** the request answers with the vacancy pending, no prompt and no approval message
  written, and one job `approval_now_<instance>_<vacancy>` armed; running the job writes one prompt and one
  `replacement_approval` message; running it again writes nothing more; without a scheduler the
  prompt is written inside the request

#### A decline during a running approval job still gets its prompt (rule 1b, PAD-764)
- **Given** a semi-automatic class with two enrolled students and the scheduler running, the first
  student's approval job still building its queue
- **When** the second student cancels
- **Then** both vacancies end pending with one prompt and one approval message each, and nobody is
  invited

#### With no scheduler in the process the write still invites inline (rule 1b, PAD-733)
- **Given** the sheet of the first criterion and no scheduler (the CLI, the plain test suite)
- **When** the coach marks the student absent
- **Then** the three are invited inside the request and the reply lists them in `notifiedPlayers`
  with `invitationsQueued: false`

#### No round opens or continues once the class has started (rule 20, PAD-798)
- **Given** an automatic class at 19:30 Lisbon on a summer day (18:30 UTC) and an absent student
  whose place a candidate could take
- **When** invitations are triggered at 19:29, at 19:30 and at 19:45 Lisbon
- **Then** the 19:29 trigger invites the candidate; the 19:30 and 19:45 triggers open no vacancy and
  invite nobody
- **And** for a vacancy whose first batch went out at 19:29, the tick at 19:45 sends no further
  invitation, expires the vacancy, and expires the invitation still out
