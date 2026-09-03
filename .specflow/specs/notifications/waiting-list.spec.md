---
id: notifications.waiting-list
status: implemented
depends_on: [notifications.invitations, eligibility.rules]
implements: ../../specs-business/notifications/coach-fills-vacancies-automatically.business.md
governed_by: []
---

# notifications.waiting-list


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
