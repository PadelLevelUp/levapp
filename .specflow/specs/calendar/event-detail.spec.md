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
3. ClassDetailSheet shows: title, date, time, level, the participants section (for the coach,
   rule 22's grouped list under "Participantes" / "N/M inscritos"), presence list
3a. **(PAD-199, B-017; amended by PAD-313, 2026-09-12; amended by PAD-659, 2026-10-14)** Since
   PAD-659 this rule governs the rows of the STUDENT's view and of the coach's "Editar
   presenças" marking mode; the coach's read view is rule 22's compact list, which carries no
   state word per row (the group title says it) and moves the two detail lines below into the
   player pop-up (rule 23). A participant row shows exactly ONE
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
5. The "capacity" field shows effective filled spots over `maxPlayers` — the same value as the calendar event card's `X/Y` (see calendar.view rules 8–9). Declined students are excluded from both. **(PAD-313)** That is the ONE meaning of a count anywhere on this sheet: the capacity header, the participants list header and the coach's attendance header all render `effectiveFilledSpots`, so they cannot contradict each other the way "Capacity 0/4 — 4 open" above "Participants (1/4)" did. A not-coming student stays IN the list, visibly not coming by their state word, and out of every count. **(B-240)** While the coach edits the class, the counts are over the draft's students: a declined student the coach unticked is neither listed nor subtracted (`effectiveFilledSpotsOf`, `@levelup/config`). **(PAD-659,
   2026-10-14) One named exception:** the coach's participants header reads "N/M inscritos" /
   "N/M enrolled", N being the enrolled rows the list shows (`participants.length`, the draft's
   while editing) and M `maxPlayers`. The old "Participantes (1/4)" counted only the coming
   students above a list of every enrolled one, which is the confusion PAD-659 reports; the
   header now names its own quantity, the capacity card keeps `effectiveFilledSpots`, and rule
   22's group counts carry the breakdown, so the two numbers measure different things by name
   and cannot be read as a contradiction
6. The class-detail "invited" (convidados) list is keyed by STUDENT, not by invite record. A student who received several `NotificationEvent` rows for the same instance (multiple rounds, a manual invite plus an automatic one, a re-invite after a decline — all legitimate per notifications.invitations) appears exactly ONCE. The `invitations` array returned by the class-detail payload therefore contains at most one entry per `playerId`
7. De-duplication happens in the backend serializer (`serialize_class_instance`) so every surface — web detail sheet, mobile — sees the same one-row-per-student list. No client performs its own de-duplication
8. Tie-break when a student has several invite records for the same instance: an accepted one (`confirmed`) wins; otherwise the most recently created record wins (highest `id`), whatever its state, so a student invited again after an earlier invite expired, was filled or was declined shows the new invite's state (PAD-773). The surviving entry keeps that record's own `id`, so coach response actions still target a real `NotificationEvent`. The row keeps the position of the student's first invite.
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
    `maxPlayers`. **The class payload itself says `isRecurring` (B-422, PAD-560 follow-up):** a
    deep-linked screen has no calendar event to read the flag from, and without it the waiting
    list's series scopes (rule 20) were hidden; iOS reads `isRecurring` from the payload, or falls
    back to a non-null `recurrenceEnd`. The full params stay the fast path: an in-app tap passes them and the screen
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
    `NotificationEvent.status`, `.answer`, `.withdrawn_by_coach_at`, `.retired_reason` and the vacancy:

    | first match | `outcome` | pt / en label |
    |---|---|---|
    | `status` is `confirmed` | `accepted` | Aceitou / Accepted |
    | `answer` is `no` | `declined` | Recusou / Declined |
    | `withdrawn_by_coach_at` is set | `withdrawn` | Convite retirado / Invitation withdrawn |
    | `status` is `sent` or `queued` | `pending` | Ainda sem resposta / No answer yet |
    | `answer` is `yes` (a late yes), `retired_reason` is `spot_filled`, or the vacancy is `filled` | `spot_filled` | Vaga preenchida / Spot filled |
    | otherwise (`expired` with no answer: the class started, or a manual invitation lapsed) | `expired` | Expirou / Expired |

    "Recusou" therefore appears only for a recorded "no"; the old rendering of every `expired` row as
    "Recusado" mislabelled the students whose spot simply went to someone else. `queued` reads as
    `pending`: the coach's question is whether the student has answered, not whether the batch has
    left. When `answeredBy` is `coach`, the row adds the secondary text "registado pelo treinador" /
    "recorded by the coach" under the label. Rule 8's tie-break picks the record; the surviving
    record's own `outcome` is shown.
    An invitation retired because its spot or the class filled carries that reason on the record
    (`retired_reason = "spot_filled"`, set by the one retire path, `_retire_invite_message`), and the
    list reads it: 'Vaga preenchida', the chat bubble's word. 'Expirou' is only for an invite whose
    answer time ran out or whose class started (PAD-773).
    **PAD-719:** each entry also carries `movedAt` (ISO, or `null`): set when the engine moved the
    invitation from another spot of the class (`notifications.invitations` rule 18a). Such a row adds
    "transferido da vaga anterior" / "moved from the previous spot" under the label, after the
    coach's note when both apply. Both shells take the notes from one shared helper
    (`inviteeNotes`, `@levelup/config`) and render each as `invitee-<id>-<playerId>`. The field is
    new and optional, so older builds ignore it; no capability gate.
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
    yes/no buttons; iOS: a per-row "…" button that opens an inline row of the same actions
    under the invitee (in-app controls with test ids, not a native alert, which cannot carry one). Both
    shells update the row from the server's answer and the `notification_responded` live event.
