---
id: attendance.confirm
status: implementing
depends_on: [attendance.presence]
serves: [P-ATTENDANCE-2]
governed_by: []
---

# attendance.confirm


### Intent
Players confirm or decline their attendance in response to a reminder notification.

### Rules for a session on the new engine (PAD-913)
Which engine runs a session is `notifications.config` rule 18. **For an old-engine session every rule
below holds as written.** For a session on the new engine (the swap, PAD-912; owner ruling D4,
2026-11-11: "justified or unjustified is always a coach's judgement"):

| Item | For a new-engine session | Source |
|---|---|---|
| Rule 13's auto-justification ("the absence is auto-justified") | no justification is written; the coach judges every absence | `notifications.engine-timeline` rule 5 |
| A reminder No is never late (today a reminder decline is `declined`) | a No at or after the cutoff is late (`cancelled`), before it on time (`declined`) | `notifications.engine-timeline` rule 5 (D4's "on time or late by the cutoff") |
| Rule 12 (a proactive decline is never late) | a No after the cutoff is late even before the student was asked | `notifications.engine-timeline` rule 5, TIMELINE-7 (scenario 61) |

Readings:
- Rule 6 holds: the deadline is `cancellationDeadlineHours` real hours before the real start, and the
  engine's cutoff is the same instant (`notifications.engine-timeline` rule 5, TIMELINE-21).
- Rules 10–11 hold, read per student: a No before the engine sent that student any attendance request
  is recorded as a proactive decline. Rule 12 does not hold after the cutoff: such a No is late
  (`notifications.engine-timeline` rule 5; scenario 61, TIMELINE-7).
- Rule 7 holds: lateness stays derived from `response` and `responded_at`.

### Rules
1. Player responds to reminder via `POST /api/app/notify/respond_reminder`
2. Action: `yes` → confirmed=True, `no` → removes from instance
3. Confirmation updates the Presence record
4. After confirming (`yes`), a player may cancel their attendance at any time BEFORE the class start time via `POST /api/app/notify/cancel_attendance` with `{lessonInstanceId}`. Cancellation is not offered once the class has started (`now >= instance.start_datetime`)
5. Cancelling reverts the player to "not attending" and frees the spot using the exact same path as a reminder decline (`no`): it reuses the same vacancy-creation and invitation-engine logic — it does not fork a separate path. In automatic mode invitations are (re)triggered/pre-created; in semi-automatic mode the vacancy awaits coach approval before invitations are sent (see notifications.semi-auto-approval)
6. The coach configures a cancellation deadline `cancellationDeadlineHours` (default 24) on their NotificationConfig (see notifications.config). The deadline is `cancellationDeadlineHours` real hours before the class's real start. The stored `start_datetime` is Lisbon wall-clock (R-023), so the deadline is computed on instants and holds across a daylight-saving change (PAD-256). A cancellation made at or after this deadline but still before class start is **allowed** (never blocked) but flagged as a **late cancellation** (`Presence.late_cancellation=True`). A cancellation before the deadline sets `late_cancellation=False`. The spot is freed and invitations (re)triggered identically regardless of lateness
7. Whether a cancellation was late is recorded as `Presence.late_cancellation` until PAD-271 M5 lands, then derived from `response`/`responded_at` against the deadline (`attendance.presence` rule 7; decided 2026-09-11). Serialized presence payloads expose `lateCancellation`; the serialized class-instance payload exposes the effective `cancellationDeadlineHours` (and/or a deadline timestamp) so the frontend can render deadline-aware UX. `cancellationDeadline` is a naive ISO string on the club's wall clock, like every class time, and both clients compare it with the club's clock — `lisbonNow()` in `@levelup/config` — never with the device's, so the moment is right on a phone anywhere (PAD-256, PAD-295)
8. When a player cancels attendance (`POST /api/app/notify/cancel_attendance`), the **coach is notified** with exactly one message per cancellation. The notification reuses the existing coach↔player direct conversation / system-message infrastructure (no new channel/model): a message is created in that conversation and its push notification is directed at the coach. The message identifies the **student** (name) and the **class instance** (title + start date/time). When the cancellation is late (`late_cancellation=True`), the notification is clearly marked as a late cancellation both in its human-readable text and via a machine-readable `msg_metadata` marker (`lateCancellation: true`, plus `lessonInstanceId`). Reminder declines (`respond_reminder` with `no`) do not emit this coach cancellation notification — it is specific to the `cancel_attendance` path, which is the only path that computes lateness. The single coach notification is in addition to (and does not replace) the existing student-facing acknowledgement message, except for a decline made from an availability block, which sends no acknowledgement (rule 30) **PAD-288 (coordinator decision, 2026-09-11 — see rule 23): the message is sent for every cancellation; the coach's phone is pushed only for a LATE one (rule 6). Early cancellations are visible, not noisy. Confirmed by the owner, 2026-11-10.** One exception: in semi-automatic mode every cancellation, early included, pushes the coach "Replacement approval needed" (`replacement_approval_service.py`); that push is about the freed spot, not about the cancellation (see notifications.semi-auto-approval).
9. A student can cancel attendance directly from an enrolled class in the calendar class-detail view (not only from a chat reminder). Both surfaces (the class-detail view and the reminder bubble) call the same `POST /api/app/notify/cancel_attendance` and render deadline-aware UX from the class-instance payload's `cancellationDeadline` / `cancellationDeadlineHours`: before the deadline a normal confirm, at/after the deadline a "late cancellation" warning that still allows the cancel. The action is hidden once the class has started; a 409 is handled gracefully with an error message. "Started" is judged on the club's clock: the stored start against Lisbon now, never UTC — on the server (`club_now_naive()`) and on both clients (`lisbonNow()`, PAD-295)

#### Proactive decline (PAD-73)
10. **Proactive-decline window.** A decline made *before the student would normally have been asked to confirm* is a **proactive decline**. The window closes at the instant the attendance reminder for that instance would fire, i.e. `proactiveDeclineDeadline = _fire_time_utc(instance.start_datetime, config.get_reminder_timing())`, which follows `notifications.reminders` rule 15 (PAD-256) — the **same** helper and the same `reminder_timing.firstReminder` config the scheduler uses to arm the reminder job (see `notifications.reminders`). The cutoff is therefore always derived, never a hardcoded interval, and it moves when the coach changes their reminder timing. When the timing config yields no computable instant, no proactive window exists and today's plain-cancellation behaviour applies unchanged
11. **Same endpoint, server-side classification.** A proactive decline is not a separate endpoint or a separate code path: it is `POST /api/app/notify/cancel_attendance`, which classifies the decline itself from the server clock. The response carries `{"action": "declined", "proactive": true|false}`. The client never decides which kind of decline occurred — a stale client cannot mislabel one
12. **A proactive decline is never a late cancellation.** When `now < proactiveDeclineDeadline`, `Presence.late_cancellation` is forced `False` regardless of `cancellationDeadlineHours`. This matters only when a coach configures a reminder that fires *after* their own cancellation deadline; telling the coach at the earliest moment the system ever expected an answer is by definition not late
13. **Effects of a proactive decline** (all of which reuse the existing shared decline path, `_free_spot_for_declining_player`):
    - the absence is auto-justified — `status="absent"`, `justification="justified"`, `confirmed=True`, exactly the state a reminder decline writes, so `attendance.stats` and `effective_filled_spots` stay coherent;
    - the vacancy is created **immediately** (`_ensure_vacancy_for_player`), so the spot reads as free the moment the student declines, without waiting for the next batch tick;
    - **invitation timing is unchanged**: invitations are only sent when `now >= invitationStart` (`notifications.invitations`). A decline 10 days out pre-creates the vacancy and sends nothing; the existing `invite_start_{instance_id}` job fans out at the configured hour. Semi-automatic mode still routes through coach approval
    - **the request does not wait for the invitations (PAD-733)**: inside the window the decline arms the start on the scheduler (`notifications.invitations` rule 1b) and answers; the invitations follow within seconds. The coach's attendance sheet (`POST /class_instance/presences/confirm`) does the same, and its reply then carries `notifiedPlayers: []` and `invitationsQueued: true`. Web's attendance sheet says "the invitations are being sent" instead of counting them. **Web only, on purpose:** iOS never read `notifiedPlayers` (it shows no invite count after saving attendance), so it has nothing to change
    - the coach is notified exactly once, with wording that distinguishes a proactive decline from a plain or late cancellation, and a machine-readable `msg_metadata.proactiveDecline` marker alongside the existing `cancellation` / `lateCancellation` / `lessonInstanceId` keys
14. **Authorization.** `cancel_attendance` is authorized on **enrolment**: the acting user must resolve to a `Player` who holds a `Presence` on that instance (the enrolment since PAD-259, `classes.instance-enrollment` rule 1; before PAD-259 the junction row), otherwise 403. On a virtual occurrence the series roster is checked before materialising (rule 18). A student may only ever decline their own enrolment on a class they are actually in (PAD-88 / PAD-115 precedent)
15. **How the invitation-timing guarantee is enforced.** Declining to call `trigger_invitations` is *not* sufficient to hold invitations back: `process_invitation_batches` sweeps every `status="open"` vacancy every two minutes and fires a batch immediately on any vacancy whose `last_activity_at` is `None`. The only thing it defers to is `Vacancy.invite_not_before`. Therefore a vacancy created by a decline that lands **before** `invitationStart` is stamped with `invite_not_before = invitationStart` (the same field the semi-automatic approval path stamps, and the same field `trigger_invitations` and `_send_invitation_batch` already honour). Without this stamp a decline 10 days out would fan out invitations within two minutes, defeating rule 13. This applies to the whole shared decline path (`_free_spot_for_declining_player`), so a reminder decline outside the invitation window is held back too — which is what `notifications.invitations` already specified
16. **Frontend.** ~~The proactive-decline affordance lives in the class-detail **participants** section, on the student's own row, and is shown only while the proactive window is open (`canDeclineProactively`).~~ **Superseded by rule 25 (PAD-313): there is ONE decline action, and the window no longer decides what is rendered.** The payload fields below are unchanged and still describe the *kind* of decline; what they no longer do is choose between two buttons. The class-instance payload exposes `proactiveDeclineDeadline` (a naive ISO-8601 string on the club's wall clock, or null; PAD-256) and `canDeclineProactively` (bool), both computed by the same server helper as rule 10, so the button is never offered when the server would refuse it. ~~Once the window closes the affordance disappears and the existing rule-9 cancel action remains the way to decline (a normal/late cancellation).~~ (Rule 25: one action at every moment; the deadline speaks in the confirmation dialog instead.) After declining, the student's own row shows a persistent "not attending / justified absence" state **derived from their serialized presence** (`status==="absent" && justification==="justified"`), so it survives a reload. All copy goes through `src/locales/{pt,en}/calendar.json`; default locale `pt`. **(PAD-170 C5)** The affordance exists on **both** shells — web's `ClassDetailSheet` and iOS's `app/class/[id].tsx` — under the student's own attendance block, ~~with the same three states: the "I can't attend" button plus its hint while the window is open, the persistent "not attending / justified absence" panel once declined, and the plain rule-9 cancel action once the window has closed.~~ (Rule 25: one button, one state badge.) iOS reads `canDeclineProactively` from the same payload and never re-derives the reminder instant, so a phone can no more offer the action out of window than the browser can
17. **Owner only (PAD-258, audit H4).** `POST /api/app/class_instance/presences/confirm` resolves
   the target the same way the service does (`originalId` + the calendar-event id prefix /
   `parentClassId`) and requires the calling coach to own it (`require_owned_class`, PAD-92)
   BEFORE anything is materialised or written; 403 otherwise. Every `playerId` in the payload
   must be enrolled in that class or on the caller's roster — an arbitrary id is 403, not an
   upsert.

