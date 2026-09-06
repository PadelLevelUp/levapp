---
id: calendar.event-detail
status: implemented
depends_on: [calendar.view]
implements: ../../specs-business/calendar/coach-views-and-manages-schedule.business.md
governed_by: []
---

# calendar.event-detail


### Intent
Clicking a calendar event opens a detail sheet showing full information and available actions.

### Rules
1. Class events open `ClassDetailSheet`: participants, attendance, edit, delete, notify buttons
2. Block events open `EventDetailSheet`: view/edit block details
3. ClassDetailSheet shows: title, date, time, level, "Participants (X/Y)", presence list
4. Actions available: Mark attendance, Edit, Delete, Notify, Training planning
5. The "capacity" field shows effective filled spots over `maxPlayers` — the same value as the calendar event card's `X/Y` (see calendar.view rules 8–9). Declined students are excluded from both
6. The class-detail "invited" (convidados) list is keyed by STUDENT, not by invite record. A student who received several `NotificationEvent` rows for the same instance (multiple rounds, a manual invite plus an automatic one, a re-invite after a decline — all legitimate per notifications.invitations) appears exactly ONCE. The `invitations` array returned by the class-detail payload therefore contains at most one entry per `playerId`
7. De-duplication happens in the backend serializer (`serialize_class_instance`) so every surface — web detail sheet, mobile — sees the same one-row-per-student list. No client performs its own de-duplication
8. Tie-break when a student has several invite records for the same instance: the entry that survives is the one carrying the most meaningful state, ranked `confirmed` > `expired` (an explicit decline) > `sent` (pending) > `queued` (not yet sent). An actual response always beats a still-pending invite. Within the same status rank the most recent record wins (highest `round_number`, then highest `id`). The surviving entry keeps that record's own `id`, so coach response actions still target a real `NotificationEvent`
9. The collapsed "Invited (N)" header counts distinct students, so N equals the number of rows revealed when the section is expanded
10. The calendar page accepts a deep link `/calendar?classId=<calendar-event-id>&date=<YYYY-MM-DD>`
    (see dashboard.navigation rule 8). On mount it MUST:
    - select the week containing `date` BEFORE deciding what to open, so the target occurrence is
      actually loaded even when it lies outside the current week
    - open `ClassDetailSheet` for the event whose `id` equals `classId` once that week's events
      have loaded
11. The deep-link query params are consumed once: after the sheet opens, they are stripped from the
    URL with a history REPLACE. Closing the sheet must therefore leave the coach on the correct
    week with no sheet, and must not immediately re-open it
12. A `classId` that matches no event in the target week is a no-op: the calendar still shows the
    requested week, no sheet opens, and no error is surfaced. `date` alone (no `classId`) simply
    selects that week
13. Deleting a block event always sends a JSON request body, even when there is nothing to say.
    A recurring occurrence sends `{occDate, scope}`; a ONE-OFF event has neither, and must still
    send `{}` with `Content-Type: application/json`. `DELETE /api/app/calendar_block/<id>` reads
    its body with `get_json(silent=True)`, so a bodyless request is honoured rather than answered
    415 (bug B-019 — an already-installed mobile build cannot be patched retroactively)
14. The scope dialog shown for a RECURRING block event is worded for an event, not a class
    (`calendar.eventScope.*`, "Delete event" / "Only this event"). `calendar.scope.*` stays
    class-worded and is what `ClassDetailSheet` uses

### Acceptance Criteria

#### Deep link opens the class in its own week
- **Given** a coach with a class on a day in a later week than today's
- **When** they open `/calendar?classId=<that event's id>&date=<that class's date>`
- **Then** the calendar shows the week containing that date and the class detail sheet for that
  occurrence is open
- **And** the query params are gone from the URL, so closing the sheet does not re-open it

#### Repeatedly invited student appears once in the guest list
- **Given** a class instance where student Bob has three `NotificationEvent` rows (round 1 `expired`, round 2 `sent`, a manual `sent`) and student Alice has one `sent` row
- **When** the coach opens that class's detail sheet and expands the invited section
- **Then** the invited list shows exactly two rows, one for Bob and one for Alice
- **And** the collapsed header reads "Invited (2)"

#### A response outranks a pending invite for the same student
- **Given** a student with both a `confirmed` invite and a later `sent` invite for the same instance
- **When** the class-detail payload is serialized
- **Then** that student's single entry has status `confirmed`

#### Deleting a one-off event succeeds
- **Given** a coach viewing a non-recurring personal/break/holiday/off-work event
- **When** they confirm the delete
- **Then** the client sends a DELETE carrying a JSON body (`{}`, no `occDate`, no `scope`)
- **And** the API answers 204, the `calendar_blocks` row is gone, and the calendar returns without
  the event — no "failed to delete" toast
- **And** the same DELETE sent with no body at all is still honoured (204), not rejected with 415
