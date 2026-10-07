---
id: notifications.waiting-list
status: implementing
depends_on: [notifications.invitations, eligibility.rules]
implements: ../../specs-business/notifications/coach-fills-vacancies-automatically.business.md
governed_by: []
---

# notifications.waiting-list


### Intent
Players can join a waiting list for full classes. When a spot opens, the students on the class's
waiting list are **asked first**: they get the invitation before the coach's invitation groups, in
the order they joined (PAD-446). Nobody is enrolled from the list without saying yes.

> Rule 1's client wiring landed with the PAD-124 build (decided 2026-09-04). Everything else in
> this spec is implemented, rules 3a/4a-4d included (they landed with PAD-128).

### Entities
- **WaitingListEntry** (`waiting_list_entries`): lesson_instance_id, player_id, coach_id, standing_entry_id, is_active, joined_at. Unique: (lesson_instance_id, player_id); indexed on standing_entry_id
- **StandingWaitingListEntry** (`standing_waiting_list_entries`): coach_id, player_id, credits_total, credits_used, expires_at, is_active. Unique: one **active** entry per (coach_id, player_id), via the partial unique index `uq_standing_entries_active_coach_player` (PAD-273). `add_standing_waiting_list_entry` deactivates the previous active entry before creating the new one; inactive rows keep the history and may repeat

### Rules
1. **Players join the waiting list by answering Yes on a `waiting_list_offer` message**, via
   `POST /api/app/notify/respond_waiting_list`. The offer is sent by `_offer_waiting_list()`
   only on the "sorry, that spot was just filled" path (`respond_to_waiting_list()` upserts a
   `WaitingListEntry` for that same instance on "yes", sends `waiting_list_confirm` back, and is a
   no-op on a late/expired instance per PAD-68). There is no separate "browse and join" surface —
   this message is the entire self-service join path.
   **[DEC 2026-09-04, PAD-124]** the endpoint already existed but neither client rendered the
   offer's Yes/No, so the path above was unreachable in practice (the waiting list was
   coach-managed only). The decision was to **wire it**, and PAD-124 did: `waiting_list_offer` is
   a third actionable message type — alongside `notification_invite` and `replacement_approval` —
   in both `MessageBubble.tsx` (web) and `message-bubble.tsx` (mobile). This path stays separate
   from `classes.join-requests` (PAD-130/131), the student-initiated "I want in" flow for a *full*
   class — the two are not merged
   **[PAD-358, 2026-09-17] Amended: this is no longer the only self-service join path.** A
   student may also place themselves on a *full* class's list from the "Marcar Aula" wizard
   (`classes.academy-class-booking` rule 6, `POST /api/app/class-waiting-list`). The offer path
   above is unchanged, and so is rule 12: `respond_waiting_list` still answers only an offered
   player. The new path has its own gate (eligible, visible, full) instead of an offer
1a. **The offer bubble settles like the reminder bubble.** Yes/No render only for the recipient
   (the coach sees `waitingForResponse` on the copy they sent), and the answer is written back
   onto the offer message as `metadata.responded = true` plus `metadata.response`, so the settled
   state survives a reload instead of living only in client state:
   - `"yes"` → an "on the waiting list" badge
   - `"no"` → the shared "declined" badge
   - `"expired"` → a muted "offer expired" badge. This is the PAD-68 refusal: a class that has
     already started can take no entry, so the server records `expired` rather than the answer
     and the client must not paint a badge for a place that was never taken
   - Any other recorded value fails safe to declined — the same asymmetry the reminder uses, so an
     unrecognised answer never promises a place on a list the student is not on
   - `{"action": "unknown"}` (the instance has no coach) records nothing and leaves the offer
     answerable