#### Early cancellation on an occurrence that has no row yet (PAD-288, PAD-282; rule numbers 18–20 self-assigned by Session H on 2026-09-11, unconfirmed)
18. **Materialise on demand (owner decision, 2026-09-11).** `POST /api/app/notify/cancel_attendance`
   accepts either `{lessonInstanceId}` (unchanged) or `{model, originalId, date}` exactly as the
   calendar event carries them (`model` is `Lesson` or `LessonInstance`). With the second shape the
   server resolves the occurrence the way a join request does (`classes.join-requests` rule 2,
   `resolve_instance`): a `Lesson` occurrence with no instance row is **authorised first, then
   materialised** — the acting student must be on the lesson's roster (`Association_PlayerLesson`)
   before anything is created, so a non-enrolled student can never cause a materialisation (403,
   nothing written); once enrolled, `get_or_materialize_instance` creates the row and every roster
   presence (`classes.instances` rule 2), and the cancel then proceeds on the instance exactly as
   rules 4–15 describe. A `date` the recurrence does not produce is 404; a date whose start has
   passed is 409 (rule 4). This closes PAD-282: a class created from a student's own request for
   the next day never gets a reminder job (its fire time is already past), so nothing ever
   materialised it and the cancel had no instance to attach to.
19. **How far ahead, and what kind of decline it is.** Any future occurrence the student can see on
   their calendar may be cancelled — there is no upper bound beyond the recurrence itself. A cancel
   ahead of the reminder is, by rule 10, a **proactive decline**: never late (rule 12), the spot
   freed at once, invitations held to `invitationStart` through `invite_not_before` (rule 15), the
   coach told exactly once (rules 8 and 13). No new state, column or endpoint. Leaving the whole
   series is not this action (`classes.enrollment`); undoing a cancellation is not offered — the
   student asks the coach, or joins back through `classes.join-requests`.
