---
id: classes.join-requests
status: implemented
depends_on: [eligibility.open-spot-visibility, eligibility.enforcement, classes.instances, notifications.invitations, messaging.messages]
implements: ../../specs-business/classes/student-joins-and-views-classes.business.md
governed_by: []
---

# classes.join-requests


### Intent
A student who can see an open spot (`eligibility.open-spot-visibility`) can **ask to attend**. The
coach accepts or rejects. A spot can therefore now be filled two ways — by the invitation engine or
by a student's request — and whichever lands first wins.

### Entities
- **ClassJoinRequest** (`class_join_requests`): lesson_instance_id, player_id, coach_id,
  status (`pending` | `accepted` | `rejected` | `withdrawn` | `superseded`), created_at, decided_at,
  decided_by_coach_id, note (PAD-358: optional, ≤ 500 characters). Unique on `(lesson_instance_id, player_id)` among `pending` rows.

### Rules
1. **Only an eligible student may request**, and only for a class that is visible to them with an
   empty spot. Eligibility is re-checked server-side on request — a client that shows a stale
   calendar cannot create an ineligible request.
2. **Requesting a non-materialized recurrence occurrence materializes it first**
   (`get_or_materialize_instance`), because a request must attach to a real instance. This is the
   one path where a student's action creates an instance row.
3. A student may not request a class they are already enrolled in, and a second `pending` request for
   the same class is idempotent rather than a duplicate.
4. A student may **withdraw** their own pending request. Withdrawal is silent — no coach alert.
5. **The coach is notified of every request** and accepts or rejects it. Acceptance and rejection are
   the coach's alone; nothing about a request is automatic.
6. **On accept**, the student is enrolled exactly as any other enrolment: enrolment association plus
   presence, through the same path the invitation engine uses (`_add_player_to_instance`). Any
   vacancy for that spot is marked filled and attributed to the requesting student. **Which spot
   (PAD-715, D7 of PAD-672; owner 2026-10-21, Q7):** a left or right student takes an open spot of
   their own side (else a side-less one, else the oldest); a `both` or side-less student takes the
   spot whose closing leaves the class most balanced — the going players' sides plus the sides of the
   spots still open — the oldest on a tie (`vacancy_for_joiner`). Before PAD-715 it was always the
   oldest open spot, so in a class of 10 with 4 left and 4 right going a right student could close
   the left spot and the class end 4 / 6. The accept then re-counts the class's other open spots
   with the student counted as going (`notifications.invitations` rule 2d), and the closed spot's
   live invitations move or end by rule 18a, exactly as after a "yes".
7. **Eligibility is re-checked at accept time.** Between request and decision the student's level or
   absence record may have changed. A student who no longer passes the bar is not silently enrolled:
   the coach gets the same named-reason warning as a manual add (`eligibility.enforcement` rule 7)
   and may proceed anyway — accepting a request is a manual add.
8. **On accept, a credit is consumed exactly as a normal enrolment consumes one.** In the current
   schema the only credit balance that exists is `StandingWaitingListEntry.credits_*`, so this means:
   if the requesting student holds an active standing waiting-list entry with that coach, accepting
   consumes one of its credits and deactivates the entry when the cap is reached, exactly as
   accepting a waiting-list invitation does (`notifications.waiting-list` rule 15, PAD-446). A student with no standing entry has no
   credit balance to debit and is enrolled without one. **This rule is the open question flagged with
   the stakeholder** — if "credit" is meant to be a general per-enrolment balance, that is a new
   entity and this rule changes.
9. **On reject, nothing happens** — the request closes as `rejected`, the spot stays open, and the
   student is told.
