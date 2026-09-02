# notifications — Notification Engine

## notifications.config

---
id: notifications.config
status: implemented
depends_on: [auth.login]
---

### Intent
Coaches configure the notification engine: timing, restrictions, matching rules, tiebreakers, and message templates.

### Entities
- **NotificationConfig** (`notification_configs`): coach_id (unique), auto_notify_enabled, invitation_mode (automatic|semi_automatic), priority_criteria (JSON), restrictions (JSON), rounds (JSON), notification_groups (JSON), message_templates (JSON), reminder_timing (JSON), invitation_start_timing (JSON), invitation_groups (JSON), tiebreakers (JSON) — plus, **pending PAD-128/PAD-130**: eligibility_rules (JSON, nullable), open_spots_visible (bool, nullable)

### Rules
1. One config per coach (upserted on first access)
2. `auto_notify_enabled` toggles the automatic invitation engine
3. `invitation_mode`: `"automatic"` (default) or `"semi_automatic"`. Only relevant when `auto_notify_enabled` is true. In `semi_automatic` mode, vacancies require coach approval before the engine sends invitations (see notifications.semi-auto-approval); in `automatic` mode behavior is unchanged
4. `reminder_timing`: `{type: "hours_before", value: N}` or `{type: "days_before", days: N, time: "HH:MM"}`
5. `invitation_start_timing`: when to start sending invitations after a vacancy
6. `restrictions`: maxSimultaneous, maxTotal, maxInactiveTime, minTimeBeforeClass, maxInvitesPerStudentPerDay, quietHours, excludedPlayers, excludeUnpaidSubscription
6a. **(PAD-136)** `quietHours` is a **club-local wall clock** window of **22:00–07:00**, evaluated against
   the club timezone (`Europe/Lisbon`), consistent with `calendar` rule 6. The bounds are
   currently fixed constants — `quietHours` carries only `{enabled}` and no start/end — so
   "22:00–07:00" is the behaviour, not a default the coach can override. Because instants are
   stored as naive UTC, the check MUST convert to club-local before comparing the hour;
   comparing a UTC hour makes the window drift to 23:00–08:00 local through Portuguese summer
   time (WEST = UTC+1) while reading correctly in winter (WET = UTC+0). Only restrictions with
   wall-clock semantics need this conversion: `minTimeBeforeClass` (a duration) and `maxTotal`
   (a count) carry none. `maxInvitesPerStudentPerDay` DOES carry them — see rule 6b.
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
7. `invitation_groups`: ordered rule-based groups for matching (attribute, operation, value)
7a. **(pending PAD-128)** `eligibility_rules` (nullable) and `open_spots_visible` (nullable) are the **coach-standard tier**
   of `eligibility.rules` and `eligibility.open-spot-visibility`. `NULL` means unset at this tier,
   and unset is not a value — see `eligibility.cascade` rule 1. They round-trip through
   `GET|POST /api/app/notify/config` as `eligibilityRules` and `openSpotsVisible`.
7b. **(pending PAD-128)** `invitation_groups` and `eligibility_rules` are **separate settings with separate meanings**:
   groups order who gets asked first, eligibility decides who may join at all. Neither is derived
   from the other, and existing coaches' `invitation_groups` are never migrated into
   `eligibility_rules` (`eligibility.rules` rule 10).
7c. **(pending PAD-132)** The `subscription_status` group attribute and the `excludeUnpaidSubscription` restriction read
   `users.status`, which is **account activation**, not payment state. Both keep working as shipped;
   `eligibility.rules` rule 5 explains why eligibility offers no payments attribute. Renaming these
   two to say what they actually check is separate, deliberate work — not a silent side effect of
   the eligibility change.
8. `tiebreakers`: ordered ranking criteria (level, attendance, side, subscription status)
9. `message_templates`: customizable text for invite, confirm, decline, reminder, etc.
10. Updating timing configs reschedules all future scheduler jobs
11. `cancellationDeadlineHours` (default 24): hours before class start after which a student cancellation is still allowed but flagged as a "late cancellation" (see attendance.confirm). Exposed and round-tripped through `GET|POST /api/app/notify/config`

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

---

## notifications.reminders

---
id: notifications.reminders
status: implemented
depends_on: [notifications.config, classes.instances, attendance.presence]
---

### Intent
Automatically send class reminders to enrolled players at a configured time before the class.