20. **Clients.** Web (`ClassDetailSheet`) and iOS (`app/class/[id].tsx`) offer the rule-9 cancel
   action (rule 25: the rule-16 proactive affordance is gone) on a class event whether it is a materialised instance or
   a virtual occurrence: the gate is "I am a participant, the class has not started, I have not
   declined", never "an instance id or a presence row exists". Both send `(model, originalId,
   date)` from the event and read `cancellationDeadline`, `cancellationDeadlineHours`,
   `proactiveDeclineDeadline` and `canDeclineProactively` from the class-instance payload, which
   the server now also computes for a `Lesson` occurrence (`POST /class_instance?model=Lesson&id&date`)
   from that occurrence's start and the coach's config. After a cancel the client re-reads the
   payload, which now resolves to the materialised instance and carries the student's presence, so
   state renders from server data as before — as the single `attendanceState` badge of rule 25.
   `canDeclineProactively` is no longer a client render condition; the server still computes it
   and still classifies the decline, and the client uses the `proactive` key of the reply only to
   choose the confirmation copy and the toast.

#### Early cancellation — product rules (PAD-288; decided by the coordinator on 2026-09-11 while the owner slept; stated verbatim so a reversal is one edit; rule numbers 21–24 self-assigned by Session J, unconfirmed)
21. **How far ahead.** "A student who is planned in an occurrence may cancel ANY future occurrence
    from the class detail — no horizon limit (the founders' example was a week ahead; nothing in
    the domain justifies a cap)." Rules 18–20 are the mechanism: the occurrence is resolved from
    the calendar event and materialised on demand, authorised on the series roster.
22. **What it frees.** "Cancelling frees the spot immediately: the vacancy opens and the engine
    invites per its normal rules (no special-casing early cancellations)." That is rule 5's shared
    decline path and, ahead of the reminder, rule 13's proactive decline with invitations held to
    `invitationStart` (rule 15) — the engine's own timing, nothing added.
23. **Who is told, and how.** "The coach is PUSHED only for LATE cancellations (the existing
    deadline rule, unchanged). Early cancellations appear in the class detail / Presences as
    'cancelled by the student' with the timestamp — visible, not noisy." Concretely: rule 8's
    chat message is sent for every cancellation, the web and native push only when
    `late_cancellation` is true; and a serialized presence carries `cancelledByStudent`
    (`status = absent` ∧ `justification = justified` ∧ `validated = false` — the shape only the
    student's own decline produces before the coach validates the sheet) and `cancelledAt` (the
    row's `updated_at` as a UTC instant, which the decline write sets; a later coach edit of that
    row replaces it and validating the sheet ends the label, since the sheet's own state then
    speaks). Both shells show "cancelled by the student · <date time>" on that participant's row
    in the class detail (coach view) and under the student's own "not attending" state.
24. **No undo button; the way back is "Afinal vou" (amended by the owner, 2026-11-10; was "no undo",
    PAD-282).** No endpoint reverses a cancellation as such. A student who cancelled, or said "Não vou",
    comes back through rule 28's "Afinal vou" while the class has a free spot and has not started;
    otherwise they are offered the waiting list. A class the student REQUESTED (PAD-282) follows exactly
    the same rule. `classes.join-requests` stays the way to ask the coach for a class again.

25. **One way to say "I am not coming", one state word (PAD-313; number self-assigned,
   unconfirmed; decided by the coordinator 2026-09-12 after a founder's TestFlight 20 report).**
   Verbatim, so a reversal is one edit: *"a student must see ONE way to say 'I am not coming' per
   class, same label wherever it appears"*; *"the consequence goes in the confirmation dialog, not
   in the choice of button"*; *"ONE badge per row"*; *"no row ever shows two state words at once"*.
   Concretely, on both shells:
   - The only decline affordance is the rule-9 cancel action, labelled **"Não vou poder ir"**
     (`calendar.detail.proactiveDecline`) — the person's own words; "Cancelar presença" was systems
     language and is retired as a label. Its gate is the rule-9/20 gate alone: a participant, the
     class has not started, not already declined.
   - The deadline is carried by the **confirmation dialog**: past the deadline it says plainly that
     the cancellation is late and the coach will be told; before it, it does not. The server's
     `proactive` reply chooses the toast. Neither ever decides which button to draw.
   - A row shows exactly ONE state word, from `attendanceState` (`attendance.presence` rule 9,
     PAD-313's server half) through the shared helper `@levelup/config`'s `attendance-state`, so the
     two shells cannot drift. Clients no longer read `confirmed`, `status`, `justification` or
     `validated` to decide what to show. Labels (PT, approved 2026-09-12): `planned` "Inscrito",
     `coming` "Vais" (student) / "Vai" (coach), `not_coming` "Não vais" / "Não vai",
     `attended` "Presente", `missed` "Faltou". The student's own row speaks in the second
     person, the coach's participant row about the student.
     **A label may never assert more than the state it renders knows** (coordinator,
     2026-09-12). `not_coming` first read "Não vais — falta justificada", and the state is
     justification-blind: it says the spot is given up and no coach record exists yet, never
     how the absence was classified. A justification-blind state wearing the word
     "justificada" is `confirmed`-means-answered in a different coat. Nor may the wording be
     made conditional on `justification` to earn the clause back — that is a client reading a
     raw column to choose words, which this rule forbids. The justified-or-not fact keeps
     mattering where it has consequences (absence counts, the eligibility bar), which is where
     it belongs rather than in a status word.
   - **Rule 23's `cancelledByStudent` stays a separate, narrower fact and never becomes a state.**
     `not_coming` says WHAT, never WHO. On the coach's row only, and only while the row is not
     validated, "Cancelado pelo aluno · <when>" is rendered as a **detail line in secondary text**,
     with clearly lesser weight than the state word — a quiet fact beside one status, never a
     second status. The student's own row never shows it: they know they cancelled.

26. **Superseded by rule 28: PAD-570 (2026-10-09) made "Não vou" final; PAD-684 (owner, 2026-10-21) restored this negotiation as rule 28's "Afinal vou", with the screen now showing the spot state (`comeBack`) first.** The text below is kept as the record of PAD-315. ~~A student who said "I am not coming" can say they can come after all (PAD-315; number
   self-assigned, unconfirmed). The client offers it; the SERVER decides it.~~ The negotiation
   already exists: `POST /api/app/notify/respond_reminder` with `{lessonInstanceId, action: "yes"}`
   and `respond_to_reminder`'s retaking branch. When the row is `status=absent` and not validated,
   it locks the instance, re-checks capacity, and either re-seats the student — clearing `status`,
   `justification` and `late_cancellation` per `attendance.presence` rule 9, closing their vacancy
   and retiring live invitations — or refuses with `{"action": "spot_filled"}` and notifies the coach. The student
   is not sent a message: the screen that sent the request shows the refusal
   (`notifications.message-templates` rule 15, PAD-501). This rule adds **only** the way in.
   - **Offered while `attendanceState` is `not_coming` and the class has not started.** Same gate
     shape as rule 9's cancel, and in the same place: the student's own attendance block, so a row
     still shows one state word and one action at a time (rule 25).
   - **The client never pre-judges the answer.** It must NOT hide or disable the action because it
     believes the spot is taken: capacity can change between render and tap, and a client that
     guesses is racing the invitation engine. Offer it, call, honour the reply. This is the
     standing reason the affordance is not gated on `openSpot` or on any count.
     **Structural, not advisory: the shared gate `canComeBack` takes no capacity argument at
     all**, so pre-judging cannot be reintroduced by an edit inside a component — adding the
     parameter is a visible act in a diff. You cannot pre-judge a seat you were not given.
   - **`spot_filled` is rendered plainly**, in the student's own words — "a tua vaga já foi
     ocupada" — and the row stays `not_coming`. It is an outcome, not an error: nothing went
     wrong, the seat went to somebody else, which is exactly what freeing it was for.
   - **A repeat tap is not a failure.** The server answers `{"action": "confirmed", "duplicate":
     true}` when the answer was already recorded; the client treats it as success, because from the
     student's point of view it is.
   - **The state edge this adds:** `not_coming → coming` when the server allows it; `not_coming`
     plus a message when it does not. No client-side state is invented — both shells re-read the
     payload and render `attendanceState` as rule 25 requires.
   - **The client wrapper's contract widens.** `respondToReminder` in `@levelup/api` declares
     `{action: "confirmed" | "declined" | "expired"}`, which the server has outgrown: it can also
     answer `spot_filled` and can set `duplicate`. Four existing call sites (the web message
     bubble, the coach dashboard's answer hook, the mobile calendar hook, the mobile conversation
     screen) therefore cannot currently distinguish a refusal from a confirmation. Widening the
     type and handling `spot_filled` at those sites is part of this rule, not a follow-up — a
     student tapping "Yes" on a reminder after cancelling can already reach that answer today.

#### "Vou" only once asked (PAD-570; rule numbers 27–29 self-assigned by Session C on 2026-10-09, unconfirmed)
27. **A student may answer "Vou" only once they have been asked.** The ticket's words: *"o aluno
   não pode confirmar 'Vou' a uma aula antes do primeiro lembrete do treinador para essa aula.
   Antes disso só pode dizer 'Não vou', para dar tempo ao treinador de arranjar substitutos."*
   "Asked" is ONE server predicate, computed in one place (`student_may_confirm` in
   `notification_service.py`) and served as **`pendingConfirmation`** on every surface that
   shows the student their own class — the class-detail payload (`pendingConfirmation`, student
   viewer only, `false` for a coach), the dashboard hero and schedule rows, and the "Precisa de
   ti" invite card (`dashboard.blocks` rule 3a). It is `true` exactly when ALL hold:
   - the student has been asked: either the first-reminder instant for the occurrence has passed
     — `_fire_time_utc(instance.start_datetime, config.get_reminder_timing())`, the SAME instant
     that closes rule 10's proactive-decline window, so the two windows are one boundary — or a
     reminder was actually sent to this student for this occurrence (any `ReminderAttempt`,
     `notifications.reminders` rule 14, voided rounds included: a student the coach re-added
     after a cancellation was already asked about this class, PAD-318), which covers the
     coach's manual "Enviar lembretes" ahead of the instant;
   - the class would ever ask: for the time-based opener the occurrence's `notifications_enabled`
     is on (`notifications.toggle-class` rule 3 — the only switch that stops reminders; the
     coach's `auto_notify_enabled` gates the invitation engine, not `send_class_reminders`, so
     "desligados para o treinador" has no separate meaning in code). **A class with reminders off
     never asks** (owner decision in the ticket): the coach assumes the student is coming, the
     student only ever has "Não vou", and the class never appears in "Precisa de ti". A reminder
     the coach sent by hand still counts as asked. When no instant is computable (rule 10's
     `None`), the time-based opener stays closed — fail closed, never open;
   - the student's `attendanceState` is `planned` (rule 25): `coming` has answered, `not_coming`
     comes back only through rule 28, `attended` / `missed` is the coach's record (rule 29);
   - the class has not started (`_instance_is_over` is false; the club's clock).
   `invited` is deliberately NOT part of the predicate: `enrol()` writes `invited=True` at
   enrolment, which is why the dashboard offered "Vou" from day one (ledger B-441). The
   client never recomputes the instant: both shells read the flag, as they read
   `canDeclineProactively`.
   **What each surface shows** (the ticket's table): while `pendingConfirmation` is `false` and the
   student may still decline, the only action is the rule-25 decline ("Não vou poder ir",
   `calendar.detail.proactiveDecline`, one label everywhere; the ticket calls the dashboard's
   button "Avisar que não vou", and that is the label on the dashboard's hero, invite card and
   schedule rows, `dashboard.answer.notGoing`); it calls `cancel_attendance`, so the server
   classifies it (rule 11). While `true`, the surface shows **"Vou" and "Não vou"** — the class
   detail gains a confirm action (`class-confirm-attendance`, `POST respond_reminder` with
   `yes`) beside the decline; the dashboard keeps its Yes / No through `respond_reminder`.
   **The server enforces it even for an old client:** `respond_to_reminder` with `yes` answers
   `{"action": "not_yet_asked"}` and records nothing when the student has not been asked
   (same 200 contract as `spot_filled`; the shared mapper's unknown branch on an old client
   writes nothing and says something went wrong, B-074). A "no" is never refused by this rule:
   before the reminder it is rule 10's proactive decline, after it a reminder decline.
   **The ask reaches an open class detail live (B-542, PAD-600):** the student's live
   `message_created` event whose payload is a `notification_reminder` (`messageType`) for the open
   occurrence (`metadata.lessonInstanceId`) makes both shells refetch the class detail — iOS
   invalidates the `class-instance` query and the dashboard queries (the hero, the schedule rows
   and the "Precisa de ti" card read `pendingConfirmation` too), web re-reads the sheet's
   instance — so "Vou" appears without a re-open or the stale window. The event is recognised
   by ONE shared predicate (`reminderArrivedFor` in `@levelup/config`), never by each shell's own
   string match; an event for another occurrence or of another message type refetches nothing.
28. **"Afinal vou": a student who said "Não vou" may come back while there is a spot; otherwise
   they may join that occurrence's waiting list (PAD-684, owner decision, supersedes PAD-570's
   "Não vou is final"; numbering unconfirmed).** The ticket's words: *"Se ainda houver vaga nessa
   aula, o aluno pode voltar a inscrever-se sozinho ('Afinal vou'). Se já não houver vaga … não
   volta a entrar. Fica de fora, ou pode juntar-se à lista de espera dessa aula (só esta
   ocorrência)."* The PAD-315 negotiation (rule 26) is the mechanism, restored:
   - **Who:** a student whose display state for the occurrence is `not_coming` (their own "Não
     vou", a reminder "no", a proactive decline, or the coach's "Não vai" mark, rule 29) on a
     class that has not started (club clock). Not on a started, ended or cancelled class.
   - **One server predicate, served:** `comeBack` on the student's own class-detail payload and on
     every dashboard surface that serves `pendingConfirmation` — `"rejoin"` (a spot is free now),
     `"waiting_list"` (no spot; the student is not on this occurrence's waiting list),
     `"on_waiting_list"` (no spot; already on it), or `null` (not offered). It is a hint for what
     to SHOW; the decision is taken at the tap (below). Additive: App Store builds that do not read
     it keep the PAD-570 hint. On a new-engine session "a spot is free" is rule 32's.
   - **What each surface shows** — class detail, dashboard (hero, schedule rows, "Precisa de ti")
     and the reminder bubble in the chat, web and iOS: `rejoin` → the button **"Afinal vou"**
     (`attendance-come-back`); `waiting_list` → the line **"A tua vaga já foi ocupada"** and the
     button **"Juntar-me à lista de espera"** (`attendance-come-back-waiting-list`, the PAD-547 /
     PAD-577 join, `POST /class-waiting-list` for this occurrence); `on_waiting_list` → **"Estás na
     lista de espera"**. The chat bubble reads the same `comeBack`, served on the reminder message
     to its student (rule 32), and renders the server's answer.
   - **The tap:** `POST respond_reminder` with `yes` (no reminder needs to have been sent). Under
     the rule-10 lock order — the student's own open vacancy, then the class — the server re-checks
     capacity (`effective_filled_spots` against `effective_max_players`) BEFORE recording anything.
     With a spot: the presence returns to `coming` (status, justification and `validated` cleared,
     the answer recorded as a "yes"), their own vacancy closes through `_close_vacancy`, which
     expires every open invitation for it as `spot_filled`, and the answer is
     `{"action": "confirmed"}`. Without: nothing is recorded and the answer is
     `{"action": "spot_filled"}`; the screen then shows the waiting-list line and button. A repeat
     tap answers `{"action": "confirmed", "duplicate": true}`. Two students racing for the last
     spot: one is seated, the other gets `spot_filled`.
   - **Coming back lands on `coming`** ("volta a Vai"), also before the first reminder instant:
     the student has just said they are coming, so rule 27's ask has been answered and no
     reminder is sent to them for this occurrence.
   - **The coach is told:** a message from the student in their shared conversation, "<name>
     afinal vai a <class><when>." / "<name> is coming to <class><when> after all." (real name,
     `players.nickname` rule 4), and a push to the coach whose body names the student by the
     coach's display name (`players.nickname` rule 9c). The class detail's participant list moves
     them to "Vão" through `presence_changed` (`calendar.event-detail` rule 24).
     The `reminder_confirmed` template is not sent on a come-back: the screen that tapped shows the
     answer, and one tap gives the conversation one message (the coach's notice above).
   - **Semi-automatic mode:** a pending approval prompt for the closed vacancy is marked `stale`
     when the vacancy closes, so its card stops offering the suggestion instead of failing on tap.
   - **Only this occurrence.** The standing enrolment in later occurrences is unchanged.
   - **The waiting list accepts them:** a student whose own presence on the occurrence is
     `not_coming` does not count as enrolled for `join_class_waiting_list_service` (they hold no
     spot), and the class they were enrolled in is visible to them
     (`notifications.waiting-list`).
   The PAD-570 hint ("Respondeste que não vais…", `calendar.detail.declinedFinalHint`) stays only
   for App Store builds that do not read `comeBack`; the server never answers `already_declined`
   to a come-back on a class that has not started.

29. **The coach's own mark stands (orchestrator relaying the owner, 2026-10-09).** When the coach
   marked the student present or absent before the reminder (`validated`, `attendance.presence`
   rule 7; such a student gets no reminder, `notifications.reminders` rule 23), the student is
   never asked: `pendingConfirmation` is `false`, a `yes` answers `{"action": "already_marked"}`,
   and the student still only has "Não vou". **Exception (PAD-684, owner):** a coach's "Não vai"
   (`missed` before the class) is a `not_coming` display state, so rule 28's "Afinal vou" applies
   to it before the class starts, with the same spot check; seating the student clears the mark.
   After the class ends the coach's record stands. What that "Não vou" does on a validated row is
   unchanged by this ticket: `cancel_attendance` runs the ordinary decline path (rule 5), which
   records the student's answer and overwrites the mark with `absent`; refusing it instead is a
   PAD-567-adjacent decision not taken here.

#### A decline made from an availability block (PAD-772; owner, 26 Nov 2026, corrected the same day: "Nothing should be asked about")
30. **Saving an availability block over a class is an ordinary decline with a source.** When a
    student saves an availability block over classes they are in, the save marks each covered class
    "Não vai" at once, with no question (`calendar.student-blockers` rules 19–23); each class is
    declined through this spec's own path —
    rules 5, 10–15 and 18 hold unchanged (the spot, the timing, proactive or late by the server's
    clock), and on a new-engine session the engine's "not going" runs as for any No. Three things
    differ, and only for that source (`const:DECLINE_SOURCE_AVAILABILITY_BLOCK`):
    - the student-facing acknowledgement of rule 8 (the `reminder_declined` template) is **not**
      sent: the student decided by saving the block, and the app's toast says how many classes were
      marked (`calendar.student-blockers` rule 21). No message whose sender is the coach is created,
      and no reminder or attendance request reaches the student for those classes on either engine
      (`calendar.student-blockers` rule 23);
    - on an old-engine session, rule 8's coach notice carries `msg_metadata.availabilityBlock: true`
      beside its existing keys and says the student marked themselves unavailable, never the block's
      title or times (wording and late marker: `calendar.student-blockers` rule 23). On a new-engine
      session no coach chat notice is sent, as for any No there (`cancel_attendance` returns into
      `engine_entry.student_not_going` before the notice); the coach learns it from the row;
    - the presence carries `declineSource`, and the coach's row shows the reason in rule 23's detail
      line: while the row is `not_coming` and not validated, `cancellationDetail` in
      `@levelup/config` answers `calendar.detail.cancelledUnavailableAt` — "Cancelado pelo aluno ·
      indisponível · <quando>", the time from `respondedAt` — whenever `declineSource` equals the
      constant, whatever `cancelledByStudent` says (it is false on a new-engine session, whose
      absence writes no justification: `engine_store.py:936-938`). Otherwise the line is rule 23's
      `calendar.detail.cancelledByStudentAt`, as before. It stays a detail line under the one state
      word "Não vai" (rule 25), on the coach's row only; the student's own row never shows it. It is
      the ticket's "Não vai · indisponível" in rule 25's shape.
    "Afinal vou" (rule 28) applies as to any `not_coming`. Clients read `declineSource` only on a
    `not_coming`, unvalidated row, so a value left after coming back is never shown; the server
    also clears it, as `calendar.student-blockers` rule 23 says: "Afinal vou" on both engines, and the new engine's
    reminder answer and ordinary decline.

31. **A second "Não vou" changes nothing (review of PAD-772, 26 Nov 2026).** `POST
    /api/app/notify/cancel_attendance` on a presence whose `attendanceState` is already `not_coming`
    and which is not validated, and whose decline has been completed (the old engine's vacancy for the
    student exists; the new engine's absence carries its `left_reason`), answers
    `{"action": "declined", "proactive": false, "duplicate": true}`
    and writes, sends and clears nothing, on both engines. A decline that failed between the absence and
    its spot is not completed, and a repeat still runs the ordinary path and frees the spot: no second coach notice (rule 8), no
    `reminder_declined` to the student, no new `respondedAt` or `response`, `declineSource` kept, no
    vacancy or engine request. The check runs after the started (409) and enrolment (403) checks, so
    those answers are unchanged. It is the server half of rule 25's gate ("not already declined"):
    a stale screen — notably an iOS build that re-reads only its blocker list after a block save
    marked the class (`calendar.student-blockers` rule 25) — can still send the tap. A validated row
    is not covered by this rule: rule 29's behaviour for it is unchanged. Clients treat `duplicate`
    like any decline answer; builds that do not read it see an ordinary decline.

#### "Afinal vou" only while a place is free (owner, 26 Nov 2026)
32. **"Afinal vou" is offered only while the class has a place the student could take; otherwise the
    screen says plainly the place went (the owner, 26 Nov 2026: "Let's fix it. We should only show afinal
    vou if there's still places left."; `notifications.engine-answers` rule 16,
    `notifications.engine-store` rules 14-15).**
    - **One predicate, the tap's.** On a new-engine session `comeBack` is `"rejoin"` only when the engine
      would place the student now (`notifications.engine-answers` rule 16: room in the class and on a side
      they play, a place offered by an open invitation counting as free; a student who is not a regular
      and is placed elsewhere at the same hour never gets `rejoin`), for a regular and for anyone else alike.
      Otherwise the not_coming student gets `"waiting_list"` or `"on_waiting_list"` as rule 28 says. On an
      old-engine session `comeBack` is unchanged (rule 28's class-wide count, `_retake_spot`'s check).
      Today `student_come_back` counts the whole class only, so a regular whose side is full, and on the
      new engine any student who is not a regular, are offered a button whose tap answers `spot_filled`.
    - **Every surface, web and iOS:** the class detail (web `ClassDetailSheet`, iOS `app/class/[id].tsx`),
      the dashboard's hero and schedule rows (web `ComeBackSlot`, iOS `blocks.tsx` `ComeBackSlot`) and the
      reminder bubble in the chat (web `MessageBubble`, iOS `message-bubble.tsx`) show "Afinal vou"
      (`attendance-come-back`, `bubble-come-back`, `dashboard-come-back`) only for `rejoin`. For
      `waiting_list` they show the plain line `calendar.detail.spotTaken` — PT "A tua vaga já foi
      ocupada", EN "Your spot has been taken" (existing keys; no new copy) — and the waiting-list button;
      for `on_waiting_list`, `calendar.detail.onWaitingList`.
    - **The bubble's fact.** The reminder message (`notification_reminder`) serialized for its student
      carries `comeBack` for its occurrence (`serialize_message`, `viewer_id` the student), the same value
      the class payload serves; `null` for any other viewer, any other message type, or when the student
      has not recorded a no. The bubble no longer offers "Afinal vou" from a recorded no alone. It refreshes
      as the thread does (a reload, `message_edited`); a stale bubble is covered by the tap's answer.
    - **The tap stays the judge.** `respond_reminder` `yes` decides at the lock (rule 28's tap; on the new
      engine `notifications.engine-store` rule 15): a place that went between the screen and the tap
      answers `{"action": "spot_filled"}`, records nothing, and the screen moves to the `waiting_list` line
      (`comeBackFromAnswer`). App Store builds that do not read the bubble's `comeBack` keep showing the
      bubble's button after a recorded no; their tap gets this same honest answer and the line they
      already render. No client may call a `spot_filled` an error.
    - **Regulars unchanged:** a regular's return on the new engine is `RegularReturns` as today; only the
      `comeBack` they are served now follows their side.

### Acceptance Criteria

#### ATTENDANCE-CONFIRM-1: Player confirms attendance
- **Given** a player with a pending reminder for instance 10
- **When** they POST to respond with action `yes`
- **Then** their presence.confirmed becomes True

#### ATTENDANCE-CONFIRM-2: Player declines attendance
- **Given** a player with a pending reminder for instance 10
- **When** they POST to respond with action `no`
- **Then** their presence is updated (or removed)
- **And** a vacancy may be created for the notification engine (in semi-automatic mode the vacancy awaits coach approval before invitations are sent — see notifications.semi-auto-approval)

#### ATTENDANCE-CONFIRM-3: Player cancels attendance after confirming (before class start)
- **Given** a player who previously confirmed attendance for instance 10 whose class has not yet started
- **When** they POST to `/api/app/notify/cancel_attendance` with `{lessonInstanceId: 10}`
- **Then** their presence is reverted to "not attending" (status=absent, justification=justified) exactly as a reminder decline
- **And** the freed spot re-triggers the existing open-spot / invitation-engine logic, identical to a reminder decline (no separate path)

#### ATTENDANCE-CONFIRM-4: Student cancels from the calendar class-detail view (before deadline)
- **Given** a student enrolled in a future class (its start more than `cancellationDeadlineHours` away) who opens the class in the calendar class-detail view
- **When** they use the "Cancel attendance" action shown for their enrolled class
- **Then** the app calls `POST /api/app/notify/cancel_attendance` with the instance id, their spot is freed, and their view reflects the cancellation — matching the reminder-bubble cancel behavior

#### ATTENDANCE-CONFIRM-5: Cancellation blocked after class start
- **Given** a player who confirmed attendance for an instance whose start_datetime is in the past
- **When** they POST to `/api/app/notify/cancel_attendance` for that instance
- **Then** the request is rejected (409) and the presence is unchanged

#### ATTENDANCE-CONFIRM-6: Cancellation before the deadline is not flagged late
- **Given** a coach with the default `cancellationDeadlineHours` of 24 and a player who confirmed attendance for an instance whose start is more than 24h away
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** the cancellation succeeds, `presence.late_cancellation=False`, and the freed spot re-triggers the invitation engine

#### ATTENDANCE-CONFIRM-7: Cancellation windows run on the club's clock in summer and winter (PAD-256)
- **Given** a class stored at 10:00 on 2026-07-14 (Lisbon summer, UTC+1) and the default
  `cancellationDeadlineHours` of 24
- **When** the student cancels at 09:30 UTC on 2026-07-13 (10:30 Lisbon, 23.5 h before the class)
- **Then** the cancellation is flagged late
- **And** at 09:30 UTC on 2026-07-14 (10:30 Lisbon) the cancellation is refused with 409, because the
  class has started
- **And** for a class stored at 10:00 on 2026-01-13 (winter, UTC+0), the same UTC moments are 24.5 h
  and 0.5 h before the class: not late, and still allowed
- **And** the proactive-decline window of a 48 h reminder closes at 09:00 UTC on 2026-07-12 (10:00
  Lisbon) in summer and at 10:00 UTC on 2026-01-11 in winter
- **And** across the spring change, a class stored at 10:00 on 2026-03-30 exposes
  `proactiveDeclineDeadline` `2026-03-28T09:00:00`: 48 real hours earlier, on the club's wall clock

#### ATTENDANCE-CONFIRM-8: Late cancellation is allowed but flagged
- **Given** a player who confirmed attendance for an instance whose start is less than `cancellationDeadlineHours` away but still in the future
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** the cancellation is allowed (not blocked), `presence.late_cancellation=True`, and the freed spot still re-triggers the invitation engine

#### ATTENDANCE-CONFIRM-9: Coach is notified on a (non-late) cancellation
- **Given** a player who confirmed attendance for an instance whose start is more than `cancellationDeadlineHours` away
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** exactly one coach-facing notification is produced in the coach↔player conversation
- **And** no push notification is sent to the coach (PAD-288, rule 23)
- **And** it identifies the student (name) and the class instance (title + start date/time)
- **And** it is NOT marked as a late cancellation (`msg_metadata.lateCancellation` is false)

#### ATTENDANCE-CONFIRM-10: Coach is notified and the late flag is set on a late cancellation
- **Given** a player who confirmed attendance for an instance whose start is less than `cancellationDeadlineHours` away but still in the future
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** exactly one coach-facing notification is produced (no duplicate)
- **And** it is marked as a late cancellation in both its text and `msg_metadata.lateCancellation=true`
- **And** the coach is pushed exactly once (PAD-288, rule 23)

#### ATTENDANCE-CONFIRM-11: Proactive decline before the reminder time (PAD-73)
- **Given** a coach whose `reminder_timing.firstReminder` is `{type: "hours_before", value: 48}` and a student enrolled in an instance that starts in 10 days
- **When** the student POSTs `/api/app/notify/cancel_attendance` with that instance id
- **Then** the response is `{"action": "declined", "proactive": true}`
- **And** the presence becomes `status="absent"`, `justification="justified"`, `late_cancellation=False`
- **And** an open `Vacancy` for that instance exists immediately
- **And** no invitation message has been sent to any other student, because `invitationStart` (24h before) has not been reached

#### ATTENDANCE-CONFIRM-12: The window closes at the reminder time, not at a fixed interval
- **Given** the same coach and an instance that starts in 10 hours (so the 48h reminder instant has passed)
- **When** the student POSTs `/api/app/notify/cancel_attendance`
- **Then** the cancellation still succeeds but the response is `{"action": "declined", "proactive": false}`
- **And** the coach's notification is not marked as a proactive decline
- **And** raising the coach's `firstReminder` to `{type: "hours_before", value: 240}` moves the cutoff accordingly — the same 10-day-out instance is then no longer proactive

#### ATTENDANCE-CONFIRM-13: Class-instance payload exposes the proactive window
- **Given** a student enrolled in an instance further out than the coach's first-reminder instant
- **When** they load the class-instance detail payload
- **Then** it contains `proactiveDeclineDeadline` (the ISO-8601 reminder instant) and `canDeclineProactively: true`
- **And** for an instance inside the reminder window, `canDeclineProactively` is `false`

#### ATTENDANCE-CONFIRM-15: A non-enrolled student cannot decline someone else's class
- **Given** a signed-in student who is NOT enrolled in instance 10
- **When** they POST `/api/app/notify/cancel_attendance` with `{lessonInstanceId: 10}`
- **Then** the request is rejected with 403
- **And** no `Vacancy` is created and no invitation fan-out is triggered for that instance

#### ATTENDANCE-CONFIRM-16: Student cancels a class they requested that is still virtual (PAD-282)
- **Given** a student whose class request five days ahead, 10:00–11:00, the coach accepted, so a
  one-off `private` lesson exists with the student on its roster and no `LessonInstance` row (its
  reminder time is still ahead; a request accepted after its reminder time, tomorrow say, is
  materialised at acceptance with the student counted as coming: `notifications.reminders` rule 22,
  PAD-489, B-287)
- **When** the student POSTs `/api/app/notify/cancel_attendance` with `{model: "Lesson",
  originalId: <lesson id>, date: <that day>}`
- **Then** the response is 200 `{"action": "declined", "proactive": false|true}`
- **And** exactly one `LessonInstance` now exists for that lesson and date, with the student's
  presence `status=absent, justification=justified`
- **And** the coach receives exactly one cancellation message (rule 8)

#### ATTENDANCE-CONFIRM-17: Student cancels an occurrence ten days ahead (PAD-288)
- **Given** a recurring Monday class with Alice and Bob on the roster, reminders at 48h and
  invitations opening 24h before, and no instance row for the Monday ten days out
- **When** Alice POSTs `/api/app/notify/cancel_attendance` with `{model: "Lesson", originalId:
  <lesson id>, date: <that Monday>}` on the Friday before
- **Then** the instance for that Monday is materialised with presences for Alice and Bob
- **And** the response is `{"action": "declined", "proactive": true}` and Alice's
  `late_cancellation` is false
- **And** one open `Vacancy` exists for Alice with `invite_not_before` equal to that occurrence's
  `invitationStart`, and no invitation has been sent

#### ATTENDANCE-CONFIRM-18: The class-detail payload offers the cancel action on a virtual occurrence
- **Given** the PAD-282 setup above
- **When** the student POSTs `/api/app/class_instance?model=Lesson&id=<lesson id>&date=<that day>`
- **Then** the payload carries `cancellationDeadline`, `cancellationDeadlineHours`,
  `proactiveDeclineDeadline` and `canDeclineProactively` computed for that date
- **And** the web class-detail sheet and the iOS class screen both show the cancel action (rule 20)

#### ATTENDANCE-CONFIRM-19: A student off the roster cannot materialise an occurrence by cancelling
- **Given** a signed-in student who is not on the roster of recurring lesson 7
- **When** they POST `/api/app/notify/cancel_attendance` with `{model: "Lesson", originalId: 7,
  date: <next Monday>}`
- **Then** the request is rejected with 403
- **And** no `LessonInstance`, `Presence` or `Vacancy` row is created

#### ATTENDANCE-CONFIRM-20: A date the recurrence does not produce is refused
- **Given** recurring lesson 7 on Mondays and a student on its roster
- **When** they POST `/api/app/notify/cancel_attendance` with `{model: "Lesson", originalId: 7,
  date: <next Tuesday>}`
- **Then** the request is rejected with 404 and nothing is materialised

#### ATTENDANCE-CONFIRM-21: Started and late cancellation are judged on the club's clock on any device (PAD-295)
- **Given** a device whose zone is `Asia/Tokyo` (UTC+9) while the club's clock reads 10:00 on
  15 July 2027 (summer, UTC+1)
- **And** an enrolled class today at `10:30` whose `cancellationDeadline` is `2027-07-15T09:45:00`
- **When** the student opens the class detail on web and on iOS
- **Then** the class has not started: cancel attendance is offered, flagged as a late cancellation
- **And** a class at `09:30` today has started: the action is hidden

#### ATTENDANCE-CONFIRM-22: Cancellation deadline config default and round-trip
- **Given** a coach with no explicit deadline set
- **When** they GET `/api/app/notify/config`
- **Then** `cancellationDeadlineHours` is 24
- **And** POSTing a new value persists and is returned on the next GET

#### ATTENDANCE-CONFIRM-23: A cancellation a month ahead is accepted and shows as cancelled by the student (PAD-288)
- **Given** a student on the roster of a class thirty days out, reminders at 48 h, cancellation deadline 24 h
- **When** they cancel from the class detail
- **Then** the response is `{"action": "declined", "proactive": true}`, the spot is freed (an open vacancy with `invite_not_before` at that occurrence's `invitationStart`), the coach gets one chat message and **no push**
- **And** the student's serialized presence carries `cancelledByStudent: true` and a `cancelledAt` instant
- **And** the coach's class detail shows "cancelled by the student" with that time on the student's row, on web and iOS; the student's own view shows it under "not attending"

#### ATTENDANCE-CONFIRM-24: A late cancellation still pushes the coach (PAD-288)
- **Given** the same student and a class two hours out
- **When** they cancel
- **Then** the coach gets one chat message marked late and exactly one push

#### ATTENDANCE-CONFIRM-25: A coach-marked justified absence is not "cancelled by the student" (PAD-288)
- **Given** the coach validated the sheet marking a student absent and justified
- **When** the presence is serialized
- **Then** `cancelledByStudent` is false and `cancelledAt` is null

#### ATTENDANCE-CONFIRM-26: Coming back after saying no (PAD-315, rule 26; superseded in its client half by rule 28 — the screen now shows the spot state first)
- **Given** a student whose `attendanceState` is `not_coming` on a class that has not started
- **When** they open the class detail on either shell
- **Then** an action offering to come after all is shown in their own attendance block, and it is
  shown whether or not the class currently has a free spot

- **Given** that student taps it and the spot is still free
- **When** the server answers `{"action": "confirmed"}`
- **Then** their row reads `coming`, the class's filled count includes them again, and no client
  state was set before the server answered

- **Given** a student who taps it twice
- **When** the server answers `{"action": "confirmed", "duplicate": true}`
- **Then** the client treats it as success and the row reads `coming`

- **Given** a class that has already started
- **Then** the action is not offered at all

#### ATTENDANCE-CONFIRM-27: Before the first reminder the class detail offers only "Não vou" (PAD-570, rule 27)
- **Given** a coach whose first reminder is 48 hours before, a class on 2026-10-20 at 18:00 (club clock) and an enrolled student with `attendanceState` `planned`
- **When** the student reads the class-instance payload at 2026-10-18 15:59 UTC, one minute before the reminder instant
- **Then** `pendingConfirmation` is `false`, both shells render the decline action and no confirm action, and `POST /api/app/notify/respond_reminder` with `yes` answers `{"action": "not_yet_asked"}` with the presence still `planned`

#### ATTENDANCE-CONFIRM-28: After the first reminder instant the student may say "Vou" (PAD-570, rule 27)
- **Given** the same class and student
- **When** they read the payload at 2026-10-18 16:01 UTC, one minute after the instant
- **Then** `pendingConfirmation` is `true`, both shells render "Vou" and "Não vou", and `respond_reminder` with `yes` records `coming`

#### ATTENDANCE-CONFIRM-29: A reminder the coach sent by hand counts as asked (PAD-570, rule 27)
- **Given** the same class three days ahead of the instant and a `ReminderAttempt` for this student on it
- **When** the student reads the payload
- **Then** `pendingConfirmation` is `true`

#### ATTENDANCE-CONFIRM-30: A class with reminders off never asks (PAD-570, rule 27)
- **Given** the same class past its reminder instant with the occurrence's `notifications_enabled` false and no reminder ever sent
- **When** the student reads the payload or the dashboard
- **Then** `pendingConfirmation` is `false`, "Precisa de ti" does not list the class, only "Não vou" is offered, and a `yes` answers `not_yet_asked`

#### ATTENDANCE-CONFIRM-31: The ask reaches an open class detail live (rule 27, B-542)
- **Given** a student with the class detail of occurrence 42 open and `pendingConfirmation: false`
- **When** their live stream delivers `message_created` with `messageType: "notification_reminder"`
  and `metadata.lessonInstanceId: 42`
- **Then** the shell refetches the class detail (iOS also the dashboard queries) and the screen
  offers "Vou" from the fresh payload
- **And** a `message_created` for another occurrence, or of another message type, refetches nothing

#### ATTENDANCE-CONFIRM-32: "Afinal vou" with a spot (PAD-684, rule 28)
- **Given** a fixed student Ana who said "Não vou" to Thursday 18:00 (4 places, 3 holding), an
  open vacancy for her place and an open invitation to Bruno for it
- **When** Ana's class detail loads, and she taps "Afinal vou"
- **Then** `comeBack` is `"rejoin"`; the answer is `{"action": "confirmed"}`; her row reads
  `coming`; the vacancy is `filled`; Bruno's invitation reads "Vaga preenchida" (`spot_filled`);
  the coach's conversation with Ana gains "Ana Silva afinal vai a Quinta 18h …" and the coach is
  pushed; her next Thursday is untouched

#### ATTENDANCE-CONFIRM-33: No spot: the waiting list (PAD-684, rule 28)
- **Given** the same class, Ana "Não vou", and Bruno has taken her place (4 holding)
- **When** her class detail loads, she taps "Juntar-me à lista de espera", and loads it again
- **Then** `comeBack` is `"waiting_list"` and the screen reads "A tua vaga já foi ocupada"; the join
  answers `onWaitingList: true`; then `comeBack` is `"on_waiting_list"` ("Estás na lista de espera")
- **And** a `yes` sent anyway answers `{"action": "spot_filled"}` and records nothing

#### ATTENDANCE-CONFIRM-34: Two students, one spot (PAD-684, rule 28)
- **Given** two students who both said "Não vou" to a class that then has one free spot
- **When** both POST `yes` at the same moment (Postgres, both held at the lock)
- **Then** exactly one answer is `confirmed` and the other `spot_filled`; the class is never over
  capacity

#### ATTENDANCE-CONFIRM-35: The coach's "Não vai" can be undone by the student (PAD-684, rule 29)
- **Given** the coach marked Ana "Não vai" (`missed`) before the class, with a spot free
- **When** Ana taps "Afinal vou"
- **Then** her row reads `coming` and the mark is cleared; after the class ends the same tap is
  not offered (`comeBack: null`)

#### ATTENDANCE-CONFIRM-36: The coach's mark stands (PAD-570, rule 29)
- **Given** a student the coach validated present before the reminder instant
- **When** the instant passes and they POST `respond_reminder` with `yes`
- **Then** `pendingConfirmation` is `false`, the answer is `{"action": "already_marked"}` and the row stays `attended`

#### ATTENDANCE-CONFIRM-37: The ask is raised for the student alone, on a class that has not started, once its instant has passed (rules 27, 28)
- **Given** a class with reminders on, seen by its coach and by an enrolled student
- **When** the class payload is built before the reminder instant, after it, and after the class has started
- **Then** the student's `pendingConfirmation` is false before the instant and true after it
- **And** once the class has started it is false, and a yes answers `expired`
- **And** an occurrence that does not exist yet follows the same instant and the series' reminder switch
- **And** when no reminder instant can be worked out it is false
- **And** the coach's payload never carries `pendingConfirmation: true` or a `comeBack`
test: `backend/padel_app/tests/test_pad570_vou_after_reminder.py` › `test_a_class_that_started_never_asks` (+4 more)

#### ATTENDANCE-CONFIRM-38: A coach marks presences only on their own class, for its students or their own roster (rule 17)
- **Given** coach Ana's class with Rui enrolled, her roster student Sara who is not enrolled, a coach Bruno, and a player Zed on nobody's list
- **When** presences are confirmed for that class
- **Then** Bruno is refused with 403 and nothing is marked
- **And** Ana marking Zed is refused with 403, and the class still holds only Rui
- **And** Ana marking Sara is accepted
test: `backend/padel_app/tests/test_pad258_write_ownership.py` › `test_other_coach_cannot_confirm_presences` (+2 more)

#### ATTENDANCE-CONFIRM-39: A declined student is offered what the server's `comeBack` says (rule 28)
- **Given** a student whose state is `not_coming` on a class that has not started
- **When** the class detail, the dashboard row and the reminder's chat bubble render
- **Then** `rejoin`, `waiting_list` and `on_waiting_list` each show their own control or line, and `null` shows nothing
- **And** a server that sends no `comeBack` gets the older hint and no control
- **And** the dashboard row carries the same `comeBack` as the class payload
- **And** the chat bubble offers "Afinal vou" only after a recorded no, on a class that has not started
test: `frontend/apps/web/src/components/calendar/ClassDetailSheet.comeBack.test.tsx` › `no comeBack field (older server) + not_coming: the PAD-570 hint, no come-back control` (+6 more)

#### ATTENDANCE-CONFIRM-40: The app records an answer only when the server confirms or declines it, and explains every other answer (rules 27, 28)
- **Given** a student who answers a reminder from the chat or the class detail
- **When** the server's answer comes back
- **Then** `confirmed` and `declined` are recorded on the row, with no message
- **And** `spot_filled` records nothing and says the spot was taken, as information and not as an error
- **And** `not_yet_asked` and `already_marked` record nothing and each gives its own explanation
- **And** `expired`, and an answer the app does not know, record nothing and show an error
test: `frontend/apps/mobile/src/features/messages/reminder-state.test.ts` › `records nothing and names the refusal when the spot has gone (PAD-315)` (+13 more)

#### ATTENDANCE-CONFIRM-41: One cancel action is offered to an enrolled student until the class starts (rules 9, 20, 25)
- **Given** an enrolled student looking at a class on iOS
- **When** the screen decides whether to offer "Não vou poder ir"
- **Then** it is offered whether or not the early-decline window is open, and also when the student has no presence row yet
- **And** it is not offered once the student's `attendanceState` is `not_coming`, once the class has started, on a cancelled class, to a coach, or to someone who is not in the class
- **And** a row the coach validated absent (`missed`) is not hidden by its state: it belongs to a class that has already run, so the started-class gate hides the action
test: `frontend/apps/mobile/src/features/calendar/attendance-decline.test.ts` › `stays available after the proactive window closes` (+3 more)

#### ATTENDANCE-CONFIRM-42: The coach's row names an unavailability decline as a detail, never a second state (rule 30)
- **Given** presences that are `not_coming` and not validated: one declined from a block (`declineSource` = `const:DECLINE_SOURCE_AVAILABILITY_BLOCK`, `respondedAt` set, `cancelledByStudent` true), the same on a new-engine session (`cancelledByStudent` false), one ordinary student decline (`cancelledByStudent`, `declineSource` null); then the first once the coach validated it, and a `coming` row that still carries the old `declineSource`
- **When** `cancellationDetail` is asked for the coach's row and for the student's own row, and the web and iOS participant rows render the first
- **Then** the coach's row gets `calendar.detail.cancelledUnavailableAt` with `respondedAt` for both block declines, whatever `cancelledByStudent` says, and `calendar.detail.cancelledByStudentAt` for the ordinary one; nothing for the validated row or the `coming` row; the student's row gets nothing
- **And** each rendered row shows exactly one state word ("Não vai") with the detail line beneath it, on web and on iOS
test: `frontend/packages/config/src/attendance-state.test.ts` › `[ATTENDANCE-CONFIRM-42] an unavailability decline is a detail line on the coach's row only` (+ `frontend/apps/web/src/components/calendar/AttendanceRow.test.tsx` and `frontend/apps/mobile/src/features/calendar/ParticipantRow.unavailable.test.tsx` › same name)