2. Standing entries are pre-paid slots (credits system)
   - `credits_total`: total credits purchased
   - `credits_used`: credits consumed — one per place the student takes by saying yes to a
     waiting-list invitation (rule 15, PAD-446)
   - `expires_at`: expiration instant (naive UTC)
   - **An entry runs to an end date the coach picks (PAD-507, owner decision 2026-10-03).** The coach
     chooses the date the entry runs to, inclusive — a preset (1 week, 2 weeks, 1 month, 2 months,
     6 months, 12 months, counted from today) fills it, or any date. It must lie between today and
     12 calendar months ahead on the club's calendar; there is no "no end date". The entry expires
     at the start of the next club day (`expires_at` = that instant in UTC). The list and each
     entry carry `expiresOn`, that date. "Today" is the club's day (Lisbon): the apps offer dates
     from the device's day, so near midnight in another time zone a date at either end of the
     window can be refused; the dialog then says it could not save and stays open.
   - **Renewable:** the coach can move an active entry's end date — expired or not — to any date in
     the same window; the credits stay as they are. Classes the new end no longer covers lose the
     rows this entry queued there; classes it now covers gain one (rule 10).
   - **Bounded fan-out (B-293):** an entry queues the player only for classes that start before its
     end, and an expired entry queues nothing more, at add, renew and materialisation (rules 3, 10).
3. When a new instance is materialized, `_sync_standing_entries_for_new_instance()` auto-creates waiting list entries for standing members whose entry has not expired and ends after the class starts (rule 2)
3a. **Fan-out is not a promise of a place.** A standing entry fans out to every upcoming class of
   the coach, and matching happens when a spot opens (rule 4a), not at fan-out time — a student's
   level and absence record change over time, so a bar evaluated at fan-out would be stale by the
   time it mattered. `activeClassCount` therefore reports how many classes the entry is queued for,
   not how many the student could actually be invited to.
4. **The waiting list is invitation group 0 (PAD-446, owner decision 2026-10-03; rule numbering
   unconfirmed).** When a spot opens, every batch the engine sends for it asks the class's
   waiting-list students **first**, before the coach's invitation groups (`notifications.invitations`
   rule 8a). There is no automatic placement any more: a waiting-list student is enrolled only by
   answering yes, through the same accept path as any invitation (`notifications.invitations`
   rule 10). In semi-automatic mode nothing is sent before the coach approves the spot
   (`notifications.semi-auto-approval`), the waiting list included.
   - **Order:** the time the student joined the list: a standing entry's creation time for an entry
     it fanned out, the entry's own `joined_at` otherwise; ties by entry id. The coach's priority
     criteria do not reorder the list, and a standing entry has no other precedence.
   - **Pacing, as a group:** at most `maxSimultaneous` of them at once. The next waiting-list
     students (or, when none is left to ask today — a student at `maxInvitesPerStudentPerDay` is
     not — the coach's current group) are asked on the next batch, after
     `maxInactiveTime`; a "no" is followed at once by one more invitation to the next candidate, as
     any decline is (`notifications.invitations` rule 1b). The same restrictions apply as to
     every invitation: quiet hours and the invitation window, the per-student daily limit,
     `maxTotal`.
   - **Who is left out:** a student already invited for this spot (any answer), one holding a live
     invitation for another spot of the class or who said "no" to the class (`notifications.invitations`
     rule 18), and every exclusion of rules 4a–4c.
   - **One list offer at a time (coordinator default 2026-10-03, the owner may reverse it):** a
     student answers one waiting-list offer before the next spot asks them from its list — a student
     holding a live group-0 invitation for any class of the coach is left out of every other class's
     group 0 until it resolves. The spots' own invitation groups are unaffected.
4a. **Waiting-list invitations are gated by eligibility.** A waiting-list student is invited only if
   they pass `effective_eligibility()` for that class (`eligibility.cascade`). The side rules of the
   coach's invitation groups do **not** apply to group 0: the invitation names the spot's side
   (rule 16) and the student decides. With an unset bar, nobody on the list is filtered out by
   level; that is the coach's configuration, not an engine decision.
4b. **A student is never invited into a class they are already in.** Waiting-list students are left
   out if they are on the class's roster — any presence, `absent` included. The second case is what
   stops the student whose cancellation created the spot from being offered it straight back.
4c. **Waiting-list invitations honour every restriction invitations honour**: `restrictions.excludedPlayers`,
   `restrictions.excludeUnpaidSubscription` (the inactive-account exclusion), a disabled account,
   the availability-blocker filter of `calendar.student-blockers`, and the student's own block on
   automatic invitations (`notifications.student-block-preferences`). Rules 4b and 4c apply whether
   or not an eligibility bar is defined.
4d. *(Retired with PAD-446: "placement is silent enrolment". Nothing on the waiting-list path adds a
   student without their yes.)*
5. `GET /api/app/waiting_list/{instance_id}` lists active entries
6. The coach manages standing entries from Settings > Notifications > Standing waiting list:
   - `GET /api/app/notify/standing_waiting_list` lists the coach's active entries
   - `POST /api/app/notify/standing_waiting_list` adds an entry (`playerId`, `credits`, `expiresOn`
     — an ISO date, rule 2). Old app builds send `durationDays` instead: a whole number of days from
     now, 1 to 366. Either out of bounds (or not a date / not a whole number) is answered `400
     {"error": "invalid_fields", "fields": ["expiresOn"]}` (or `["durationDays"]`) and nothing is
     written
   - `PATCH /api/app/notify/standing_waiting_list/{entry_id}` `{"expiresOn"}` renews an active entry
     of the caller's (200, the entry); the same bounds; another coach's or an inactive entry is 404
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
    - Each row shows the date the entry runs to with its year ("Expira a 3 de out. de 2027") and a
      **Renew** control beside remove (PAD-507). The player's page, on web and iOS, shows
      "Renovar · Até <date>" while the player holds an entry, opening the same dialog in renew mode
12. **Only an offered player may answer (PAD-222, B-041).** `POST /api/app/notify/respond_waiting_list`
    is 403 unless the caller's player holds a `waiting_list_offer` message for that
    `lessonInstanceId` in their direct conversation with the class's coach (answered or not: a
    double tap or a changed answer on the same offer stays the idempotent upsert of PAD-124).
    Nothing is written on a 403: no `WaitingListEntry`, no settled offer, no conversation
    created. The check runs before the late-instance no-op of PAD-68, so a player never learns
    whether an arbitrary instance id exists.