### Rules
1. Scheduler creates a DateTrigger job per lesson occurrence: `reminder_lesson_{lesson_id}_{date}`
2. At trigger time: materializes instance (if not exists), calls `send_class_reminders()`
3. Reminders sent to all presences for the instance
4. Players respond: confirm (yes) or decline (no) via `respond_to_reminder()`
5. Confirmation updates Presence.confirmed
6. Decline may trigger a vacancy for the invitation engine; in semi-automatic mode, the vacancy awaits coach approval before any invitations are sent (see notifications.semi-auto-approval)
7. Reminders sent via in-app messaging (system message in conversation)
8. Push notification also sent
9. Only the latest reminder for a given (player, instance) is actionable (PAD-49). When a newer reminder is sent for the same (player, instance), every prior reminder message for that pair that the player has NOT yet actioned is marked **superseded** (`msg_metadata.superseded = true`). A superseded reminder renders its action area as a disabled "expired" indicator instead of live Yes/No buttons; responding to it is a no-op. Reminders the player already actioned (confirmed/declined) keep their existing status badge and are never marked superseded. Superseding is idempotent and is delivered to live clients via a `message_edited` event so the buttons update without a reload.
10. A reminder is **expired** once its class has started, or the instance is canceled/completed (PAD-68). The class is closed: nothing about its roster can still usefully change.
    - `respond_to_reminder()` on an expired reminder is a no-op returning `{"action": "expired"}`. It does NOT update Presence (the coach's attendance record for a class that happened is authoritative), does NOT create a Vacancy, and does NOT trigger replacement invitations.
    - The un-actioned reminder messages for that (player, instance) are marked `superseded = true` + `expired = true` and pushed to live clients via `message_edited`.
    - Clients also derive expiry from `msg_metadata.startsAt`, so reminders already sitting in message history stop offering Yes/No the moment their class passes, with no data backfill.
    - The invitation engine enforces the same rule independently: `trigger_invitations()` and the `_send_invitation_batch()` send chokepoint refuse to act for a class that has started, and expire any still-open Vacancy instead. This backstops every fan-out path (scheduler jobs, batch processor, round advance, decline-driven next-invite, and late responses to stale invite messages).
11. A player's answer is always durably recorded (PAD-69). If no Presence row exists for the (player, instance) when they respond, one is created — otherwise the answer is dropped and the next reminder pass treats them as never having replied.
12. Responding is **idempotent** (PAD-94). Re-submitting the answer already on record for a (player, instance) is a no-op that returns the recorded action plus `"duplicate": True`. It sends no second `reminder_confirmed`/`reminder_declined` system message, creates no extra Vacancy, and does not re-drive the invitation engine — so N rapid taps on **No** produce exactly ONE decline message and ONE round of replacement invitations, not N.
    - "Already on record" means the Presence row still reflects that same answer **and** no un-actioned reminder message is pending for that (player, instance). A newer reminder (rule 9) is a fresh question and is always answerable, even with the same answer.
    - Changing the answer (`yes` → `no`, or `no` → `yes`) is never suppressed.
    - The invitation engine enforces the same guarantee independently: the decline path does not re-trigger invitations when the player's spot already has an open Vacancy with live (`sent`/`queued`/`confirmed`) invitations out for it.

### Acceptance Criteria

#### Reminder job fires
- **Given** a recurring lesson on Mondays at 10:00 with reminder timing "24 hours before"
- **When** the scheduler fires at Sunday 10:00
- **Then** the Monday instance is materialized (if needed)
- **And** reminder messages are sent to all enrolled players

#### Player confirms reminder
- **Given** player received a reminder for instance 10
- **When** they respond with action `yes`
- **Then** their Presence.confirmed = True

#### Player declines reminder
- **Given** player received a reminder for instance 10
- **When** they respond with action `no`
- **Then** their presence is updated
- **And** a Vacancy is created (if auto_notify_enabled)
- **And** if `invitation_mode` is `semi_automatic`, the vacancy is created with approval_status "pending" and no invitations are sent until the coach approves

#### Late response to a reminder for a class that already happened (PAD-68)
- **Given** a player who received a reminder for instance 10 and never answered it
- **And** instance 10's start time has now passed
- **When** they respond with action `no`
- **Then** the call returns `{"action": "expired"}`
- **And** no Vacancy is created and no replacement invitations are sent to any other player
- **And** their Presence attendance record is left untouched
- **And** the stale reminder message is marked `superseded = true` / `expired = true` so its Yes/No buttons are replaced by the "reminder expired" indicator

#### Invitation engine ignores classes that already started (PAD-68)
- **Given** an open Vacancy on an instance whose start time has passed
- **When** the invitation engine is asked to send a batch for it (by any caller)
- **Then** no invitation is sent and the Vacancy is marked `expired`

#### Response is always recorded (PAD-69)
- **Given** a player responding to a reminder for a future class with no Presence row for that (player, instance)
- **When** they respond with action `no`
- **Then** a Presence row is created recording the response
- **And** the follow-up reminder is not sent on the next reminder pass

#### Repeated identical responses are idempotent (PAD-94)
- **Given** a player who received a reminder for instance 10 and has already responded `no`
- **When** they respond with action `no` twice more (impatient re-tapping)
- **Then** the 2nd and 3rd calls return `{"action": "declined", "duplicate": True}`
- **And** exactly ONE `reminder_declined` system message exists for that (player, instance)
- **And** exactly ONE Vacancy exists for their spot
- **And** exactly ONE round of replacement invitations was fanned out (no candidate is invited twice)
- **And** the same holds for repeated `yes` (one `reminder_confirmed` message)
- **And** answering `yes` after `no` (a genuine change) is still processed normally

#### Newer reminder supersedes older reminder buttons (PAD-49)
- **Given** a player who received a first reminder (with live Yes/No buttons) for instance 10 and has not yet responded
- **When** a second reminder for instance 10 is sent to the same player
- **Then** the first reminder message is marked superseded (`msg_metadata.superseded = true`) and its action area renders as a disabled "expired" indicator (no live Yes/No buttons)
- **And** only the second (latest) reminder shows actionable Yes/No buttons
- **And** if the player had already confirmed/declined the first reminder, it keeps its status badge and is NOT marked superseded

---

## notifications.invitations

---
id: notifications.invitations
status: implemented
depends_on: [notifications.config, notifications.reminders, eligibility.rules]
---

### Intent
When a spot opens in a class (player drops out), the invitation engine invites students through
multi-round matching. The rounds are an **ordering** — who gets asked first — inside the floor set by
`eligibility.rules`. They decide priority; they never decide permission.

### Entities
- **Vacancy** (`vacancies`): lesson_instance_id, coach_id, original_player_id, side, level_id, status (open|filled|expired), approval_status (not_required|pending|approved|dismissed), current_round_number, current_batch_number, filled_by_player_id, last_activity_at, filled_at
- **NotificationEvent** (`notification_events`): coach_id, lesson_instance_id, player_id, message_id, vacancy_id, type (manual|auto), round_number, status (sent|confirmed|expired|queued)

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
   coach's entire roster. The same applies to the legacy rounds `same_level` criterion.
5. `process_invitation_batches()` runs every 2 minutes (IntervalTrigger):
   - Skips vacancies with approval_status "pending" or "dismissed"
   - Sends batched invitations (maxSimultaneous at a time)
   - Respects restrictions (quiet hours, max per student per day, etc.)
   - Expires unanswered invitations after maxInactiveTime
6. Player responds: `POST /api/app/notification/{event_id}/respond` with yes/no
7. If confirmed: Vacancy.status = "filled", player added to instance
8. If all decline or expire: moves to next round
9. Coach can manually record response: `POST /api/app/notification/{event_id}/coach_respond`

### Acceptance Criteria

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

---

## notifications.semi-auto-approval

---
id: notifications.semi-auto-approval
status: draft
depends_on: [notifications.config, notifications.invitations, messaging.conversations, messaging.messages]
---

### Intent
In semi-automatic mode, the invitation engine asks the coach for approval before sending replacement invitations. Each vacancy produces a replacement approval prompt showing who declined and the full ordered invite queue; the coach approves (now or at the invitation window), or dismisses and falls back to the manual flow.

### Entities
- **ReplacementApprovalPrompt**: coach_id, vacancy_id (unique — one prompt per vacancy), declined player info, full ordered invite queue (all eligible candidates across all rounds/groups, in invite order, at prompt-creation time), waiting-list disclosure (if a standing waiting-list match exists), status (pending|approved|dismissed), bundle reference (groups prompts created by a single presence confirmation), created_at, decided_at
- **Assistant conversation**: a system conversation between the platform assistant and the coach (new concept — today conversations exist only between users). One per coach; reuses the existing conversation/message machinery (SSE delivery, push notifications, unread counts). Approval prompts are delivered as messages with coach action buttons
- **Vacancy.approval_status** (defined in notifications.invitations): not_required | pending | approved | dismissed

### Rules
1. Applies only when `auto_notify_enabled` is true and `invitation_mode` is `semi_automatic`; in automatic mode vacancies get approval_status "not_required" and behavior is completely unchanged
2. In semi-automatic mode, every vacancy-creation path sets approval_status "pending" and creates a replacement approval prompt instead of sending invitations: player declines via reminder response, coach confirms presences marking players absent, and the `invite_start` scheduler job
3. One prompt per vacancy (idempotent): re-triggering invitations for a vacancy that already has a prompt does not create a duplicate
4. The prompt shows which student(s) declined and the FULL ordered invite queue — all eligible candidates across all rounds/groups, in the exact order the engine would invite them, computed at prompt-creation time. Exactness principle: the list shown to the coach is exactly the set of players who may receive invitations — the engine may never invite anyone not on the shown list. Eligibility is recomputed at send time using the same rules, which may shrink or reorder the list; a player who wasn't shown may be invited only because their eligibility changed between prompt creation and send time
5. If a standing waiting-list match exists for the vacancy, the prompt discloses it explicitly (e.g. "Player X from the waiting list will be added directly to the class"), since waiting-list fills place the player without an invitation
6. Every prompt is persisted as a message in the coach's Assistant conversation — the source of truth — regardless of which surface triggered it
7. Presence-confirmation surface: when confirming presences creates N vacancies, the frontend immediately shows one inline approval card bundling all N vacancies (declined players + invite queues concatenated). One decision applies to the whole bundle; the same bundle is also persisted in the Assistant conversation
8. Coach actions (three):
   - **"Yes, right now"** → approval_status "approved" and invitations are sent right away, bypassing the invitation window
   - **"Yes, at {window open time}"** → approval_status "approved"; invitations are sent when the invitation window opens (per `invitation_start_timing`). The button label shows the concrete window-open datetime
   - **"No"** → approval_status "dismissed"; the prompt is closed. The vacancy REMAINS OPEN (Vacancy.status unchanged) but the engine never sends invitations for it; the coach can still use the manual invitation flow (notifications.manual). Dismissal is terminal — the prompt cannot be re-approved
   When the invitation window is already open, only **"Yes, right now"** and **"No"** are offered (the scheduled option is meaningless)
9. Gating: `process_invitation_batches()` and the `invite_start` scheduler job skip vacancies with approval_status "pending" or "dismissed"; only "not_required" and "approved" vacancies are processed
10. Waiting-list auto-fill is also gated: in semi-automatic mode, standing waiting-list fills (`_check_waiting_list()`) do not run for a vacancy until it is approved, since they add a player without coach consent. Dismissed vacancies are never auto-filled from the waiting list
11. If a vacancy is filled or expired before the coach decides (e.g. via the manual flow), the pending prompt becomes stale and any decision on it is a no-op

### Acceptance Criteria

#### Prompt created on reminder decline
- **Given** a coach with auto_notify_enabled=true and invitation_mode="semi_automatic"
- **When** player Alice declines a reminder for instance 10
- **Then** a Vacancy is created with approval_status "pending" and no invitations are sent
- **And** a replacement approval prompt for the vacancy is delivered as a message in the coach's Assistant conversation, showing Alice as the decliner and the full ordered invite queue (all eligible candidates across all rounds/groups, in invite order)

#### Bundled card on presence confirmation
- **Given** semi-automatic mode and a class instance with players Alice and Bob
- **When** the coach confirms presences marking both Alice and Bob absent
- **Then** two Vacancies are created with approval_status "pending"
- **And** the frontend shows ONE inline approval card bundling both vacancies with their full ordered invite queues
- **And** the same bundled prompt is persisted in the Assistant conversation
- **And** one decision on the card applies to both vacancies

#### Prompt on scheduler invite-start path
- **Given** semi-automatic mode and the `invite_start` job firing for an instance with an unconfirmed spot
- **When** the job creates a vacancy
- **Then** the vacancy gets approval_status "pending", no invitations are sent, and a prompt is delivered in the Assistant conversation

#### Coach schedules approval for the invitation window
- **Given** a pending prompt whose invitation window (per invitation_start_timing) has not yet opened
- **Then** the prompt offers **"Yes, right now"**, **"Yes, at {window open time}"** (label showing the concrete window-open datetime), and **"No"**
- **When** the coach responds **"Yes, at {window open time}"**
- **Then** the vacancy becomes approval_status "approved"
- **And** invitations are sent when the invitation window opens, with eligibility recomputed at send time using the same rules (no one outside the shown list is invited unless their eligibility changed)

#### Coach approves immediately
- **Given** a pending prompt whose invitation window has not yet opened
- **When** the coach responds **"Yes, right now"**
- **Then** the vacancy becomes approval_status "approved"
- **And** invitations are sent right away, bypassing the invitation window

#### Window already open: reduced button set
- **Given** a pending prompt whose invitation window is already open
- **Then** the prompt offers only **"Yes, right now"** and **"No"** (the scheduled option is not shown)
- **When** the coach responds **"Yes, right now"**
- **Then** invitations are sent right away

#### Coach dismisses
- **Given** a pending prompt for a vacancy
- **When** the coach responds **"No"**
- **Then** the vacancy gets approval_status "dismissed" but Vacancy.status remains "open"
- **And** the engine never sends invitations for it (batch processor and scheduler skip it)
- **And** the coach can still send manual notifications for the instance
- **And** the prompt cannot be re-approved afterwards

#### Batch processor skips unapproved vacancies
- **Given** vacancies with approval_status "pending" and "dismissed"
- **When** `process_invitation_batches()` runs
- **Then** no NotificationEvents or invitation messages are created for those vacancies

#### One prompt per vacancy
- **Given** a vacancy that already has a replacement approval prompt
- **When** invitations are triggered again for the same vacancy
- **Then** no second prompt is created

#### Automatic mode unchanged
- **Given** a coach with invitation_mode="automatic" (default)
- **When** a vacancy is created on any path
- **Then** it gets approval_status "not_required", no prompt is created, and invitations are sent exactly as before

#### Waiting-list match disclosed in prompt
- **Given** semi-automatic mode and a vacancy for which player Carol has a standing waiting-list match
- **When** the replacement approval prompt is created
- **Then** the prompt explicitly discloses the match (e.g. "Carol from the waiting list will be added directly to the class")

#### Waiting-list fill waits for approval
- **Given** semi-automatic mode, a pending vacancy, and a player with an active standing waiting-list entry
- **When** the engine processes the vacancy
- **Then** the standing entry does NOT auto-fill the spot
- **And** after the coach approves, the waiting-list fill proceeds normally

---

## notifications.manual

---
id: notifications.manual
status: implemented
depends_on: [notifications.config, classes.instances]
---

### Intent
Coaches manually select players to notify about a class, bypassing the automatic matching engine.

### Rules
1. `POST /api/app/notification_manual` with instance info and player_ids
2. Creates NotificationEvents with type "manual"
3. Sends invitation messages to selected players
4. Players respond same as auto invitations
5. UI: ManualNotificationModal with searchable player selector
6. Selection rows (both search results and rows inside a notification group) are a single click target: clicking the checkbox, the avatar or the name each produce exactly one toggle of that player's selection. The row must not carry a click handler that competes with the checkbox's own change handler

### Acceptance Criteria

#### Send manual notifications
- **Given** an instance with 2 open spots
- **When** coach manually selects players [5, 8, 12] and sends
- **Then** 3 NotificationEvents created with type "manual"
- **And** invitation messages sent to all 3 players

#### Selecting a player from the modal
- **Given** the manual notification modal is open with a searched-for eligible student listed
- **When** the coach clicks the checkbox next to that student
- **Then** the student becomes selected and the send button counts them
- **And** clicking the student's name instead produces the same result
- **And** clicking the same target again deselects the student

---

## notifications.waiting-list

---
id: notifications.waiting-list
status: implemented
depends_on: [notifications.invitations, eligibility.rules]
---

### Intent
Players can join a waiting list for full classes. Standing waiting list entries with credits get priority.

### Entities
- **WaitingListEntry** (`waiting_list_entries`): lesson_instance_id, player_id, coach_id, standing_entry_id, is_active, joined_at. Unique: (lesson_instance_id, player_id)
- **StandingWaitingListEntry** (`standing_waiting_list_entries`): coach_id, player_id, credits_total, credits_used, expires_at, is_active

### Rules
1. **STALE — see PAD-124.** This rule describes a student-initiated join that has never been
   reachable: the real route is `POST /api/app/notify/respond_waiting_list`, it answers a
   `waiting_list_offer` message, and no client has ever called it or rendered the offer's Yes/No.
   The waiting list is coach-managed in practice. PAD-124 decides whether the path is wired or
   retired in favour of `classes.join-requests`; this rule is rewritten to match that decision
2. Standing entries are pre-paid slots (credits system)
   - `credits_total`: total credits purchased
   - `credits_used`: credits consumed
   - `expires_at`: expiration date
3. When a new instance is materialized, `_sync_standing_entries_for_new_instance()` auto-creates waiting list entries for standing members
3a. **(pending PAD-128) Fan-out is not a promise of placement.** A standing entry fans out to every upcoming class of
   the coach, and matching happens at fill time (rule 4a), not at fan-out time — a student's level
   and absence record change over time, so a bar evaluated at fan-out would be stale by the time it
   mattered. `activeClassCount` therefore reports how many classes the entry is queued for, not how
   many the student could actually be placed into.
4. Standing entries get priority when vacancies open (in semi-automatic mode, only after the vacancy is approved — see notifications.semi-auto-approval)
4a. **(pending PAD-128) Placement is gated by eligibility.** A waiting-list candidate is admitted only if they pass
   `effective_eligibility()` for that class (`eligibility.cascade`). Waiting-list candidates are
   **not** subject to the invitation rounds — they are being placed, not invited — so they are
   filtered by the bar and ranked by the configured priority criteria. With an unset bar, placement
   is unfiltered; that is the coach's configuration, not an engine decision.
4b. **(pending PAD-128) A student is never placed into a class they are already in.** Candidates are excluded if they
   already hold an enrolment association for that instance, **or** a presence for it with status
   `absent`. The second exclusion is what stops the student whose cancellation created the vacancy
   from being placed straight back into it.
4c. **(pending PAD-128) Placement honours the same restrictions invitations honour**: `restrictions.excludedPlayers`,
   `restrictions.excludeUnpaidSubscription`, and the availability-blocker filter of
   `calendar.student-blockers`. Rules 4b and 4c apply whether or not an eligibility bar is defined.
4d. **(pending PAD-128) Placement is silent enrolment**, and every guard above exists because of that: the student is
   added without being asked. Any path that adds a student without an invitation is held to the
   same guards.
5. `GET /api/app/waiting_list/{instance_id}` lists active entries
6. The coach manages standing entries from Settings > Notifications > Standing waiting list:
   - `GET /api/app/notify/standing_waiting_list` lists the coach's active entries
   - `POST /api/app/notify/standing_waiting_list` adds an entry (`playerId`, `credits`, `durationDays`)
   - `DELETE /api/app/notify/standing_waiting_list/{entry_id}` deactivates an entry
7. To pick the player to add, the section offers a type-ahead search backed by
   `GET /api/app/notify/player_search?q=<term>`, which returns `{ "players": [{ "id", "name" }] }`
8. `player_search` is scoped to the authenticated coach's own roster
   (`Association_CoachPlayer.coach_id`), matches `User.name` case-insensitively as a substring,
   orders by name, and caps the response (20 results). A blank/whitespace-only `q` returns an
   empty list rather than the whole roster
9. Each returned `id` is the **`Player.id`**, i.e. the same identifier
   `POST /standing_waiting_list` and `restrictions.excludedPlayers.playerIds` expect — never the
   `User.id`
10. Adding a standing entry fans out to one `WaitingListEntry` per upcoming class
    (`_fan_out_standing_entry()`). `waiting_list_entries` is UNIQUE on
    `(lesson_instance_id, player_id)` and removal only sets `is_active = False`, so the fan-out
    must **reactivate and re-link** an existing row for that pair rather than insert a second one.
    A row the player created themselves (`standing_entry_id IS NULL`) and that is still active
    keeps its origin — the coach's standing entry never takes it over
11. Expiry is **not** enforced on read: `GET /standing_waiting_list` filters on `is_active` only, and
    an entry is deactivated lazily (the invitation path skips and deactivates entries whose
    `expires_at` has passed). An entry can therefore be listed while already past its expiry, so the
    standing waiting list section must mark that state visually rather than assume every listed row
    is live:
    - An entry is **expired** when `expires_at` is strictly in the past relative to now. `expires_at`
      is a naive-UTC `DateTime` (an instant, not a calendar date), so an entry expiring later today
      is **not** yet expired — "expires today" is not a distinct state
    - `expires_at` is serialized by `.isoformat()` on a naive datetime, so it carries **no `Z` and no
      offset**. Clients must normalize it to UTC before parsing; parsing it as local time skews both
      the comparison and the displayed date by the host's UTC offset
    - An expired row renders de-emphasised using the app's existing muted/grey tokens
      (`text-muted-foreground`, `opacity-*`) — no new colour tokens — and shows an explicit
      localized "expired" label. The row's remove control stays at full emphasis and fully usable:
      an expired entry is precisely one the coach is likely to want to delete

### Acceptance Criteria

#### Coach searches for a player to add to the standing waiting list
- **Given** a coach on Settings > Notifications with the standing waiting list section open
- **When** the coach types part of one of their own players' names into the search box
- **Then** a dropdown lists the matching players, and players not on that coach's roster are absent

#### Selected search result can be added
- **Given** the search dropdown is showing a matching player
- **When** the coach selects that player and confirms the add dialog
- **Then** a StandingWaitingListEntry is created for that `Player.id` and the player appears in the
  standing waiting list with their credits and expiry

#### Expired standing entry is visually distinguished
- **Given** the coach's standing waiting list contains one entry whose `expires_at` is in the past and
  one whose `expires_at` is in the future
- **When** the coach opens Settings > Notifications > Standing waiting list
- **Then** the past-expiry row is de-emphasised with the app's existing muted/grey tokens and shows a
  localized "expired" label, while the future-expiry row keeps its normal emphasis and shows no such
  label
- **And** the remove button on the expired row remains fully visible and clickable

#### Join waiting list — UNREACHABLE, see PAD-124
- **Given** a full class instance
- **When** player joins waiting list
- **Then** a WaitingListEntry is created with is_active=True
- **Note** no client can perform the "when" — the endpoint has no caller and the offer message
  renders no Yes/No. This criterion has never been exercised by a real user; PAD-124 decides whether
  it is wired or replaced by `classes.join-requests`

#### Standing entry auto-sync
- **Given** a player with an active standing entry (5 credits, 2 used)
- **When** a new instance is materialized
- **Then** a WaitingListEntry is auto-created for that instance linked to the standing entry

#### An ineligible waiting-list member is not placed (pending PAD-128)
- **Given** a coach whose eligibility is `[{level, same_as_class}]`
- **And** a standing waiting-list member whose level does not match a class they are queued for
- **When** a vacancy opens in that class
- **Then** they are not placed and no credit is consumed
- **And** the vacancy proceeds to normal invitations

#### The student who cancels is not placed back into their own vacated spot (pending PAD-128)
- **Given** a student enrolled in a class who also has an active standing waiting-list entry
- **When** they cancel their attendance and the resulting vacancy is processed
- **Then** they are not placed back into that class
- **And** no credit is consumed
- **And** no `waiting_list_placed` message is sent to them
- **And** the vacancy is offered to other students

#### An already-enrolled member is not a placement candidate (pending PAD-128)
- **Given** a student already enrolled in a class who has an active standing waiting-list entry
- **When** another student's cancellation opens a vacancy in that class
- **Then** the enrolled student is not considered
- **And** the vacancy is offered to students who are not already in the class

#### Placement honours the excluded-players restriction (pending PAD-128)
- **Given** a coach with `restrictions.excludedPlayers` enabled naming a student
- **And** that student has an active standing waiting-list entry
- **When** a vacancy opens
- **Then** they are not placed

---

## notifications.activity

---
id: notifications.activity
status: implemented
depends_on: [notifications.invitations]
---

### Intent
Display a feed of notification events for the coach to track invitation history.

### Rules
1. `GET /api/app/notify/activity` returns NotificationEvent history for the coach
2. Each event includes: type, round_number, status, created_at, lesson instance info, player info
3. Displayed on dashboard (NotificationActivityBlock) and settings page

---

## notifications.toggle-class

---
id: notifications.toggle-class
status: implemented
depends_on: [notifications.config, classes.instances]
---

### Intent
Toggle notification engine on/off for a specific class.

### Rules
1. `POST /api/app/notify/toggle_class` with class reference
2. Updates `notifications_enabled` on the Lesson or LessonInstance
3. When disabled, no reminders or auto-invitations fire for that class

---

## notifications.class-reminders-manual

---
id: notifications.class-reminders-manual
status: implemented
depends_on: [notifications.reminders]
---

### Intent
Coaches manually trigger class reminders (outside the automatic schedule).

### Rules
1. `POST /api/app/notify/send_reminders` with class reference
2. Immediately sends reminders to all enrolled players
3. Uses same reminder flow as automatic reminders

---

## notifications.groups

---
id: notifications.groups
status: implemented
depends_on: [notifications.config]
---

### Intent
Define student notification groups for organizing who gets notified.

### Rules
1. `notification_groups` in config: list of `{id, label, enabled}` groups
2. `invitation_groups`: rule-based groups with matching criteria
   - Each group has rules: `[{attribute, operation, value}]`
   - Attributes: level, side, subscription status, etc.
   - Operations: equals, not_equals, in, not_in
   - The `side` attribute with `same_as_vacancy` operation is inclusive of "both": a candidate passes when their side equals the vacancy side, OR the candidate's side is "both", OR the vacancy side is "both"/null (see notifications.invitations rule 4a)
3. Groups determine invitation round matching order
4. `GET /api/app/notify/groups` returns groups for a specific class instance

---

## notifications.message-templates

---
id: notifications.message-templates
status: implemented
depends_on: [notifications.config]
---

### Intent
Customize the text of notification messages sent to players.

### Rules
1. Templates stored in `notification_configs.message_templates` JSON
2. Template keys: invite, confirm, decline, spot_filled, reminder, reminder_followup, reminder_confirmed, reminder_declined, waiting_list_offer, waiting_list_placed
3. Templates support placeholders (player name, class name, date, time)
4. Updated via `POST /api/app/notify/config`
5. Placeholders must render fully substituted with concrete values — a rendered message never contains a raw placeholder token (`{level}`, `{weekday}`, etc.) or a filler artifact such as the literal word "this" in a placeholder slot
6. The `{weekday}`, date, and time placeholders render in the **recipient coach's locale** (see settings.language), formatted via Flask-Babel — e.g. `pt` → "quarta-feira", `en` → "Wednesday". Never manually string-built from English day/month names. Fallback locale is Portuguese
7. When a class instance has no assigned level, the `{level}` placeholder renders an empty string (no filler word), leaving surrounding template text grammatical
8. Every template key always resolves to non-empty text. A stored template that is missing, `null`, not a string, or blank/whitespace-only falls back to the built-in default for the resolved locale (`DEFAULT_MESSAGE_TEMPLATES_PT` for `pt`, `DEFAULT_MESSAGE_TEMPLATES` for `en`). This applies to **every** template key, not just the reminder ones
9. The system never sends a message whose rendered body is empty or whitespace-only. If, after placeholder substitution and the rule-8 fallback, the text is still blank, the message is not sent at all
10. The fallback is resolution-time only: the stored JSON is never rewritten, so a blank the coach saved stays blank in `notification_configs.message_templates`. Every *read* resolves it — `GET /api/app/notify/config` returns the resolved (non-blank) templates, so the settings UI never presents an empty textarea for an un-customized key
11. Template defaults are resolved in the coach's own locale on every path, including the reminder-response, cancellation, invitation-response and waiting-list paths (which previously fell back to the English defaults regardless of `settings.language`)

### Acceptance Criteria

#### Declining a reminder with a blank template still sends the default confirmation
- **Given** a coach whose `message_templates` has `reminder_declined` saved as an empty string (or whitespace only), and an enrolled player with a pending reminder for an upcoming class
- **When** the player responds "no" (not coming)
- **Then** the automatic confirmation message sent back to the player is the built-in default for the coach's locale (e.g. pt → "Entendido, obrigado por avisares!")
- **And** no message with empty or whitespace-only text is ever created

#### Blank templates fall back for every message type
- **Given** a coach whose `message_templates` has *all* keys saved as empty strings
- **When** any template-driven automatic message is sent (invite, confirm, decline, spot_filled, reminder, reminder_followup, reminder_confirmed, reminder_declined, waiting_list_offer, waiting_list_confirm, waiting_list_placed)
- **Then** each message body is the built-in default for that key in the coach's locale, never blank

#### Weekday and level render in the coach locale with no artifacts
- **Given** a coach whose `language` is `pt` and whose reminder template is `"Olá {name}, tens aula de {level} esta {weekday} às {time}. Vens?"`, and a class instance on a Wednesday with no assigned level
- **When** a reminder is sent to an enrolled player
- **Then** the rendered message reads "esta quarta-feira" (Portuguese weekday, via Flask-Babel), not "esta Wednesday"
- **And** the `{level}` slot renders empty, so the message never contains the literal word "this"
- **And** no raw placeholder token remains in the delivered text

---

## notifications.student-block-preferences

---
id: notifications.student-block-preferences
status: implemented
depends_on: [notifications.invitations, notifications.manual, notifications.reminders, notifications.waiting-list, settings.profile, settings.role-scope, calendar.student-blockers]
---

### Intent
Give the STUDENT a standing, always-on switch over class-slot solicitations, independent of the
per-time-window availability blockers of `calendar.student-blockers`. A blocker says "not at that
hour"; these preferences say "not at all" — a student who does not want to be pinged about open
spots can say so once, from their own Settings, without having to carve out calendar windows.

Because a silenced student is invisible to the invitation engine, the coach must be able to see
that this is deliberate rather than assume the student is ignoring them. So the student may attach
a free-text reason, and that reason — together with a "notifications cut" signal — is shown to the
coach on the student's record in Players management.

Scope: class-slot solicitations only (automatic invitations, manual invitations, waiting-list
offers and attendance reminders). Direct messages between coach and student, class-cancellation
notices and "you got the spot" confirmations are NOT suppressed — silencing invitations must never
cut a student off from their coach.

### Entities
- **User** (`users`) — extends auth.login's User entity with four standing preference fields:
  - `notif_block_auto_invitations` (boolean, NOT NULL, default `false`) — the automatic
    suggestion/auto-invite engine stops considering this student eligible.
  - `notif_block_manual_invitations` (boolean, NOT NULL, default `false`) — the coach cannot
    manually invite this student to an open spot.
  - `notif_block_all` (boolean, NOT NULL, default `false`) — every class-slot solicitation is
    suppressed, including attendance reminders.
  - `notif_block_reason` (text, nullable) — the student's own free-text explanation, written by
    the student and readable by their coach.

### Rules
1. The three block levels are **independent** and may be set in any combination. `notif_block_all`
   is a superset in effect, not a replacement: switching it on does not switch the other two on,
   and switching it off does not switch them off.
2. The preferences are exposed on the per-user profile surface, which is already open to both
   roles: `GET /api/auth/me` returns `blockAutoInvitations`, `blockManualInvitations`,
   `blockAllNotifications` and `notificationBlockReason`; `PATCH /api/auth/me` accepts any subset
   of them. Fields absent from the payload are left untouched.
3. Partial updates must honour an explicit `false`. Sending `{"blockAllNotifications": false}`
   clears the flag; it is never swallowed as "no value supplied". (Boolean fields are read with an
   `in`-membership check, never a truthiness check — see the PAD-93 boolean regression.)
4. `notificationBlockReason` is trimmed; an empty string clears it to `NULL`. It is free text with
   no required format, and is never required in order to set a toggle.
5. **Automatic block.** When `notif_block_auto_invitations` OR `notif_block_all` is set, the
   auto-invitation eligibility engine (`get_eligible_students` and
   `_get_eligible_students_for_group`) drops the student from the candidate list, at the same
   point where `calendar.student-blockers` rule 5 filters window-blocked candidates. The student
   is therefore never counted in a round, never batched and never gets a `NotificationEvent`.
6. **Manual block.** When `notif_block_manual_invitations` OR `notif_block_all` is set,
   `send_manual_notifications` skips the student **before** the `NotificationEvent` is created, so
   no orphan "sent" event exists for an invitation that was never delivered. Every other selected
   student is still notified. `POST /api/app/notify/manual` reports the skipped students in the
   same `blocked` array used by `calendar.student-blockers` rule 10, each entry carrying an
   optional `reason` (the student's `notif_block_reason`, or empty when they gave none).
7. **Block-all.** When `notif_block_all` is set, the student additionally receives no attendance
   reminders: `send_class_reminders` skips them, still reminds everyone else, and reports them in
   its `blocked` array. A skipped student is never counted in `sent`.
8. **Hard backstop.** `_send_system_message` refuses to deliver any `notification_invite`,
   `notification_reminder` or `waiting_list_offer` to a recipient whose `notif_block_all` is set,
   whatever fired the send. This is the same delivery choke point and the same blockable
   message-type set as `calendar.student-blockers` rule 11, and the two conditions are additive:
   a send is suppressed if EITHER an availability blocker overlaps the class window OR the
   recipient has blocked all notifications. Neither the chat message nor the web/Expo push is
   created. The backstop is a safety net, not the primary enforcement — the earlier filters in
   rules 5–7 are what prevent orphan events and lying counts.
9. Message types outside that set are unaffected: plain chat (`text`), class-cancellation notices
   and `waiting_list_placed` confirmations are still delivered to a student who blocked everything.
10. **Coach visibility.** The coach-facing player payload
    (`_serialize_coach_player_relation`, and the identical dict returned by
    `Player.coach_player_info` used by `add_player`/`edit_player`) carries
    `blockAutoInvitations`, `blockManualInvitations`, `blockAllNotifications`,
    `notificationBlockReason`, and a derived `notificationsBlocked` that is true when any of the
    three flags is set. Both sites must carry the fields, or the signal disappears the moment a
    coach edits the student.
11. The student's record in Players management shows a "notifications cut" signal whenever
    `notificationsBlocked` is true, together with which levels are blocked and the student's
    reason when they gave one. This reason is deliberately coach-visible — the opposite posture to
    `calendar.student-blockers` rule 8, where blocker titles, descriptions and hours are the
    student's private calendar and are never exposed.
12. **Confirmation gate.** Switching `blockAllNotifications` ON requires an explicit confirmation
    dialog carrying the consequence: "Deixará de receber lembretes e qualquer aula que falte será
    considerada injustificada caso não confirme a sua indisponibilidade. Tem a certeza que
    pretende avançar?". The preference is persisted only after the student confirms; cancelling
    leaves the toggle off and writes nothing. Switching it OFF needs no confirmation.
13. The preferences are configured **only** from the student's Settings. No toggle, button or
    shortcut for them appears on the calendar.
14. All four preference fields are per-user and stay open to a student caller — they must not be
    swept up by the coach-only role check of `settings.role-scope` rule 6.

### Acceptance Criteria

#### Defaults are "receives everything"
- **Given** a newly created student who has never touched the preferences
- **When** `GET /api/auth/me` is read
- **Then** `blockAutoInvitations`, `blockManualInvitations` and `blockAllNotifications` are all `false`
- **And** `notificationBlockReason` is empty

#### Student blocks automatic invitations with a reason
- **Given** an authenticated student on Settings → Notifications
- **When** they switch on "block automatic invitations", type a reason and save
- **Then** `PATCH /api/auth/me` succeeds and a success notification is shown
- **And** after reloading the page the toggle is still on and the reason still shown

#### An explicit false is persisted
- **Given** a student whose `blockAllNotifications` is `true`
- **When** they PATCH `/api/auth/me` with `{"blockAllNotifications": false}`
- **Then** the response succeeds and a subsequent read returns `false`

#### The three levels are independent
- **Given** a student with `blockAutoInvitations` = `true`
- **When** they switch `blockManualInvitations` on and then off again
- **Then** `blockAutoInvitations` is still `true`
- **And** switching `blockAllNotifications` on leaves the other two unchanged

#### Blocking everything demands confirmation
- **Given** an authenticated student on Settings → Notifications
- **When** they switch on "block all notifications"
- **Then** a confirmation dialog appears warning that missed classes will count as unjustified
- **And** cancelling leaves the toggle off and sends no request
- **And** confirming persists `blockAllNotifications` = `true`

#### The auto engine stops considering a blocked student
- **Given** a student who would otherwise be eligible for an open spot in a class
- **And** whose `blockAutoInvitations` is `true`
- **When** auto-invitation eligibility is computed for that vacancy
- **Then** the student is not in the candidate list
- **And** no `NotificationEvent` is created for them

#### A manual invitation to a blocked student is skipped, not orphaned
- **Given** a coach manually selecting three students for an open spot, one of whom has
  `blockManualInvitations` = `true` and a reason "estou lesionado"
- **When** the coach sends the manual notifications
- **Then** the other two students receive their invitation messages
- **And** the blocked student receives no message and has no `NotificationEvent`
- **And** the response reports `sent` = 2 and lists the blocked student with their reason

#### Blocking everything also silences reminders
- **Given** an enrolled student whose `blockAllNotifications` is `true` and a class due a reminder
- **When** reminders are sent for that class
- **Then** the student receives no reminder message
- **And** the other enrolled students still receive theirs
- **And** the reported `sent` count excludes the blocked student

#### Blocking everything does not cut the student off from their coach
- **Given** a student whose `blockAllNotifications` is `true`
- **When** their coach sends them a normal chat message, and when a class they are enrolled in is cancelled
- **Then** both messages are delivered

#### The coach sees the signal and the reason
- **Given** a student with `blockAutoInvitations` = `true` and reason "vou estar fora até setembro"
- **When** their coach opens that student's record in Players management
- **Then** a "notifications cut" signal is shown on the record
- **And** the student's reason "vou estar fora até setembro" is readable by the coach

#### The signal survives a coach edit
- **Given** a coach viewing a student whose notifications are blocked
- **When** the coach edits that student and saves
- **Then** the returned player payload still carries the block flags and reason
- **And** the signal is still shown

#### No calendar control
- **Given** a student on the calendar
- **When** they inspect the calendar UI
- **Then** no toggle, button or shortcut for these notification preferences is offered there

### Notes
- Source: ticket PAD-112 (reported by `tomasmpacheco` via Discord).
- Distinct from `calendar.student-blockers` (PAD-28/PAD-107): those are time-window blockers
  evaluated against the class instance window; these are standing per-user preferences evaluated
  regardless of when the class is. The two compose additively at every enforcement point.
- The reason field's coach-visibility is a deliberate product decision from the ticket Q&A, and is
  the opposite of the privacy posture of availability blockers. The two must not share a code path.
- Out of scope, and pre-existing: the waiting-list auto-enrolment path (`_fill_from_waiting_list`)
  adds a student to a class outright without soliciting them, so it is an enrolment decision, not
  a notification. It is not gated by these preferences (nor by `calendar.student-blockers`). The
  `waiting_list_offer` message, which IS a solicitation, is gated.
- Direct messages / DMs are explicitly out of the initial scope per the ticket Q&A.
