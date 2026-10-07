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
3a. **(PAD-199, B-017; amended by PAD-313, 2026-09-12)** A participant row shows exactly ONE
   state word: the single `attendanceState` of `attendance.presence` rule 9, read through the
   shared helper in `@levelup/config` (`attendance-state`), exposed as
   `data-testid="attendance-state"` with `data-state="planned" | "coming" | "not_coming" |
   "attended" | "missed"`. Both shells (`AttendanceRow.tsx`, `ParticipantRow.tsx`) read that one
   field and no longer read `confirmed`, `status`, `justification` or `validated` to decide what
   to display — the old chip said "Confirmed attendance" whenever `confirmed` was set, and
   `confirmed` means *answered*, so a student who had cancelled read as confirmed
   (`attendance.confirm` rule 25).
   **B-017's signal survives as a conditional detail line, not a badge.** "Reminder sent" is
   still gated on `Presence.reminderSentAt` (`attendance.presence` rule 1a), never on
   `Presence.invited` — but it is secondary text and renders **only while the state is
   `planned`** (`data-testid="attendance-reminder-hint"`). It answers "have they been asked
   yet?", which is only an open question while nobody has answered; on any other state it is
   noise beside the state word, and a second line on a row is how a second badge grows back.
   `planned` with no reminder shows the state word alone, and that absence is itself the signal
   the coach acts on. Decided by the coordinator, 2026-09-12.
4. Actions available: Mark attendance, Edit, Delete, Notify, Training planning
5. The "capacity" field shows effective filled spots over `maxPlayers` — the same value as the calendar event card's `X/Y` (see calendar.view rules 8–9). Declined students are excluded from both. **(PAD-313)** That is the ONE meaning of a count anywhere on this sheet: the capacity header, the participants list header and the coach's attendance header all render `effectiveFilledSpots`, so they cannot contradict each other the way "Capacity 0/4 — 4 open" above "Participants (1/4)" did. A not-coming student stays IN the list, visibly not coming by their state word, and out of every count. **(B-240)** While the coach edits the class, the counts are over the draft's students: a declined student the coach unticked is neither listed nor subtracted (`effectiveFilledSpotsOf`, `@levelup/config`)
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
    415 (bug B-021 — an already-installed mobile build cannot be patched retroactively)
14. The scope dialog shown for a RECURRING block event is worded for an event, not a class
    (`calendar.eventScope.*`, "Delete event" / "Only this event"). `calendar.scope.*` stays
    class-worded and is what `ClassDetailSheet` uses

15. **An instance id is enough to open a class on iOS (PAD-326; number self-assigned,
    unconfirmed).** `app/class/[id].tsx` rebuilds its `CalendarEvent` from route params
    (`id`, `model`, `originalId`, `date`) and, when those are incomplete, resolves the class
    from the id alone through `GET /api/app/lesson_instance/<id>` — JWT'd and role-filtered,
    already carrying `lessonId`, `date`, `startTime`, `endTime`, `name`, `color` and
    `maxPlayers`. The full params stay the fast path: an in-app tap passes them and the screen
    renders without a round trip. What changes is that a route carrying only an id — a push, a
    universal link from an email, a message's `lessonInstanceId` — is no longer a dead end.
    - **Three states, never one.** An incomplete route with no usable id is "could not find"
      (nothing to ask about); a resolvable id that 404s is **"this class no longer exists"**,
      permanent and offered without a Retry, because retrying a deleted class is pointless; a
      transient failure keeps "could not load" WITH Retry. Collapsing these is what made
      yesterday's founder report unreadable — the screen said "could not find" for a route it
      had never asked about, which is indistinguishable from a class that is genuinely gone.
    - The dangling ids this exposes are real: messages carry `lessonInstanceId` with **no
      foreign key** to `lesson_instances` (ledger B-059), so ids that no longer resolve exist
      in production today. This rule makes them visible and legible rather than reachable and
      silent; PAD-325 owns what a message should do about them.
    - **(PAD-325) Gone is not a failure, and every state has a way back.** The "no longer
      exists" state carries its own title ("Class removed" / "Aula removida"), not the generic
      "Something went wrong". Each of the three states (loading included) shows the same back
      control as the full screen (`class-detail-back`); it returns to the previous screen, or to
      home when the class was the first screen opened. Before this, the stack's hidden header
      left the swipe gesture as the only exit. iOS only: web has no class-not-found screen, and
      a calendar deep link to a gone class opens nothing.