#### ATTENDANCE-CONFIRM-43: A decline from a block sends the student nothing and marks the coach's notice; every other decline is unchanged (rule 30)
- **Given** two students in one old-engine class and the coach's `reminder_declined` template customised
- **When** one saves an availability block covering it and the other declines through `cancel_attendance`
- **Then** no message whose sender is the coach is created for the first, and the coach's notice for them (sender the student) carries `availabilityBlock: true` with the existing `proactiveDecline`, `lateCancellation` and `lessonInstanceId`; the second gets the `reminder_declined` acknowledgement (sender the coach) and a notice without the marker, as before
- **And** the serialized presences carry `declineSource` = the constant and null respectively
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_only_a_block_save_drops_the_student_acknowledgement`

#### ATTENDANCE-CONFIRM-44: A decline on a row already declined writes, sends and clears nothing (rule 31)
- **Given** a student whose presence was marked by an availability block save (`declineSource` set), on an old-engine class and on a new-engine class, and a second student who declined an old-engine class plainly
- **When** each posts `cancel_attendance` for that class again (by `lessonInstanceId` and by `(model, originalId, date)`)
- **Then** each answer is `{"action": "declined", "proactive": false, "duplicate": true}`
- **And** the presence rows are unchanged (`declineSource`, `respondedAt`, `response`, `status`), no message is created (no second coach notice, no `reminder_declined`), no push is sent, no vacancy changes, and on the new engine no engine request is handled
- **And** a validated `missed` row still follows rule 29 (the ordinary decline runs and the coach is told, no `duplicate`), an old-engine row that is absent with no vacancy yet (a decline that failed half way) is retried and its spot freed, and a class that has started still answers 409
test: `backend/padel_app/tests/test_pad772_blocker_covers_classes.py` › `test_a_second_decline_on_a_declined_row_is_a_no_op`

#### ATTENDANCE-CONFIRM-45: On the new engine `comeBack` offers "Afinal vou" only when the engine would place the student (rule 32)
- **Given** a new-engine class of 4 (two a side) with three going (two right, one left): a left-only regular
  who said No, a left-only student placed for that class only who cancelled, a right-only student placed for
  that class only who cancelled, and a fourth left-only student who cancelled and is now placed in another
  class at the same hour
- **When** each one's class payload, dashboard row and reminder message are serialized for them
- **Then** the two left-only students get `comeBack` `rejoin`, the right-only student gets `waiting_list`
  (the class has a place, their side has none), and the student placed elsewhere at the same hour gets
  `waiting_list`; the dashboard row and the reminder message carry the same value as the class payload
- **And** when a left place is offered to someone by an open invitation it still reads `rejoin`; once a left
  student is placed, the left-only students read `waiting_list` (`on_waiting_list` when on the list)
- **And** an old-engine class's `comeBack` is unchanged (class-wide count), and a coach viewer or another
  message type gets `null`
test: `backend/padel_app/tests/test_engine_afinal_vou_free_place.py` › `test_come_back_offers_rejoin_only_when_the_engine_would_place_the_student`

#### ATTENDANCE-CONFIRM-46: Every surface hides "Afinal vou" without a place and says the place went, on web and iOS (rule 32)
- **Given** a student whose state is `not_coming` on a class that has not started
- **When** the class detail, the dashboard slot and the reminder chat bubble render with `comeBack` `rejoin`,
  `waiting_list`, `on_waiting_list` and `null`, on web and on iOS
- **Then** only `rejoin` shows "Afinal vou"; `waiting_list` shows "A tua vaga já foi ocupada" /
  "Your spot has been taken" (`calendar.detail.spotTaken`) with the waiting-list button; `on_waiting_list`
  shows `calendar.detail.onWaitingList`; `null` shows none of them
- **And** a reminder bubble after a recorded no with no `comeBack` from the server (an older server) keeps
  today's button; with `comeBack` `waiting_list` it shows the line and no button
- **And** a tap answered `spot_filled` moves the surface to the `waiting_list` line, as information, never an error
test: `frontend/apps/web/src/components/messages/MessageBubble.comeBack.test.tsx` › `[ATTENDANCE-CONFIRM-46] the bubble offers "Afinal vou" only for rejoin` (+ `frontend/apps/mobile/src/features/messages/components/message-bubble.comeBack.test.tsx` › same name; `frontend/apps/web/src/components/calendar/ClassDetailSheet.comeBack.test.tsx`, `frontend/apps/web/src/components/dashboard/coach/ComeBackSlot.test.tsx`, `frontend/apps/mobile/src/features/dashboard/ComeBackSlot.test.tsx` › `[ATTENDANCE-CONFIRM-46] …`)

#### ATTENDANCE-CONFIRM-47: A student who cancelled one class comes back from the class detail while a place is free (rule 32; end to end)
- **Given** a new-engine class with a free place on Rui's side, Rui placed for that class only and then cancelled
- **When** Rui opens the class detail on web, sees "Afinal vou" and taps it; then another student who
  cancelled opens the class (now full on that side)
- **Then** Rui's row reads `coming` and the coach's participant list moves him to "Vão"; the second student
  sees "A tua vaga já foi ocupada" and the waiting-list button and no "Afinal vou"
test: `frontend/apps/web/e2e/attendance/engine-afinal-vou-free-place.spec.ts` › `[ATTENDANCE-CONFIRM-47] a student who cancelled comes back while a place is free`

### Open questions
- **The reminder bubble's `comeBack` (rule 32; 26 Nov 2026) — decision (spec agent; the owner can reverse
  it):** served on the reminder message to its student rather than fetched by the bubble, so web and iOS
  read one field with no extra request; the cost is a free-place read per reminder message that records a
  no, on the thread's load. A bubble does not refresh when a place opens or closes elsewhere; the tap's
  answer is the guard. iOS ships in the same change (`frontend/CLAUDE.md`, web and iOS ship together).
- A reminder No after the cancellation deadline, late or not, for a new-engine session — decision (S,
  owner away, PAD-913, 2026-11-12; the owner can reverse it): late. The owner's D4 has the engine mark
  every absence on time or late by the cutoff, and today's "a reminder decline is never late" rested on
  the reminder deciding the justification, which D4 hands to the coach. A No before anyone asked stays
  never late (rule 12).
- **Answered by the owner (2026-11-12, Codex decision 6, "I want to go with Claude's proposal"):** lateness
  follows the cancellation deadline alone, reminder answers and Nos before any reminder included; the
  coach still judges justified or unjustified. The two questions below are closed by it.
- Does rule 12 (a proactive decline is never late) hold for a new-engine session? — **for the owner.**
  It cannot hold together with D4 as the coordinator reads it (2026-11-12): the cutoff alone decides,
  and scenario 61 (Tomás's expectation, one of the 133 that do not change) expects a No after the
  cutoff, before any request went out, to be late. Until the owner answers, the engine follows the
  cutoff and rule 12 holds for old-engine sessions only; options: keep that, or exempt a No before the
  student was asked and change scenario 61.
