---
id: notifications.manual
status: implemented
depends_on: [notifications.config, classes.instances]
serves: [P-NOTIFICATIONS-2]
governed_by: []
---

# notifications.manual


### Rules for a session on the new engine (PAD-913)
Which engine runs a session is `notifications.config` rule 18. **For an old-engine session every rule
below holds as written.** For a session on the new engine the items below hold; the rest hold unchanged.
Not marked inline: this section is the one place.

The owner, 2026-11-13 (decision 17, PAD-932): a manual invitation on a new-engine class is an engine
invitation (NM1). From the stopgap (PAD-933) until NM1 shipped, the manual controls were off on a new-engine
class; with NM1 they are back (NM2).
- **NM1. A manual invitation on a new-engine class is an engine invitation** (the coordinator's rulings
  (a)–(g), 2026-11-13; the owner may veto). It replaces rules 2–4 for a new-engine session. Rules 7, 8 and
  10 hold as written, and rule 9 as restated below.
  - **The route.** `POST /api/app/notify/manual` sends the engine `CoachInvites(students)` for the session
    (`notifications.engine-answers` rule 15), not `send_manual_notifications`. It writes no
    `NotificationEvent` and no old `notification_invite` message. It answers `{sent, blocked}` as today.
  - **Still refused in the route, as today (g).** A student with an availability blocker over the class
    or who blocks manual invitations or all notifications (`notifications.student-block-preferences`) is
    in `blocked`, with today's causes.
  - **A class with no open spot (a).** When the session has no open spot type, the route answers **409**
    `{"error": "NO_OPEN_SPOT", "code": "NO_OPEN_SPOT"}` and sends nothing, after rule 7's and rule 10's
    checks. A student whose playable sides
    fit no open spot type is in `blocked` with `cause: "no_open_spot"`.
  - **Already there.** A student already in the session is in `blocked` with `cause: "already_in_class"`.
    A student placed in another session at the same hour (`notifications.engine-tiers` rule 3) is in
    `blocked` with `cause: "same_hour"`.
  - **The invitation.** Each other student gets one engine invitation of the **coach's-list tier**, marked
    manual. It skips the eligibility bar and the coach's own gates, as the coach's list does (b;
    `notifications.engine-tiers` rule 4). Its offer is every open spot type the student's playable sides
    allow (b). It is sent at once, whatever the quiet hours, the invitation window or the class's
    automatic toggle (d; today's rule 3b, PAD-732). It counts (`notifications.engine-planning` rule 3)
    and counts toward M, and it may take the session above M (e). Its counting-until instant is the T
    that `notifications.engine-timeline` rule 4 fixes for an invitation of the coach's-list tier (f). The
    student gets the engine's invitation message, which names a side only per
    `notifications.engine-planning` rule 9, and answers it on the engine route
    (`notifications.invitations` NB5).
  - **A student who already holds an engine invitation for the session** (c; one per student, D1). If it
    still counts, they are in `blocked` with `cause: "already_invited"` (rule 9). Any other row (no longer
    counting, answered No or sorry, withdrawn, or closed while the student is no longer busy) is
    **reopened** as this manual invitation: the same row, counting anew, with the offer and T above, and
    the ordinary invitation message (`notifications.engine-answers` rule 15). Nothing is ever a second row.
  - **The class detail** lists it with `tierSource` null ("convite manual", `calendar.event-detail` ND1),
    because the row is `manual`, whatever its tier.
- **NM3. An old invitation's Yes on a new-engine class tells the engine.** A Yes on an old-engine
  invitation (a `NotificationEvent`, manual or automatic, sent before the class moved to the new engine)
  that places the student in a new-engine session calls `coach_added` (`services/engine_entry.py`;
  in `services/notification_service.py`: the student's Yes, `respond_to_notification` / `_record_yes`;
  the Yes a coach records, `coach_respond_to_notification`; and an old waiting-list Yes,
  `respond_to_waiting_list`;
  `notifications.engine-answers` rule 10's `CoachAdded`). The engine closes the student's open
  invitations at that hour and replans the session.
- **NM2. The manual controls stay on a new-engine class** (PAD-932, ending decision 17's stopgap now that
  NM1 is built). Web (`ClassDetailSheet`) and iOS (the class screen) show Notificar on a new-engine class
  as on an old-engine one, and a `notify=1` link opens the picker; the send takes NM1's path. The
  server no longer answers `NEW_ENGINE_CLASS`. The dashboard's Convidar is back too (`dashboard.blocks` NA5).
  - Today: the route (`modules/notification_engine_api.py` `manual_notify`) and
    `send_manual_notifications` (`services/notification_service.py`) never check the engine, so on a
    new-engine class they write a `NotificationEvent` and an old bubble the engine never reads, and the
    duplicate check (`players_with_live_invitation`) reads only `NotificationEvent` rows. The web
    Notificar (`class-notify-open`) and iOS (`class-notify`) hide only once the class has started.


### Intent
Coaches manually select players to notify about a class, bypassing the automatic matching engine.

### Rules
1. `POST /api/app/notification_manual` with instance info and player_ids
2. Creates NotificationEvents with type "manual"
3. Sends invitation messages to selected players
4. Players respond same as auto invitations
5. UI: ManualNotificationModal with searchable player selector
7. **Owner and roster only (PAD-258).** The caller must own the class instance, and every
   `playerId` must be on the caller's roster (`Association_CoachPlayer`); otherwise 403 and no
   NotificationEvent or message is created.
8. **Inviting below the bar warns first (PAD-562).** Before `POST /api/app/notify/manual`, the
   modal runs `eligibility_check` for the selection and, when any selected student fails the
   class's bar, opens the same confirmation the manual add uses, with the invite verb
   (`eligibility.enforcement` rule 6a). Cancel sends nothing; confirm sends as before. Web and iOS.
9. **No second invitation to a student who holds one (PAD-620; PAD-612 R1; PAD-932).** A selected
   student who already holds a live invitation for the occurrence — automatic or manual, on either
   engine: an old `NotificationEvent` that is `sent` or `queued`, or a new-engine invitation that still
   counts (`notifications.engine-planning` rule 3) — is not invited again: no event, no message, no push. The response lists them in `blocked` with
   `cause: "already_invited"` and their name, and web and iOS say so by name in the warning slot
   ("Já têm um convite em aberto para esta aula: …"), as for the other two causes. The rest of the
   selection is sent as before.
10. **No invitation once the class has started (PAD-798; owner, 2026-10-30).** From the class's
   start time on the club's clock (R-023: the stored start is Lisbon wall clock, `now` is moved to
   it), `POST /api/app/notify/manual` answers **409** `{"error": "CLASS_STARTED", "code":
   "CLASS_STARTED"}` and creates nothing: no event, no message, no push. The check runs after rule 7's
   ownership and roster checks (a stranger still gets 403 and learns nothing about the class) and
   before anything is worked out or sent; `send_manual_notifications` refuses too
   (`ClassStartedError`), so no other caller can skip it. The engine stops at the same moment
   (`notifications.invitations` rule 20).
   - **Web and iOS:** on a class that has started, the class panel shows the warning "Esta aula já
     começou; já não é possível convidar." / "This class has already started; invitations are
     closed." (`calendar.notify.classStarted`, test id `class-notify-closed`) where Notificar was,
     and the dashboard's `notify=1` link opens nothing. The client decides it on the club's clock
     (web `classStarted` in `ClassDetailSheet`, iOS `hasClassStarted`).
   - A picker left open across the start sends, gets the 409, shows the same warning instead of
     the generic failure, and closes.
6. Selection rows (both search results and rows inside a notification group) are a single click target: clicking the checkbox, the avatar or the name each produce exactly one toggle of that player's selection. The row must not carry a click handler that competes with the checkbox's own change handler

### Acceptance Criteria

#### NOTIFICATIONS-MANUAL-1: A student holding a live invitation is not invited twice (rule 9, PAD-620)
- **Given** Ana holds a live invitation for Friday's class (an old-engine class) and Bruno holds none
- **When** the coach notifies Ana and Bruno by hand
- **Then** only Bruno gets an invitation (`sent: 1`), Ana still holds exactly one live invitation
- **And** the response lists Ana in `blocked` with `cause: "already_invited"`, and the coach is told her name

#### NOTIFICATIONS-MANUAL-2: A class that has started takes no manual invitation (rule 10, PAD-798)
- **Given** a class at 19:30 Lisbon on a summer day (18:30 UTC), a student on the coach's roster
- **When** the coach sends a manual invitation at 19:29, at 19:30, and at 19:45 Lisbon
- **Then** the 19:29 send invites the student; the 19:30 and 19:45 sends answer 409 `CLASS_STARTED`
  and create no invitation, message or push
- **And** another coach sending to the same class at 19:45 gets 403, as before

#### NOTIFICATIONS-MANUAL-3: Notificar gives way to the warning once the class has started (rule 10, PAD-798)
- **Given** the coach opens that class on web or iOS at 19:45 Lisbon, or arrives from a dashboard
  link carrying `notify=1`
- **When** the class panel is on screen
- **Then** it shows "This class has already started; invitations are closed." where Notificar was,
  and the picker does not open
- **And** at 19:00 Lisbon Notificar is there and `notify=1` opens the picker

#### NOTIFICATIONS-MANUAL-4: A picker left open across the start says why it cannot send (rule 10, PAD-798)
- **Given** the picker was opened before 19:30 and the coach sends at 19:31
- **When** the server answers 409 `CLASS_STARTED`
- **Then** web and iOS show the warning above, not "Failed to send invitations", and close the
  picker

#### NOTIFICATIONS-MANUAL-5: Send manual notifications
- **Given** an instance with 2 open spots
- **When** coach manually selects players [5, 8, 12] and sends
- **Then** 3 NotificationEvents created with type "manual"
- **And** invitation messages sent to all 3 players

#### NOTIFICATIONS-MANUAL-6: Selecting a player from the modal
- **Given** the manual notification modal is open with a searched-for eligible student listed
- **When** the coach clicks the checkbox next to that student
- **Then** the student becomes selected and the send button counts them
- **And** clicking the student's name instead produces the same result
- **And** clicking the same target again deselects the student

#### NOTIFICATIONS-MANUAL-7: Only the class's own coach invites, and only players of their own roster (rule 7)
- **Given** coach Ana's class, and coach Bruno
- **When** Bruno sends a manual invitation for it
- **Then** the answer is 403 and no invitation is stored
- **And** Ana inviting a player who is on nobody's roster answers 403 too
- **And** when the class has no occurrence row yet, the refusal comes before one is created, also on the class's waiting-list and simulation routes
test: `backend/padel_app/tests/test_b619_engine_routes_check_ownership.py` › `test_a_foreign_class_is_refused_before_it_is_materialised` (+2 more)

#### NOTIFICATIONS-MANUAL-8: The picker marks a student who declined this class and still lets the coach choose them (notifications.invitations rule 18)
- **Given** the manual-invitation picker for a class one student already declined
- **Then** that student's row says they declined this class, the other rows do not
- **And** the coach can still tick the student
test: `frontend/apps/mobile/src/features/calendar/notify-modal.declined.test.tsx` › `marks the decliner in the search, not the others, and keeps them selectable`

#### NOTIFICATIONS-MANUAL-9: A manual invitation on a new-engine class takes the engine's path, never the old one (new-engine sections NM1, NM2)
- **Given** a coach on `new` with a class that has open spots and a student on their roster, and a coach on `old` with the same
- **When** each coach sends a manual invitation to the student
- **Then** the first answers 200 with `sent: 1` and stores one engine invitation and no `NotificationEvent` (never `NEW_ENGINE_CLASS`); the second invites as today, with a `NotificationEvent`
- **And** a stranger coach still gets 403 first
test: `backend/padel_app/tests/test_pad920_manual_new_engine.py` › `test_a_manual_invitation_on_a_new_engine_class_takes_the_engine_path`

#### NOTIFICATIONS-MANUAL-10: The web class panel offers Notificar on a new-engine class (new-engine section NM2)
- **Given** the coach opens a new-engine class with open spots on web, once directly and once from a link carrying `notify=1`, and an old-engine class the same way
- **Then** both classes show Notificar (`class-notify-open`) and `notify=1` opens the picker on both
test: `frontend/apps/web/src/components/calendar/ClassDetailSheet.manualNewEngine.test.tsx` › `shows Notificar and opens on notify=1 on a new-engine class`

#### NOTIFICATIONS-MANUAL-11: The iOS class screen offers Notificar on a new-engine class (new-engine section NM2)
- **Given** the same classes on iOS
- **Then** the same holds as on web (`class-notify`)
test: `frontend/apps/mobile/src/features/calendar/notify-new-engine.test.tsx` › `shows Notificar and opens on notify=1 on a new-engine class`

#### NOTIFICATIONS-MANUAL-12: A manual invitation on a new-engine class is a counting engine invitation of the coach's list (new-engine section NM1)
- **Given** a new-engine class with one open left spot, in quiet hours, before its invitation window and with the class's automatic invitations off, and a left-side student on the coach's roster below the class's bar
- **When** the coach invites them by hand
- **Then** `sent` is 1, one engine invitation exists for them in the coach's-list tier, marked manual, counting, with its counting-until instant set by the coach's-list tier's T, and they get the engine's invitation message at once
- **And** no `NotificationEvent` and no old `notification_invite` message is written, and the class detail lists them with `tierSource` null
test: `backend/padel_app/tests/test_pad932_manual_engine_invitation.py` › `test_a_manual_invitation_on_a_new_engine_class_is_an_engine_invitation`

#### NOTIFICATIONS-MANUAL-13: What a manual invitation on a new-engine class refuses (new-engine section NM1)
- **Given** a new-engine class with one open right spot, and six students: one holding a counting engine invitation, one holding a live old `NotificationEvent` for it, one already in the class, one placed in another class at the same hour, one who plays left only, and one who blocks manual invitations
- **When** the coach invites all six by hand
- **Then** `sent` is 0 and `blocked` lists them with `already_invited` (twice, rule 9 on both engines), `already_in_class`, `same_hour`, `no_open_spot` and today's preference cause; nothing is stored or sent
- **And** on the same class once full, the route answers 409 `NO_OPEN_SPOT`
test: `backend/padel_app/tests/test_pad932_manual_engine_invitation.py` › `test_what_a_manual_invitation_on_a_new_engine_class_refuses`

#### NOTIFICATIONS-MANUAL-14: A manual invitation reopens a student's invitation that stopped counting (new-engine section NM1)
- **Given** a new-engine class, and three students whose engine invitations are open but no longer counting, answered No, and withdrawn
- **When** the coach invites all three by hand
- **Then** `sent` is 3, each keeps one invitation row, now the coach's-list tier, marked manual and counting with a new T, and each gets a new message
test: `backend/padel_app/tests/test_pad932_manual_engine_invitation.py` › `test_a_manual_invitation_reopens_one_that_stopped_counting`

#### NOTIFICATIONS-MANUAL-15: An old invitation's Yes on a new-engine class tells the engine (new-engine section NM3)
- **Given** a student holding an old manual invitation (a `NotificationEvent`) for a class now on the new engine, and an open engine invitation for another class at the same hour
- **When** they answer Yes on the old invitation and are placed
- **Then** the engine is sent `CoachAdded` for them: the other class's invitation closes with `same_hour`, and the session is re-planned
test: `backend/padel_app/tests/test_pad932_manual_engine_invitation.py` › `test_an_old_invitations_yes_on_a_new_engine_class_tells_the_engine`

### Waves
1. (PAD-933, the stopgap) NM2: MANUAL-9 to 11 — `modules/notification_engine_api.py`, `services/notification_service.py`, web `ClassDetailSheet`, iOS class screen; with `dashboard.blocks` DASHBOARD-BLOCKS-58 to 61. Until wave 2 ships, these are what the code meets.
2. (PAD-932) NM1, NM3: rule 9 on both engines, MANUAL-12 to 15, with `notifications.engine-answers` ANSWERS-30, 31, `notifications.engine-tiers` TIERS-23 — `services/engine_entry.py` (`coach_invites`), `invitation_engine/requests.py`, `effects.py`, `services/engine_store.py`, the route. It lands together with the amendment that retires NM2 and brings the controls back (MANUAL-9 to 11, DASHBOARD-BLOCKS-59 to 61), never before; until then wave 2's criteria describe the target, not the code.

### Open questions
- A manual invitation reopens an invitation answered No (NM1; S's reading, PAD-932, 2026-11-13; the owner can
  reverse it). The coordinator's ruling (c) re-counts a row that stopped counting. A No is not counting, and
  today the coach may pick a student who declined (rule 18 of `notifications.invitations`, MANUAL-8), so a
  manual invitation reopens it too. Automatic invitations still never ask them again
  (`notifications.engine-tiers` rule 4).