18. **The coach deletes an invitation (PAD-548).** "Eliminar convite" first shows the warning
    "A pessoa convidada vai ver a mensagem do convite na mesma, mas como vaga ocupada." / "The
    invited person will still see the invitation message, but as spot filled." with Cancel and
    Delete; confirming calls `DELETE /api/app/notify/invitations/<id>` (`notifications.invitations`
    rule 19) and the row reads `withdrawn`. An answer of `confirmed` (the student accepted first)
    refreshes the row to `accepted` with a toast saying so. Web and iOS: the screen's `AlertDialog`, with a
    destructive Delete.
19. **The class shows its waiting list to the coach (PAD-547, PAD-560; numbering unconfirmed; 16–18
    are PAD-548's).** Below the invited list, a "Lista de espera (N)" section lists the payload's
    `waitingList` (`notifications.waiting-list` rule 20) in the order the engine asks them, each
    row with the student's name, an origin label — "Lista permanente" / "Standing list", "Pedido do
    aluno" / "Student's request", "Adicionado pelo treinador" / "Added by the coach" — and, from
    the row's `scope` (PAD-560), how long they are on this list: "Só esta aula" / "This class only"
    (`occurrence`), "Toda a série" / "The whole series" (`series`), "Até <data>" / "Until <date>"
    (`period` and `standing`, the row's `expiresOn` as a short numeric date in the account's
    locale — `formatShortDate`, as the class-request wizards print one). A coach-wide standing row
    (`scope: standing`) adds one short line, "Gerida em Definições › Lista permanente" / "Managed in
    Settings › Standing list": changing it would change the student's other classes, so the class
    offers no edit of it (coordinator decision 2026-10-09). Each row has a remove control
    (`notifications.waiting-list` rule 21) with no confirmation — removing is undone by adding
    again — and every row but a coach-wide standing one has an edit control that opens rule 20's
    dialog in edit mode (`notifications.waiting-list` rule 22). The section shows for the coach
    only, also when the list is empty, since that is where the add starts. Web and iOS.
20. **Adding from the class (PAD-547, PAD-560).** "Adicionar à lista de espera" opens a picker of
    the coach's roster, without the students already in the class or on its list: one name search
    field above a list of rows, on both shells, and no second control (B-421: web's native select,
    whose options the search narrowed out of sight, is gone). Tapping a row chooses that student. A
    student who would fail the class's eligibility bar is marked with the reason, inline on the
    row, the way the class editor's student picker marks one (`check_eligibility`, PAD-133) and can
    still be chosen (coordinator, 2026-10-07: the coach decides; the engine still filters when a
    spot opens). Then the coach picks the scope: "Só esta aula" / "This class only"; for a recurring
    class also "Toda a série" / "The whole series", which asks nothing more and says the date the
    entry will run to (`notifications.waiting-list` rule 19), and "Durante um período" / "For a
    period", which asks for exactly one of a number of classes ("durante X aulas", 1–52) or an end
    date ("até ao dia", today to 12 months ahead) (`notifications.waiting-list` rule 19a). Web: a
    dialog; iOS: a sheet. Both refresh the list from the server's answer and the
    `waiting_list_changed` event. In edit mode (a row's edit control, rule 19) the dialog is titled
    "Editar lista de espera" / "Edit waiting list", shows the student's name in place of the search
    and list, opens on the row's scope and end, and saves through `notifications.waiting-list` rule
    22. The search (PAD-558)
    is the class editor's student-picker rule (`nameMatchesQuery`, PAD-516): every typed word must
    appear in the name, in any order, and accents, case and punctuation don't matter. A blank
    search offers everyone. The search only narrows what is offered: a student already chosen
    stays chosen and stays listed.

21. **(PAD-591) The class detail reads the coach's notification settings once.** One
    `POST /class_instance` resolves the class's coach `NotificationConfig` once and passes it to
    every serializer and service that needs it; the roster is loaded with its players and their
    users eagerly. The payload is unchanged.

22. **The coach's participant list is compact and grouped (PAD-659; numbering self-assigned,
    unconfirmed).** Outside "Editar presenças", the coach sees every enrolled participant in
    groups, each a title in capitals with its count and a coloured dot, in this order:

    | order | group (`data-group`) | pt / en title | dot | states (`attendance.presence` rule 9) |
    |---|---|---|---|---|
    | 1 | `going` | Vão · N / Going · N | green `#12946B` | `coming`, `attended` |
    | 2 | `pending` | Por responder · N / No answer · N | grey `#8592A8` | `planned` |
    | 3 | `not_going` | Não vão · N / Not going · N | red `#D3453B` | `not_coming`, `missed` |

    `attended` and `missed` join the intent groups because a coach's mark before the class is
    stored validated (`lesson_service.add_presences`), and to the coach looking at a class that
    mark means "vai" / "não vai" (PAD-663). An empty group is not rendered. Within a group the
    order is side — `both` (Amb), `right` (Dir), `left` (Esq), unset last — then the name compared
    in Portuguese (`localeCompare(…, "pt")`, so "Álvaro" sits with the A's). The grouping and the
    order are computed by ONE helper in `@levelup/config` that both shells render; neither shell
    sorts on its own. Side and level are not on a class participant: they are read from the
    coach's roster (`CoachPlayer`, joined on the player id), and a participant missing from the
    roster sorts as "no side" and shows no level.
    Each row: a 26 px initials avatar (`#E8F1FF` on `#1355DC`), the name (14 px, 600, one line
    with an ellipsis) and, on the right, a side chip "Amb" / "Dir" / "Esq" ("Both" / "Right" /
    "Left") whose tooltip (web `title`) reads "Ambos os lados" / "Lado direito" / "Lado
    esquerdo". No level, no state word, no arrow. Rows sit in one bordered container per group
    (radius 12 px, 1 px `border-subtle` separators, no per-row card and no shadow); web rows are
    34 px high, mobile and web-at-phone-width rows at least 44 px. Test ids: the group
    `participant-group` with `data-group`; the row `participant-row-<playerId>` carrying the row's
    `data-state` (rule 9's value, unchanged, so a test can still read the state); the name/avatar
    button `participant-open-<playerId>`; the chip `participant-side`.
    Waiting-list players and pending invitations are NOT in this list: they keep their own
    sections (rules 16–20). The student's view of a class is unchanged by this rule.
    "Editar presenças" (web, and now iOS/Android, where marking used to be always on) switches the
    section to the marking rows of rule 3a; saving or cancelling returns to the grouped list. The
    toggle on mobile has the web's test id, `attendance-edit`.

23. **The player pop-up (PAD-659).** Tapping a row's name or avatar opens that player's profile
    over the class: a dialog on web (`role="dialog"`, focus trapped, focus returned to the
    tapped name on close) and a bottom sheet on iOS and Android. The side chip does not open it.
    It shows: a navy header with the avatar, the name, the side in full ("Lado direito") and the
    level ("Nível 3+", from the roster; absent when the roster has none); then "Nesta aula" with
    rule 22's group word for that player (Vai / Por responder / Não vai — Going / No answer /
    Not going); "Assiduidade" with the attended and missed counts of `attendance.history`
    (`/app/attendance_history`, `/app/absence_history`, the coach's own roster player, their
    default span); "Última avaliação" with the newest `evaluatedAt` of the player's profile, or
    "Sem avaliações"; "Contacto" with the roster's phone, else the email, else "—". The two
    detail lines rule 3a used to carry on the row live here now: "Lembrete enviado" while the
    player is `planned` and `reminderSentAt` is set, and the cancelled-by-student line
    (`cancellationDetail`) when it applies. Actions: "Enviar mensagem" opens (or creates) the
    conversation with the player and "Ver perfil completo" opens the player's page (web
    `/players/<playerId>`, mobile `/player/<playerId>`). Closing — the X, Esc, or a tap
    outside — closes ONLY the pop-up: the class detail stays open at the same scroll position.
    Test ids: `participant-popup`, `participant-popup-close`, `participant-popup-state` (with
    `data-group`), `participant-popup-message`, `participant-popup-profile`.

24. **The class learns of presence changes live (PAD-659).** Every write that moves a presence —
    the student's reminder answer (`respond_to_reminder`), a cancellation or proactive decline
    (`cancel_attendance`), the coach's marks and clears (`add_presences`) — publishes, after its
    commit, `{"type": "presence_changed", "payload": {"lessonInstanceId", "playerId"}}` to the
    class's coach only; the payload also names `lessonId` and the occurrence `date`. Both shells
    test the event with one predicate in `@levelup/config` (`presenceChangedFor(evt, instanceId,
    occurrence)`, the sibling of `reminderArrivedFor`) and refetch the open class, so a player
    moves to their new group without a reload. **(B-548)** The open class's instance id is read
    by `liveInstanceIdOf` — a presence's `lessonInstanceId`, else a `lessoninstance-<n>` event id
    — never from the web sheet's `classInstance.id`, which is the calendar-event id; an occurrence
    opened before it was materialised matches by its lesson and date. A student receives no
    such event: nothing in their own view depends on another student's presence.

25. **"Vai / Não vai" whoever marked (PAD-663; numbering self-assigned, unconfirmed).** Before a
    class ends, every display of a student's state in that class says the INTENT — coach: "Vai" /
    "Não vai" (en "Going" / "Not going"); the student about themselves: "Vais" / "Não vais" —
    whether the student answered or the coach marked. A coach's mark is stored validated
    (`attended` / `missed`), so the word and its tone are chosen by ONE helper in
    `@levelup/config` (`displayStateOf(state, classHasEnded(date, endTime))`) from the state and
    whether the class has ended on the club's clock (an unreadable time counts as not ended): before the end `attended` reads as `coming` and `missed` as `not_coming`; after the
    end they keep "Presente" / "Faltou". `data-state` and the `attendance-state-<state>` test ids
    keep rule 9's stored value — only the word and tone follow the display state. `planned` keeps
    its word ("Inscrito") on rows; the class-detail groups and pop-up say "Por responder". The
    displays this covers (inventory of 2026-10-14): web `AttendanceRow` (the student's row in the
    class detail and the coach's marking rows), iOS/Android `ParticipantRow` (the same two), and
    the student's own state badge on the iOS/Android class screen. Not covered, because they are
    attendance validation: the validation dialog (`ValidateClassesDialog`, web; the Presences
    tab, mobile) and the coach's mark buttons ("Presente", "Ausente", "Justificada",
    "Injustificada"), which do not change. The calendar cards' relation chips and the dashboard
    attendance counts already say "Não vou" / "Presenças" / "Faltas" and are unchanged.

### Acceptance Criteria

#### Sixteen players fit on a laptop, grouped and ordered (rule 22, PAD-659)
- **Given** a class of 16 with 4 coming (sides Esq, Dir, Amb, Dir), 8 who have not answered and 4
  not coming, and "Álvaro" and "Bruno" among the Por responder players, both on the right side
- **When** the coach opens it on web at 1440×900 and scrolls the sheet to Participantes
- **Then** all 16 rows are inside the viewport at once and the list has no scroll of its own
- **And** the groups read "VÃO · 4", "POR RESPONDER · 8", "NÃO VÃO · 4" in that order, the Vão
  rows run Amb, Dir, Dir, Esq, and Álvaro is listed before Bruno
- **And** no row shows a level or a state word, and the header reads "16/16 inscritos"

#### A student invited again shows the new invite (rules 8, 16, PAD-773)
- **Given** case 11 was invited by hand to the class's last spot, and case 12's request to join
  took it, so case 11's invite reads "Vaga preenchida" in the chat
- **When** the class's list is read
- **Then** case 11's row reads "Vaga preenchida", not "Expirou"
- **And** when case 12 then says "Não vou" and case 11 is invited again, the row is the new invite:
  "Ainda sem resposta"

#### A later batch shows on the open class (PAD-773)
- **Given** the coach has the class open
- **When** the tick sends the next batch of a spot's invitations
- **Then** the class's invited list shows them without reopening (the batch publishes `notify_sent`)

#### An empty group is not shown (rule 22)
- **Given** a class whose 3 participants have all answered "Vou"
- **When** the coach opens it
- **Then** only the "VÃO · 3" group is rendered

#### A coach's own mark lands in Vão, not "Presente" (rules 22, 25, PAD-663)
- **Given** a class tomorrow and a student the coach marks present in "Editar presenças"
- **When** the coach saves
- **Then** the student's row sits in "VÃO" and their pop-up reads "Nesta aula: Vai"
- **And** the student's own view of that class reads "Vais", not "Presente", and the coach's
  marking row for them reads "Vai" while its `data-state` stays `attended`
- **And** after the class has ended, the student's history shows "Presente", and the validation
  dialog still offers "Presente / Justificada / Injustificada"

#### The pop-up opens and returns the coach where they were (rule 23)
- **Given** the coach scrolled the class detail to Participantes
- **When** they click a player's name, then close the pop-up with Esc (and again with the X, and
  again by clicking outside)
