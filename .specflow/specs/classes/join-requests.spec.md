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
  decided_by_coach_id. Unique on `(lesson_instance_id, player_id)` among `pending` rows.

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
   vacancy for that spot is marked filled and attributed to the requesting student.
7. **Eligibility is re-checked at accept time.** Between request and decision the student's level or
   absence record may have changed. A student who no longer passes the bar is not silently enrolled:
   the coach gets the same named-reason warning as a manual add (`eligibility.enforcement` rule 7)
   and may proceed anyway — accepting a request is a manual add.
8. **On accept, a credit is consumed exactly as a normal enrolment consumes one.** In the current
   schema the only credit balance that exists is `StandingWaitingListEntry.credits_*`, so this means:
   if the requesting student holds an active standing waiting-list entry with that coach, accepting
   consumes one of its credits and deactivates the entry when the cap is reached, exactly as
   `notifications.waiting-list` rule 2 does for a placement. A student with no standing entry has no
   credit balance to debit and is enrolled without one. **This rule is the open question flagged with
   the stakeholder** — if "credit" is meant to be a general per-enrolment balance, that is a new
   entity and this rule changes.
9. **On reject, nothing happens** — the request closes as `rejected`, the spot stays open, and the
   student is told.
10. **First fill wins.** The moment a spot is filled by any path — an accepted request, an accepted
    invitation, a waiting-list placement, or a manual add — that spot is gone:
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
14. Requests for a class that has started, been cancelled or completed are rejected by the server and
    any still-pending requests for it are closed.

15. **Wire contract (PAD-131).** Requests are addressed like a class edit — by the calendar event
    (`model`, `originalId`, `date`) — so a virtual occurrence can be requested (rule 2):
    - `POST /app/class-join-requests` `{model, originalId, date}` → `201` with the request, or `200`
      with the already-pending one (rule 3). Refusals are `409` with a `code`: `already_enrolled`,
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
      decision and the automatic "spot taken" reply (rule 11) as system messages to the student. The
      coach's "class is now full" alert (rule 12) is delivered per superseded requester, inside
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
    its eligibility bar. Everyone else still gets 403, and what they read is the student view
    (`classes.detail-visibility` rule 3). A never-materialized occurrence is not covered: the read
    stays a series read until a request materializes it (rule 2). Reconciled in the 2026-09-10
    batch, where PAD-257 and PAD-131 met.

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

### Notes
- Rule 8 (credit consumption) is the one rule carrying an explicit assumption; see the flag in the
  rule text.