14. **A student's own join from the wizard (PAD-358)** writes the same `WaitingListEntry` the
    offer path writes — `standing_entry_id IS NULL`, upserted on `(lesson_instance_id, player_id)`
    and reactivated rather than duplicated — and is gated by `classes.academy-class-booking`
    rules 2 and 6. Leaving (`POST /api/app/class-waiting-list/<id>/leave`) deactivates the
    student's active entry for that class whatever its origin; a standing entry (rule 10) itself
    stays active for its other classes.
13. **Under the lock, as every invitation (PAD-261, PAD-495).** A waiting-list invitation is
    decided exactly as the batch decides any student (`notifications.invitations` rules 3(a) and 18):
    under the vacancy lock, re-reading the spot (still open), the class (still room) and the student
    (still on the list, not in the class, no live offer for it and no "no" to it). The yes that
    takes the spot is the invitation accept of `notifications.invitations` rule 10.
15. **A waiting-list answer settles the entry, in the answer's own commit (PAD-446; numbering
    unconfirmed).** On a group-0 invitation (one sent to the student as a waiting-list student):
    - **yes, and the spot is theirs:** the class's waiting-list entry is closed (`is_active = False`)
      and, when it was fanned out by a standing entry, that entry spends one credit (and closes when
      its credits are used up). Both are written in the accept's single commit, under rule 10's
      lock, so a failed accept leaves the entry and the credit untouched.
    - **yes, but the spot was taken first:** nothing is spent and the entry stays; the student is
      offered the list again as any late yes is (`notifications.invitations` rule 17).
    - **no:** the "no" is final for the class (`notifications.invitations` rule 18), so the entry for
      that class is closed too, in the decline's commit. No credit is spent. A standing entry stays
      active for its other classes.
    The coach recording the answer for the student settles the entry the same way.
16. **The invitation names the spot's side when the spot has one (PAD-446).** A group-0 invitation
    uses the `waiting_list_invite` template (`notifications.message-templates`). When the vacancy's
    side is `left` or `right` its `{side}` placeholder renders the side ("left side" / "lado
    esquerdo", "right side" / "lado direito"); for a `both` or empty side it renders nothing, and the
    message says nothing about sides.
17. **No placement message, no placement event.** The `waiting_list_placed` template and the coach's
    `waiting_list_filled` live event are retired: a waiting-list student who says yes gets the
    accept's `confirm` message, and the coach sees the same `notification_responded` event as for any
    invitation.

18. **The coach adds a student to one class's waiting list (PAD-547; numbering unconfirmed).**
    `POST /api/app/notify/class_waiting_list` with `{model, originalId, date, playerId, scope:
    "occurrence"}`, addressed like a class edit (a virtual occurrence is materialised). The
    student must be on the coach's roster (404 otherwise) and not in the class (409
    `already_enrolled`). It is allowed **whether or not the class is full** and **without an
    eligibility check**: being on the list means being asked first when a spot opens (rule 4),
    and rules 4a–4c still decide at that moment. It writes, or reactivates, the
    `(instance, player)` row with `added_by = "coach"`, `standing_entry_id` NULL and `joined_at`
    now; a row already active (any origin) is left as it is and the answer says
    `already_on_list`. It sends the student nothing — the invitation, if a spot opens, is the first
    they hear (coordinator, 2026-10-07: no change of message volume). The coach's class views get
    the `waiting_list_changed` live event.