- **Then** the pop-up showed the player's side in full, their level, "Nesta aula", assiduidade,
  última avaliação and contacto
- **And** after each close the class detail is still open at the same scroll position and focus
  is back on that player's name
- **And** clicking the side chip opens nothing

#### A student's answer regroups the open class live (rule 24)
- **Given** the coach has a class open with Ana in "POR RESPONDER"
- **When** Ana answers the reminder "Não vou" from her own session
- **Then** without a reload Ana's row moves to "NÃO VÃO" and the group counts change
- **And** the backend published `presence_changed` with that class's id and Ana's player id to the
  coach and to no student

#### The word changes at the class's end time (rule 25, pinned clock)
- **Given** a class on 2026-10-20 ending 21:30 club time, and a student the coach marked present
- **When** a display reads that student at 21:29 club time, and again at 21:31
- **Then** at 21:29 it reads "Vai" (the student: "Vais"), and at 21:31 it reads "Presente"

#### Mobile shows the same list behind an edit toggle (rules 22–23)
- **Given** the same class on iOS
- **When** the coach opens it
- **Then** the groups, order and side chips match web, rows are at least 44 px high, and no mark
  buttons show until the coach taps "Editar presenças"
- **And** tapping a name opens a bottom sheet with the same contents, and closing it leaves the
  class screen where it was


