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

The owner, 2026-11-13 (decision 17): a manual invitation on a new-engine class is to become an engine
invitation. Until it is built, the manual controls are off on a new-engine class:
- **NM2. No manual invitation on a new-engine class, for now.** For a new-engine session:
  - `POST /api/app/notify/manual` answers **409** `{"error": "NEW_ENGINE_CLASS", "code":
    "NEW_ENGINE_CLASS"}` and creates nothing: no event, no message, no push. The check runs after rule 7's
    ownership and roster checks, as rule 10's does, and `send_manual_notifications` refuses too, so no
    other caller skips it. An older app that still shows Notificar is refused the same way.
  - Web (`ClassDetailSheet`) and iOS (the class screen) show no Notificar control, and a `notify=1` link
    (the dashboard's) opens nothing. They read the class's `engineVersion` (`notifications.config` rule
    20's field, which the coach's class payloads carry too); a payload with no `engineVersion` reads as
    `old`. The dashboard card's "Convidar" goes too (`dashboard.blocks` NA5).
  - An old-engine class keeps Notificar and rules 1–10 as written.
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
9. **No second invitation to a student who holds one (PAD-620; PAD-612 R1).** A selected student who
   already holds a live invitation (`sent` or `queued`) for the occurrence — automatic or manual — is
   not invited again: no event, no message, no push. The response lists them in `blocked` with
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
- **Given** Ana holds a live invitation for Friday's class and Bruno holds none
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

#### NOTIFICATIONS-MANUAL-9: The server refuses a manual invitation on a new-engine class (new-engine section NM2)
- **Given** a coach on `new` with a class that has open spots and a student on their roster, and a coach on `old` with the same
- **When** each coach sends a manual invitation to the student
- **Then** the first answers 409 `NEW_ENGINE_CLASS` and nothing is stored or sent (no event, no engine invitation, no message, no push); the second invites as today
- **And** `send_manual_notifications` called directly for the new-engine class raises and stores nothing, and a stranger coach still gets 403 first
test: `backend/padel_app/tests/test_pad920_manual_new_engine.py` › `test_a_manual_invitation_on_a_new_engine_class_is_refused`

#### NOTIFICATIONS-MANUAL-10: The web class panel has no Notificar on a new-engine class (new-engine section NM2)
- **Given** the coach opens a new-engine class with open spots on web, once directly and once from a link carrying `notify=1`, and an old-engine class the same way
- **Then** the new-engine class shows no Notificar control and the picker does not open; the old-engine class shows Notificar and `notify=1` opens the picker; a class payload without `engineVersion` behaves as the old-engine one
test: `frontend/apps/web/src/components/calendar/ClassDetailSheet.manualNewEngine.test.tsx` › `hides Notificar and ignores notify=1 on a new-engine class`

#### NOTIFICATIONS-MANUAL-11: The iOS class screen has no Notificar on a new-engine class (new-engine section NM2)
- **Given** the same classes on iOS
- **Then** the same holds as on web
test: `frontend/apps/mobile/src/features/calendar/notify-new-engine.test.tsx` › `hides Notificar and ignores notify=1 on a new-engine class`