16. **Each invitee shows one of six outcomes, computed once in the serializer (PAD-548; numbering
    unconfirmed).** Every `invitations` entry carries `outcome`, `answer` (`yes` | `no` | `null`) and
    `answeredBy` (`student` | `coach` | `null`) beside `status`; both shells render `outcome` and
    never derive a label from `status` themselves. The serializer decides it in this order, from
    `NotificationEvent.status`, `.answer`, `.withdrawn_by_coach_at` and the vacancy:

    | first match | `outcome` | pt / en label |
    |---|---|---|
    | `status` is `confirmed` | `accepted` | Aceitou / Accepted |
    | `answer` is `no` | `declined` | Recusou / Declined |
    | `withdrawn_by_coach_at` is set | `withdrawn` | Convite retirado / Invitation withdrawn |
    | `status` is `sent` or `queued` | `pending` | Ainda sem resposta / No answer yet |
    | `answer` is `yes` (a late yes), or the vacancy is `filled` | `spot_filled` | Vaga preenchida / Spot filled |
    | otherwise (`expired` with no answer: the class started, or a manual invitation lapsed) | `expired` | Expirou / Expired |

    "Recusou" therefore appears only for a recorded "no"; the old rendering of every `expired` row as
    "Recusado" mislabelled the students whose spot simply went to someone else. `queued` reads as
    `pending`: the coach's question is whether the student has answered, not whether the batch has
    left. When `answeredBy` is `coach`, the row adds the secondary text "registado pelo treinador" /
    "recorded by the coach" under the label. Rule 8's tie-break is unchanged; the surviving record's
    own `outcome` is shown.
17. **The coach answers for an invitee (PAD-548).** A `pending` row offers "Marcar como aceitou",
    "Marcar como recusou" and "Eliminar convite" (rule 18); a `declined` row offers "Marcar como
    aceitou" only (the coach deciding is not the engine inviting, `notifications.invitations` rule
    18); `accepted`, `withdrawn`, `spot_filled` and `expired` rows offer nothing — a student leaves
    a class through attendance, never through the invitation. Accept and decline call the existing
    `POST /api/app/notify/coach_respond` (`notifications.invitations` rule 9), which stamps
    `answered_by = "coach"`, and the row then shows the outcome the server answered: `confirmed` →
    `accepted`; `declined` → `declined`; `spot_filled` → the row reads `spot_filled` and a toast says
    the class is full (no over-capacity: the existing refusal stands); `expired` → the class is over,
    toast. Web: a per-row actions menu (the sheet's `DropdownMenu`), replacing the two disabled
    yes/no buttons; iOS: a per-row "…" button opening a native `Alert` with the same actions. Both
    shells update the row from the server's answer and the `notification_responded` live event.
18. **The coach deletes an invitation (PAD-548).** "Eliminar convite" first shows the warning
    "A pessoa convidada vai ver a mensagem do convite na mesma, mas como vaga ocupada." / "The
    invited person will still see the invitation message, but as spot filled." with Cancel and
    Delete; confirming calls `DELETE /api/app/notify/invitations/<id>` (`notifications.invitations`
    rule 19) and the row reads `withdrawn`. A 409 `confirmed` (the student accepted first) refreshes
    the row to `accepted` with a toast saying so. Web `AlertDialog`; iOS `Alert` with a destructive
    button.

### Acceptance Criteria

#### Unticking a declined student in an edit does not lower the count (rule 5, B-240)
- **Given** a class of 4 whose saved roster is Ana (declined) and Bruno (coming)
- **When** the coach edits it and unticks Ana
- **Then** the capacity card and the participants header both read 1/4, not 0/4

#### An instance id is enough to open a class (PAD-326)
- **Given** a route to the class screen carrying only an instance id
- **When** the screen opens
- **Then** it fetches that instance and renders the class, rather than reporting that the class
  could not be found

- **Given** the same route, and the instance no longer exists
- **Then** the screen says the class no longer exists and offers no Retry

- **Given** a route carrying the full params
- **Then** the screen renders from them without fetching by id

- **Given** a route with neither usable params nor a usable id
- **Then** the screen says the class could not be found, as before


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

#### Invitees show their outcome, not their status (rule 16, PAD-548)
- **Given** a class occurrence with six invited students: Ana `confirmed`; Bruno `expired` with `answer = "no"` recorded by the coach; Carla `expired` with `withdrawn_by_coach_at` set; Dinis `sent`; Eva `expired`, `answer = "yes"`, on a vacancy that is `filled`; Filipe `expired` with no answer on a manual invitation after the class started
- **When** the coach opens the class detail and expands the invited section, on web and on iOS
- **Then** the rows read Ana "Aceitou", Bruno "Recusou" with "registado pelo treinador", Carla "Convite retirado", Dinis "Ainda sem resposta", Eva "Vaga preenchida", Filipe "Expirou"
- **And** the payload entries carry `outcome` `accepted`, `declined`, `withdrawn`, `pending`, `spot_filled`, `expired` respectively, and Bruno's `answeredBy` is `coach`

#### The coach records an answer for an invitee (rule 17)
- **Given** Dinis's row reads "Ainda sem resposta" on a class with one open spot
- **When** the coach chooses "Marcar como aceitou"
- **Then** the row reads "Aceitou" with "registado pelo treinador", Dinis is on the class roster, and his invitation bubble shows Accepted
- **And** choosing "Marcar como recusou" on another pending row reads "Recusou" with the same secondary text, and the engine never invites that student to this occurrence again

#### The coach deletes an invitation (rule 18)
- **Given** Dinis's row reads "Ainda sem resposta"
- **When** the coach chooses "Eliminar convite", reads the warning and confirms
- **Then** the row reads "Convite retirado", Dinis's bubble shows "Vaga preenchida" with no buttons, and the class's next candidate is invited at once
- **And** cancelling the warning changes nothing
