---
id: notifications.manual
status: implemented
depends_on: [notifications.config, classes.instances]
implements: ../../specs-business/notifications/coach-fills-vacancies-automatically.business.md
governed_by: []
---

# notifications.manual


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
6. Selection rows (both search results and rows inside a notification group) are a single click target: clicking the checkbox, the avatar or the name each produce exactly one toggle of that player's selection. The row must not carry a click handler that competes with the checkbox's own change handler

### Acceptance Criteria

#### A student holding a live invitation is not invited twice (rule 9, PAD-620)
- **Given** Ana holds a live invitation for Friday's class and Bruno holds none
- **When** the coach notifies Ana and Bruno by hand
- **Then** only Bruno gets an invitation (`sent: 1`), Ana still holds exactly one live invitation
- **And** the response lists Ana in `blocked` with `cause: "already_invited"`, and the coach is told her name

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