#### A class detail costs a fixed number of statements (rule 21, PAD-591)
- **Given** a class instance with 3 participants and another with 12
- **When** the coach opens each with `POST /class_instance` under a statement recorder
- **Then** both issue the same number of statements and `notification_configs` is read at most
  once per request

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
#### The coach sees and edits a class's waiting list (rules 19–20, PAD-547)
- **Given** a class occurrence with Bruno on its waiting list from a standing entry, on web and on iOS
- **When** the coach opens the class and adds Carla, who fails the class's level bar, for this class only
- **Then** the picker marks Carla with the level reason and still lets the coach choose her
- **And** the list then reads Bruno "Lista permanente · Até 31/12/2026" and Carla "Adicionado pelo treinador · Só esta aula"
- **And** removing Carla's row takes her off the list at once
#### A coach-wide standing row says it is managed in Settings (rule 19, PAD-560)
- **Given** Bruno on the class's waiting list from a coach-wide standing entry running to 2026-12-31, on web and on iOS
- **When** the coach reads the class's waiting list
- **Then** Bruno's row reads "Lista permanente", "Até 31/12/2026" and "Gerida em Definições › Lista permanente"
- **And** the row has a remove control and no edit control
#### The coach puts a student on the whole series, or for a period, from the class (rule 20, PAD-560)
- **Given** a weekly class's detail on web and on iOS, Carla and Dinis on the roster
- **When** the coach adds Carla choosing "Toda a série"
- **Then** no date or number is asked, the dialog says the date the entry runs to, and Carla's row reads "Toda a série"
- **When** the coach adds Dinis choosing "Durante um período" with 3 classes
- **Then** Dinis's row reads "Até <the third occurrence's date>"
- **And** a non-recurring class offers "Só esta aula" only
#### The coach changes a row's scope from the class (rules 19–20, PAD-560)
- **Given** Carla on the class's list "Só esta aula", on web and on iOS
- **When** the coach opens her row's edit control and chooses "Toda a série"
- **Then** the dialog shows her name with no search, and after saving her row reads "Toda a série"
- **And** opening the edit again shows "Toda a série" selected
#### The waiting-list picker searches by name (rule 20, PAD-558)
- **Given** the add picker of a class whose candidates include "Álvaro Sousa", "Ana Pinto" and "Bruno Álves", on web and on iOS
- **When** the coach types "sousa alv" in its search
- **Then** only Álvaro Sousa's row is shown, and there is no other control listing the candidates (B-421)
- **And** clearing the search shows all three again
- **And** a student chosen before the search changed stays chosen and listed even when the search no longer matches them