19. **…or to the whole series, as a standing entry scoped to that series (PAD-547; numbering
    unconfirmed).** The same request with `scope: "series"`, `credits` and `expiresOn` creates a
    standing entry (rule 2: same credits, same end date window, renewable) whose `lesson_id` is
    the class's series. A scoped entry fans out (rules 3, 10) only to that series' upcoming
    occurrences, existing and later materialised, never to the coach's other classes; a NULL
    `lesson_id` keeps rule 3a's coach-wide reach. One active standing entry per coach, student
    **and scope** (coach-wide, or one per series): adding a second for the same scope replaces the
    first as before; a coach-wide entry and a series entry for the same student coexist, and a
    class both reach holds one row (rule 10's reactivation). The series option is offered only for
    a recurring class. The standing list (rule 6) shows a scoped entry with its class's title.
20. **Each row says where it came from (PAD-547; numbering unconfirmed).** A row's `origin` is
    `standing` when it came from a standing entry (coach-wide or series), else `coach` when
    `added_by` is `coach`, else `student` (the student's own offer answer or wizard join, rules 1
    and 14; rows from before PAD-547 read `student`). `added_by` is `student` on those two paths.
    The class's list (`GET /api/app/notify/waiting_list/{instance_id}`, rule 5, and the class
    detail payload's `waitingList`, coach only) carries `origin`, `playerId`, `playerName`,
    `joinedAt` and, for a standing row, `standingEntryId` and `seriesScoped`, ordered as rule 4
    asks them (join time).
21. **The coach removes a row from one class's list (PAD-547; numbering unconfirmed).** `DELETE
    /api/app/notify/class_waiting_list/{entry_id}` by the class's coach deactivates that row only,
    whatever its origin — like the student's own leave (rule 14) — and a standing entry, coach-wide
    or series, stays for its other classes. It sends the student nothing and publishes
    `waiting_list_changed`. A row already inactive answers the same, writing nothing.

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

#### Join waiting list via message offer
- **Given** a student who received a `waiting_list_offer` message (their spot on a class was just
  filled by someone else)
- **When** they tap Yes on the message
- **Then** `POST /api/app/notify/respond_waiting_list` is called with `action=yes`
- **And** a WaitingListEntry is created (or reactivated) with is_active=True for that instance
- **And** the student receives the `waiting_list_confirm` reply
- **And** the offer bubble shows the "on the waiting list" badge in place of the Yes/No

#### The answered offer stays answered across a reload
- **Given** a student who has answered a `waiting_list_offer`
- **When** they reopen the conversation
- **Then** the bubble still shows the badge for the answer they gave, not the Yes/No again

#### A player who was not offered the list is refused (PAD-222)
- **Given** a future instance of coach C's class and student S on C's roster with no `waiting_list_offer` for it
- **When** S POSTs `/api/app/notify/respond_waiting_list` with that `lessonInstanceId` and `action=yes`
- **Then** the response is 403, no `WaitingListEntry` exists for S on that instance and no conversation was created
- **When** S is sent the offer and answers Yes
- **Then** the response is 200 and the entry exists
- **When** S answers Yes again on the now-settled offer
- **Then** the response is 200 and there is still exactly one entry (idempotent, PAD-124)

#### Declining the offer queues nobody
- **Given** a student who received a `waiting_list_offer`
- **When** they tap No
- **Then** no WaitingListEntry exists for them on that instance
- **And** the offer bubble shows the "declined" badge

#### Only one active standing entry per coach and player
- **Given** coach `maria` and player `rui` with one active standing entry, and two older inactive ones
- **When** a second active entry for `maria` and `rui` is written directly
- **Then** the database refuses it (integrity error); the inactive rows are unaffected
- **And** `POST /api/app/notify/standing_waiting_list` for `rui` still works, because it deactivates the old entry first

#### The coach picks the end date, up to 12 months (rule 2, PAD-507)
- **Given** a coach adding a student to the standing waiting list from the student's page
- **When** they pick a date 13 months away
- **Then** the date is flagged and nothing can be sent; `POST` with that `expiresOn` (or yesterday,
  or not a date) is 400 naming `expiresOn` and nothing is written
- **When** they pick a date 40 days away and confirm
- **Then** the entry is created with `expiresOn` that date, expiring at the start of the next club day
- **And** an old build's `durationDays: 30` is still accepted; `0`, `-2`, `367` or `"abc"` is 400 naming `durationDays`

#### The coach renews an entry (rule 2, PAD-507)
- **Given** an entry with 2 of 3 credits used, ending in 5 days (or already expired but still listed)
- **When** the coach renews it to the 12-month preset
- **Then** `PATCH` sends that date, the entry ends then, and its credits are still 2 of 3
- **And** another coach's entry, or an unknown id, is 404

#### An entry queues its player only until its end (rule 2, B-293)
- **Given** an entry ending in 5 days and the coach's classes in 3 and 10 days
- **Then** the player is queued for the class in 3 days only
- **When** the entry is renewed to 15 days, then back to 5
- **Then** the class in 10 days gains the row, then loses it; the class in 3 days keeps its row
- **And** a class materialised after the end, or for an entry that has expired, gets no row

#### Standing entry auto-sync
- **Given** a player with an active standing entry (5 credits, 2 used)
- **When** a new instance is materialized
- **Then** a WaitingListEntry is auto-created for that instance linked to the standing entry

#### An ineligible waiting-list member is not invited
- **Given** a coach whose eligibility is `[{level, same_as_class}]`
- **And** a standing waiting-list member whose level does not match a class they are queued for
- **When** a vacancy opens in that class
- **Then** they are not invited and no credit is consumed
- **And** the vacancy proceeds to the coach's invitation groups

#### The student who cancels is not offered their own vacated spot
- **Given** a student enrolled in a class who also has an active standing waiting-list entry
- **When** they cancel their attendance and the resulting vacancy is processed
- **Then** they get no invitation for that class
- **And** no credit is consumed
- **And** the vacancy is offered to other students

#### An already-enrolled member is not a waiting-list candidate
- **Given** a student already enrolled in a class who has an active standing waiting-list entry
- **When** another student's cancellation opens a vacancy in that class
- **Then** the enrolled student is not invited
- **And** the vacancy is offered to students who are not already in the class

#### Waiting-list invitations honour the excluded-players restriction
- **Given** a coach with `restrictions.excludedPlayers` enabled naming a student
- **And** that student has an active standing waiting-list entry
- **When** a vacancy opens
- **Then** they are not invited

#### The waiting list is asked first, in join order (PAD-446)
- **Given** a class with one open spot, `maxSimultaneous` 1, and three students on its waiting list
  who joined at 10:00 (Ana, her own entry), 09:00 (Bea, a standing entry created at 09:00) and
  11:00 (Caio), plus roster students in the coach's first invitation group
- **When** the spot starts
- **Then** only Bea is invited, and nobody is enrolled
- **And** after `maxInactiveTime` with no answer, Ana is invited next, then Caio
- **And** only when no waiting-list student is left to ask does the coach's first group get an invitation

#### A student answers one waiting-list offer before the next spot asks them (PAD-446, coordinator default)
- **Given** a student on the waiting list of classes A and B of one coach, and an open spot in each
- **When** A's spot asks them first and B's spot then sends
- **Then** B's spot asks its own group, not them, while A's offer is live
- **And** once they answer A's offer (or it is retired), B's next batch asks them from its list

#### Several on the list are asked together up to maxSimultaneous (PAD-446)
- **Given** a spot, `maxSimultaneous` 3, and two waiting-list students
- **When** the spot starts
- **Then** both waiting-list students are invited in that batch, and nobody from the coach's groups

#### The last waiting-list student's no moves on to the groups at once (PAD-446)
- **Given** a spot whose only invitation out is to the one waiting-list student
- **When** that student answers no
- **Then** the decline's follow-up invites the next candidate from the coach's first invitation group, without waiting for `maxInactiveTime`

#### A waiting-list yes spends the credit in the accept's commit (PAD-446)
- **Given** a waiting-list student with a standing entry (3 credits, 0 used) holding a group-0 invitation
- **When** they answer yes and the spot is still open
- **Then** they are enrolled, their entry for the class is closed and the standing entry has 1 credit used
- **And** if the accept's single commit fails instead, the entry is still active and no credit is used

#### A waiting-list no closes the entry for that class only (PAD-446)
- **Given** a waiting-list student with a standing entry holding a group-0 invitation for class A, and a queued entry for class B
- **When** they answer no
- **Then** their entry for class A is closed, no credit is spent, and they are never invited to class A again
- **And** their entry for class B and the standing entry stay active

#### The invitation names the spot's side only when it has one (PAD-446)
- **Given** a waiting-list student and a spot whose side is `left`
- **When** they are invited
- **Then** the message says "left side" (pt: "lado esquerdo")
- **And** for a spot whose side is `both` or empty the message mentions no side

#### Nobody is enrolled from the waiting list without a yes (PAD-446)
- **Given** a spot and a waiting-list student who passes every rule
- **When** the engine processes the spot any number of times
- **Then** the student is not enrolled and no `waiting_list_placed` message exists until they answer yes

### Notes
- **[DEC 2026-09-04, PAD-124]** Wire `waiting_list_offer` as a third actionable message type in
  both web and mobile `MessageBubble`s, calling the existing `POST /api/app/notify/respond_waiting_list`.
  Keep it a separate path from `classes.join-requests` (PAD-130/131) rather than folding the two
  together — see rule 1. Recorded so this decision is not lost the way `found_issues.md` #7 was
  (PAD-171's framing for this whole round of decisions). **Built 2026-09-06.**
- **[PAD-124 build]** `respond_to_waiting_list()` did not mark the offer message answered the way
  `respond_to_reminder()` marks its reminder, so with client-side state alone the Yes/No came back
  on the next load. Rule 1a is what the build added on the server for that; iOS also keeps the
  derivation in a pure `waiting-list-state.ts` beside `reminder-state.ts`, since the screen itself
  is not unit-testable there.

#### A waiting-list invitation never offers a spot someone else already won (PAD-261)
- **Given** a vacancy that another path has just filled, or a class that is already full
- **When** the engine would invite a waiting-list student for it
- **Then** nobody is invited and the waiting-list entry stays active

#### The student is re-read under the lock (PAD-499)
- **Given** a waiting-list student picked for a spot
- **When** before the invitation takes its lock they answer "no" to an invitation for the class, or leave the waiting list
- **Then** they are not invited and the spot stays open

#### The coach puts a student on one class's waiting list (rule 18, PAD-547)
- **Given** coach Ana's class "Terça 18h" on 2026-10-13 with one free place, and roster student Carla who is not in it
- **When** Ana adds Carla to that class's waiting list for this class only
- **Then** one active `WaitingListEntry` exists for that occurrence and Carla, `added_by = "coach"`, `standing_entry_id` NULL
- **And** Carla receives no message, and when a place opens on that occurrence she is asked first (group 0)
- **And** adding her again answers `already_on_list` and writes nothing

#### The coach puts a student on a whole series (rule 19)
- **Given** Ana's weekly series "Terça 18h" and another class of Ana's, "Quinta 19h"
- **When** Ana adds Carla to "Terça 18h"'s waiting list for the whole recurrence, 3 credits, until 2026-12-31
- **Then** a standing entry with `lesson_id` = that series exists, and Carla has an active row on every upcoming "Terça 18h" occurrence up to 2026-12-31 and none on "Quinta 19h"
- **And** an occurrence of "Terça 18h" materialised later gains her row too
- **And** a coach-wide standing entry Carla already had stays active beside it

#### The class's list says where each student came from, and the coach removes one (rules 20–21)
- **Given** an occurrence with three active rows: Bruno from a standing entry, Carla added by the coach, Dinis who joined from the wizard
- **When** the coach reads the class's waiting list
- **Then** their `origin` is `standing`, `coach` and `student`
- **And** removing Bruno's row deactivates it, sends nothing, and leaves his standing entry active with its rows on his other classes