10. **First fill wins.** The moment a spot is filled by any path — an accepted request, an accepted
    invitation (a waiting-list student's included), or a manual add — that spot is gone:
    - the class stops appearing as an open spot in every student's calendar;
    - invitation messages already sent for it are retired exactly as they are today when a spot is
      taken (the existing `spot_filled` / invite-retirement path);
    - all other `pending` requests for that spot become `superseded`.
11. **Superseded requesters are answered according to the coach's `auto_notify_enabled` setting:**
    - **On** — the system replies to each of them automatically ("this spot has been taken").
    - **Off** — no automatic reply is sent; the coach answers them by hand, as they wish.
12. **The coach is alerted in chat either way.** Whether auto-notification is on or off, the coach
    receives a "this class is now full" alert naming the pending requests that were superseded. The
    setting only controls whether the *students* get an automatic reply, never whether the coach is
    kept in the loop.
13. **Semi-automatic mode does not gate requests.** `invitation_mode: semi_automatic`
    (`notifications.semi-auto-approval`) exists so a coach approves before the engine solicits
    anybody. A join request is already a coach decision, so it can be accepted regardless of a
    vacancy's `approval_status`, and accepting it resolves any pending approval prompt for that
    vacancy — the spot it guarded is gone.
14. Requests for a class that has started (on the club's clock, PAD-256), been cancelled or completed are rejected by the server and
    any still-pending requests for it are closed.

15. **Wire contract (PAD-131).** Requests are addressed like a class edit — by the calendar event
    (`model`, `originalId`, `date`) — so a virtual occurrence can be requested (rule 2):
    - `POST /app/class-join-requests` `{model, originalId, date, note?}` → `201` with the request, or `200`
      with the already-pending one (rule 3). `note` (PAD-358) is optional, trimmed, ≤ 500 characters
      (`400` beyond); it is stored on the request, shown in the mirrored chat message and returned
      in the coach's `joinRequests[].note`. Refusals are `409` with a `code`: `already_enrolled`,
      `class_closed` (started, cancelled, completed), `not_visible` (the coach does not advertise
      it or the student is not on their roster), `spot_filled` (no empty spot), `ineligible`.
    - `POST /app/class-join-requests/<id>/withdraw` — the requesting student only (rule 4).
    - `POST /app/class-join-requests/<id>/accept` `{confirm?: boolean}` — the class's coach only.
      Without `confirm`, a student who now fails the bar answers `409 {code: "ineligible",
      ineligible: [...]}` in the `eligibility_check` shape (rule 7); a class that is meanwhile full
      answers `409 {code: "spot_filled"}` and the request closes as `superseded` (rule 10).
    - `POST /app/class-join-requests/<id>/reject` — the class's coach only (rule 9).
    - The class payload (`POST /app/class_instance`) carries the requests: a coach gets
      `joinRequests` (the pending ones, `{id, playerId, playerName, status, createdAt}`); a student
      gets `myJoinRequest` (their latest request for that class, or `null`). Nothing about another
      student's request ever reaches a student (`classes.detail-visibility`).
    - Every request or decision is mirrored into the coach ↔ student direct conversation, the same
      channel invitations and cancellations already use: the request itself as a message from the
      student's side (`msg_metadata.joinRequest`, coach push + SSE `join_request_created`), the
      decision and the automatic "spot taken" reply (rule 11) as system messages to the student.
      Each names the class with its day, weekday and time ("… em Sábado 18h no dia 10/04
      (sábado) às 18:00", `notifications.message-templates` rule 17, PAD-519). The coach's
      "class is now full" alert (rule 12) is delivered per superseded requester, inside
      that requester's own conversation, plus one push — a conversation never names a third
      student.
    - First fill wins is enforced where every fill path already converges:
      `_add_player_to_instance`. Once the class holds `max_players`, every other pending request
      for it closes as `superseded` there, whichever path filled the spot.
16. **Reading an open-spot class (PAD-131 × PAD-257).** `classes.detail-visibility` rule 5 limits
    the id-keyed class reads to the class's own people. A student discovering an open spot is not
    one of them yet, so they get one exception, decided by `student_may_view_open_spot` in
    `class_join_request_service`: a student **on the owning coach's roster** may read a class
    **instance** while they hold a join request for it (any status, so they can see its outcome),
    or while the join-request gate would let them ask — the instance is not started, cancelled,
    completed or full, open spots are visible for it (`effective_open_spots_visible`) and they pass
    its eligibility bar. **(PAD-664)** For a client that declares `full-classes` the "not full"
    condition is dropped, so a student can open a full class they found on their calendar and join
    its waiting list (`calendar.view` rule 23); every other condition stands. Everyone else still gets 403, and what they read is the student view
    (`classes.detail-visibility` rule 3). **(B-529, PAD-664)** A never-materialized occurrence is read
    as its series plus a date; the same exception is asked of that one occurrence — the series
    produces the date, it has not started, the lesson is active, visible, has room (or the client
    declares `full-classes`) and the student is eligible — and the read materializes nothing. Reconciled in the 2026-09-10
    batch, where PAD-257 and PAD-131 met.
17. **Both request lists show academy join requests (PAD-460, part 1 of PAD-427; the student's list also shows their waiting lists since PAD-504, `classes.academy-class-booking` rule 11).** A join request
    used to be visible only on its class. Now:
    - `GET /app/class-join-requests` lists the caller's join requests. A coach gets every request
      addressed to them (`coach_id`); a student gets their own. Anyone else gets `403`. Rows are
      newest first (`created_at` desc, then `id` desc), all statuses. Each row is rule 15's
      request shape plus the class it is for: `classTitle`, `date` (club-local `YYYY-MM-DD`),
      `startTime` and `endTime` (`HH:MM`, club wall clock), and `kind: "academy"`.
    - **The coach's "Pedidos de Aula"** (web `/class-requests`, iOS Settings → Pedidos de Aula)
      **and the student's requests list** (Availability, web and iOS) show these rows beside the
      private class requests (`classes.class-requests` rule 9). The two kinds are merged newest
      first and split into the same open (`pending`) / closed sections. An academy row carries an
      "Academy" badge (pt "Aula de academia") and names the class, its date and time, and the
      student (coach) or coach (student). The English badge is not "Academy class": that phrase
      is the seeded "E2E Academy Class" title an E2E regex matches, and the rendered-text ratchet
      would read a locale value equal to it as a new bilingual alternation.
    - **Actions from the list:**
      - The coach may **accept or decline** a pending academy request through rule 15's endpoints.
        Accepting a student who is below the bar asks for the same confirmation the class sheet
        asks (rule 7: `409 ineligible` → confirm → `{confirm: true}`), and every refusal
        (`spot_filled`, `class_closed`, `not_pending`) shows as it does on the class sheet.
      - The student may **withdraw** their own pending request.
      - There's no "propose another time" for academy requests; it exists only for private ones
        (coordinator, 2026-09-26).
    - **Both lists refresh** on `join_request_created`, `join_requests_superseded` and on a
      decision, the same way they refresh on `class_request_changed`.
    - `GET /app/class-requests` is unchanged. Builds that predate this rule never call the new
      endpoint and see the lists as before.

18. **The coach answers an academy request from its chat bubble (PAD-461, part 2 of PAD-427).**
    - **The bubble:** the student's ask is mirrored into the coach ↔ student conversation (rule 15,
      `msg_metadata.joinRequest {id, status}`). The coach's view of that message offers Accept /
      Decline while the request's live status (`GET /app/class-join-requests`, rule 17) is
      `pending`.
    - **Accept** asks rule 7's confirmation on `409 ineligible`; `spot_filled`, `class_closed` and
      `not_pending` show as they do on the class sheet and the list.
    - **Once the request is decided**, withdrawn or superseded, the bubble shows that outcome
      instead of the actions.
    - The student's own copy of the message never offers actions.
    - There's no "propose another time" for academy requests (coordinator, 2026-09-26).

20. **A request names the side the student will play in that class (PAD-672 slice 1; owner's answers
    Q1, Q2, Q6, 2026-10-21; numbering unconfirmed).** The profile side (`Association_CoachPlayer.side`)
    stays the default and is never changed by a request.
    - **Wire.** `POST /api/app/class-join-requests` takes `side`: `"left"`, `"right"` or `"both"`.
      The request stores it (`class_join_requests.side`, nullable). Both request lists and the
      coach's class payload return `side` on each row, and `suggestedProfileSide` (the request's
      side when it is `left`/`right` and the student has no profile side, else `null`) so the coach
      can adopt it for the profile (Q6). The student's own class payload, each open-spot calendar
      event and the academy-classes step carry `profileSide` (`left`|`right`|`both`|null, the student's
      side with that class's coach) for the picker. The clients pre-select it and ask everyone,
      `both` students included (Q1); for a student with no profile side the answer is mandatory.
    - **Old clients keep today's behaviour (coordinator, binding).** The side round trip below exists
      only for a client that declares the `join-side` capability (`X-LevApp-Capabilities`,
      `client-capabilities` convention). A request without `side` from a client that does not
      declare it — every App Store build up to 33 — is created exactly as before: no side check, no
      409, `side` stored as the profile side (`null` when there is none). The token retires when
      no client older than the first build that declares it can still be used (the App Store
      minimum version moves past it).
    - **A spot of that side** is an open vacancy of the class whose side is the requested one,
      `both`, or none; for `side: "both"` any open vacancy. A class with free places but no open
      vacancy yet (before its invitation window) has no side to refuse on: the request is taken.
    - **No spot of that side, but one of another (capable clients only):** `409 side_full` with
      `sides`, the sides of the open spots (`["right"]`), and `requestedSide`, and no request is
      written. The client
      shows two choices: play either side — the same request again with `side: "both"` — or join
      the waiting list of that side (`classes.academy-class-booking` rule 6, with `side`).
    - **Accepting** enrols the student with the request's side written on their presence for that
      occurrence (`presences.side`, PAD-551's per-occurrence side; `both` too since slice 3,
      `classes.instance-enrollment` rule 13a) unless it is empty, and
      closes a spot of that side (rule 6, `vacancy_for_joiner`, which reads that side).
    - **A pending request whose side lost its last spot** (an invitation's "yes" or another accepted
      request filled it — rule 10's fill paths — while the coach had not answered) is **moved to that
      side's waiting list**
      (Q2): it becomes `superseded` and an active waiting-list entry with its side is created (or an
      existing one reactivated), in the same commit as the fill, and the student is told in their
      conversation: pt "A vaga da {lado} em {aula} {quando} foi ocupada. Ficaste em lista de espera
      da {lado}: avisamos-te se abrir uma vaga.", en "The {side} spot in {class} {when} was taken.
      You're on the {side} waiting list: we'll let you know if a spot opens." A `both` request moves
      only when the class has no open spot at all (rule 11's superseding, unchanged otherwise).
    - Manual enrolment (Q8) sets the side through PAD-551's per-occurrence side
      (`classes.instance-enrollment` rule 13); no new endpoint.
    - **Clients (PAD-672 S1 UI; numbering unconfirmed).** Web and iOS ask the side in a sheet
      ("Em que lado queres jogar nesta aula?": Direita, Esquerda, Ambos) before "Pedir para entrar"
      and before a full class's waiting-list join (same sheet, waiting-list theme). The card of the
      profile side is pre-selected and tagged "Habitual" (a `both` student is asked too); with no
      profile side nothing is pre-selected and sending stays disabled. On `409 side_full` the sheet
      offers two choices: "Estou disposto a jogar em ambos" (the same request again with `both`) and
      the waiting list of the side asked for. A coach's join-request row shows the side as a chip and,
      when `suggestedProfileSide` is set, "Usar <lado> no perfil", which saves it through
      `edit_player`; the standing waiting-list add offers the same side choice, defaulting to the
      profile side. Both shells declare `join-side` in the same change that ships the sheet.

21. **A coach can let eligible requests in automatically (PAD-672 slice 2, D6; numbering
    unconfirmed).** With `notifications.config` rule 3a on, a new request is accepted at creation
    through the coach's own accept path (rule 6–9, rule 20's side) when: the class is open and not
    full, the student is not in it, a spot of the request's side is open (rule 20) — or the class has
    room and no vacancy yet —, the student passes the eligibility bar **without** the coach's
    override (rule 7's confirmation is never given automatically), and the student is not on the
    coach's excluded list (`excludedPlayers`). A request that fails any of these waits for the
    coach, exactly as with the setting off. The request's own message (with its note, rule 15) is
    still mirrored into the conversation, so the coach reads the note as information; it shows as
    decided. The student is told as for any accept (rule 19).

### Acceptance Criteria

#### Eligible student requests an open spot
- **Given** an eligible student seeing a visible class with an empty spot
- **When** they request to attend
- **Then** a ClassJoinRequest is created with status `pending`
- **And** the coach is notified

#### Coach accepts
- **Given** a pending request
- **When** the coach accepts
- **Then** the student is enrolled with an association and a presence
- **And** any vacancy for that spot is marked filled and attributed to that student
- **And** the request status becomes `accepted`

#### Coach rejects
- **Given** a pending request
- **When** the coach rejects
- **Then** the request status becomes `rejected`
- **And** the student is not enrolled, the spot stays open, and the student is told

#### Requesting a virtual occurrence materializes it
- **Given** an eligible student and a visible, never-materialized recurrence occurrence with room
- **When** they request to attend it
- **Then** the LessonInstance for that date is created
- **And** the request attaches to it

#### An invitation filling the spot supersedes pending requests, auto-reply on
- **Given** a class with one open spot, two pending join requests, and `auto_notify_enabled` true
- **When** an invited student accepts the invitation
- **Then** both requests become `superseded`
- **And** both requesters receive an automatic "this spot has been taken" reply
- **And** the coach receives a "class is now full" chat alert naming both
- **And** the class no longer appears as an open spot in any student's calendar

#### Same contention with auto-reply off
- **Given** the same setup with `auto_notify_enabled` false
- **When** the spot is filled
- **Then** both requests become `superseded`
- **And** neither requester receives an automatic reply
- **And** the coach still receives the "class is now full" chat alert naming both

#### An accepted request retires outstanding invitations
- **Given** a class with one open spot and two invitations already sent
- **When** the coach accepts a student's join request instead
- **Then** the vacancy is filled by the requesting student
- **And** the two outstanding invitation messages are retired exactly as they are when a spot is
  taken today

#### A student who fell below the bar is not silently enrolled
- **Given** a pending request from a student who was eligible when they requested
- **And** whose absence record has since put them over the coach's limit
- **When** the coach opens the request
- **Then** accepting warns with the named reason before enrolling
- **And** the coach may still proceed

#### A student cannot request a class they are already in
- **Given** a student enrolled in a class
- **When** they attempt to request it
- **Then** the request is rejected by the server

#### An open-spot class can be opened before asking; nobody else gains access (rule 16)
- **Given** a class instance advertising open spots and two students on the coach's roster, one who
  passes its bar and one who does not, neither enrolled
- **When** each opens the class (`POST /api/app/class_instance`)
- **Then** the eligible one gets the student view with `myJoinRequest: null`
- **And** the other gets 403, as does the eligible one while the class is not advertised
- **And** a student who has requested the class reads it with their request in `myJoinRequest`

#### A never-materialized open spot opens too, and the read creates nothing (rule 16, B-529)
- **Given** a one-off class with no LessonInstance row, advertised to an eligible student as an open spot
- **When** they read it as `POST /class_instance?model=Lesson&id=<lesson>&date=<day>` from a client declaring `open-spots`
- **Then** the read answers 200 and no LessonInstance row exists afterwards
- **And** the same read from an undeclared client, or by a student below its bar, answers 403
- **And** when the class is full it answers 200 only for a client that also declares `full-classes`

#### The coach sees an academy request in "Pedidos de Aula" (PAD-460)
- **Given** Carla asked to join Ana's academy class "Terça 18h" on 2026-10-06 18:00–19:00, and Bruno sent Ana a private class request afterwards
- **When** Ana reads `GET /app/class-join-requests`, and opens "Pedidos de Aula"
- **Then** the API returns Carla's request with `classTitle` "Terça 18h", `date` 2026-10-06, `startTime` 18:00, `endTime` 19:00, `status` `pending`, `kind` `academy`
- **And** the list shows Bruno's private request first and Carla's academy request below it, with the "Academy" badge

#### The coach accepts an academy request from the list (PAD-460)
- **Given** Carla's pending academy request above, and Carla within the class's bar
- **When** Ana accepts it from "Pedidos de Aula"
- **Then** Carla is enrolled in that occurrence and the row moves to the closed section as `accepted`

#### The student sees and withdraws her academy request in Availability (PAD-460)
- **Given** Carla's pending academy request
- **When** Carla opens her requests list in Availability
- **Then** the request is listed with the class name, date and time and status `pending`
- **When** she withdraws it there
- **Then** its status becomes `withdrawn`, and Ana's list shows it closed

#### The coach accepts an academy request from the chat (PAD-461)
- **Given** Carla asked to join Ana's academy class "Terça 18h" on 2026-10-06, and the request is `pending`
- **When** Ana opens her conversation with Carla
- **Then** Carla's request message offers Accept and Decline
- **When** Ana accepts it from the bubble
- **Then** Carla is enrolled, the request is `accepted`, and the bubble shows the outcome instead of the actions

#### A decided academy request's bubble shows the outcome (PAD-461)
- **Given** Carla's academy request was already declined from the class sheet
- **When** Ana opens her conversation with Carla
- **Then** the request message shows it was declined and offers no actions
- **And** Carla's own copy of her request message never offers actions

#### The sheet pre-selects the habitual side (PAD-672 S1 UI)
- **Given** Carla's profile side with Ana is left, and Ana's class has an open spot
- **When** Carla taps "Pedir para entrar"
- **Then** the side sheet opens with Esquerda selected and tagged "Habitual", and sending is enabled
- **And** sending posts the request with `side: "left"`

#### No spot on the asked side offers both sides (PAD-672 S1 UI)
- **Given** Carla's profile side is left and the class's only open spot is on the right
- **When** Carla sends her request and the server answers `409 side_full`
- **Then** the sheet shows "Não há vaga na esquerda" with "Estou disposto a jogar em ambos"
- **When** she taps it
- **Then** the request is sent again with `side: "both"` and is `pending`

### Notes
- Rule 8 (credit consumption) is the one rule carrying an explicit assumption; see the flag in the
  rule text.
