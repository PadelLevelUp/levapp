---
id: notifications.semi-auto-approval
status: draft
depends_on: [notifications.config, notifications.invitations, messaging.conversations, messaging.messages]
serves: [P-NOTIFICATIONS-1]
governed_by: []
---

# notifications.semi-auto-approval


### Intent
In semi-automatic mode, the invitation engine asks the coach for approval before sending replacement invitations. Each vacancy produces a replacement approval prompt showing who declined and the full ordered invite queue; the coach approves (now or at the invitation window), or dismisses and falls back to the manual flow.

### Entities
- **ReplacementApprovalPrompt**: coach_id, vacancy_id (unique — one prompt per vacancy), declined player info, full ordered invite queue (all eligible candidates across all rounds/groups, in invite order, at prompt-creation time), waiting-list disclosure (`waiting_list_player_id`; always null since PAD-446, the waiting list is in the queue), status (pending|approved|dismissed), bundle reference (groups prompts created by a single presence confirmation), created_at, decided_at
- **Assistant conversation**: a system conversation between the platform assistant and the coach (new concept — today conversations exist only between users). One per coach; reuses the existing conversation/message machinery (SSE delivery, push notifications, unread counts). Approval prompts are delivered as messages with coach action buttons
- **Vacancy.approval_status** (defined in notifications.invitations): not_required | pending | approved | dismissed

### Rules for a session on the new engine (PAD-913)
Which engine runs a session is `notifications.config` rule 18. **For an old-engine session every rule
below holds as written.** For a session on the new engine (the swap, PAD-912; owner ruling D2,
2026-11-11: semi-automatic is kept, "exactly the same engine, but instead of sending directly the
message it should ask the coach permission") the hold is `notifications.engine-planning` rule 14, keyed
to the **session**, not to a vacancy (swap decision 1 drops vacancies). The items in the table are
replaced and the readings below hold; the rest hold unchanged. When every coach is drained, the old
engine is deleted and the replaced items go with it.

| Item | For a new-engine session | Source |
|---|---|---|
| Entities: `ReplacementApprovalPrompt` per vacancy, `Vacancy.approval_status` | one pending `ApprovalRequest` per session and the session's approved queue, kept by the store | `notifications.engine-planning` rule 14 |
| Rule 2 (every vacancy-creation path prompts) | a planning run that would send to a student outside the approved queue raises the request; there is no vacancy to create | `notifications.engine-planning` rule 14 |
| Rule 3 (one prompt per vacancy) | one pending request per session; a new one replaces it, an equal one is not raised again | `notifications.engine-planning` rule 14 |
| Rule 4 (the full ordered queue; exactness) | the queue per open spot type from the dry run; the engine never invites outside the approved queue without a new request | `notifications.engine-tiers` rule 12, `notifications.engine-planning` rule 14 |
| Rule 4b (`emptyQueueReasons`) | the dry run's verdict stages, counted per type | `notifications.engine-tiers` rule 12 |
| Rule 5 (the waiting list heads the queue) | the coach's list, then the students' list, head each type's queue (tier order) | `notifications.engine-tiers` rule 5 |
| Rules 7, 7a (bundles of vacancies) | one request per session carries every type; no bundles | `notifications.engine-planning` rule 14 |
| Rule 8 (three actions) | approve, removing any students; "Yes, at the window" goes (no request before the window); "Ignorar" dismisses until the spot count changes or the coach reopens the class | `notifications.engine-planning` rule 14 |
| Rules 9, 10 (gating by approval status) | the hold itself; waiting-list invitations are held, automatic entry and direct join are not | `notifications.engine-planning` rule 14 |
| Rule 11 (a fill or expiry resolves the prompt) | a run with nothing left to ask for withdraws the request, which goes stale | `notifications.engine-planning` rule 14 |
| Rule 1a (leaving semi-automatic releases spots) | switching to automatic withdraws the pending request and the next run sends | `notifications.engine-planning` rule 14 |

Readings:
- Rule 1: the hold applies when `invitation_mode` is `semi_automatic` (carried by `notifications.config`
  rule 19); `auto_notify_enabled` off lists no session at all.
- Rule 6: the request is persisted as a message in the coach's Assistant conversation, as today.
- Rule 12: recomputing from the class asks the engine's dry run with the class as it is now and raises a
  fresh request.

The new-engine answer (swap step 7, PAD-919):
- **N1. The class's approval state is the session's request.** The class view's suggestion state
  (rule 12's route) answers, for a new-engine session: the pending request's id and its queues per
  spot type (in `notifications.invite-simulation`'s N2 shape), the approved and removed students and
  whether the session is dismissed; `emptyQueueReasons` becomes the dry run's stage counts per type.
  On the wire (`GET /api/app/notify/approval/instance/<id>`): `{engine: "new", state:
  "pending"|"dismissed"|"none", semiAutomatic, approved: [playerId], removed: [playerId], request?:
  {requestId, lessonInstanceId, spotTypes: [{side, level, queue, emptyQueueReasons?: [{stage,
  count}]}]}}`.
- **N2. The coach's answer.** "Sim" answers `ApproveQueue(session, request, removed)` and "Ignorar"
  `DismissQueue(session)`; "Yes, at the window" is refused for a new-engine session (no request is
  raised before the window); an answer naming a request that is no longer pending decides nothing and
  answers `stale`. On the wire `POST /api/app/notify/approval/respond` takes `{bundleId: <requestId>,
  action: "yes_now"|"dismiss", removed?: [playerId]}` and answers `{engine: "new", requestId, result:
  "approved"|"dismissed"|"stale", state?}`; `yes_at_window` is a 400.
- **N4. The request reaches the coach (rule 6).** The outbox's sender for an `ApprovalRequest` posts one
  `replacement_approval` message in the coach's Assistant conversation, its metadata `{engine: "new",
  requestId, lessonInstanceId, responded: false, spotTypes: [{side, level, queue}]}`, then pushes it to
  the coach, once (`notifications.engine-store` rule 2).
- **N3. Recompute.** Recomputing from the class (rule 12) answers `ReopenQueue(session)` when dismissed
  and re-plans the session at once (`Engine.plan(session, now)`), which raises a fresh request. A
  session whose pending request's queues are unchanged keeps that request: it is already current, and
  the class view computes its list when shown (rule 12b).

- **N5. The card, web and iOS** (web `ReplacementApprovalCard`, iOS `replacement-approval-card`, one shared
  display helper in `@levelup/config` as rule 7a's): for a new-engine request, one block per spot type
  (side and level, its open spots) with its queue in order, the first 5 and "Ver mais (N)" as rule 7a,
  "A mostrar 5 de N · ao aprovar, são convidados todos" whenever truncated. Each student has a remove
  toggle (`approval-remove-<playerId>`); a removed student is struck through and counted in "Sim (N
  retirados)" / "Yes (N removed)" (proposed). The buttons: "Sim" (`approval-yes`, sends `yes_now` with the
  removed ids) and "Ignorar" (`approval-dismiss`) on the class's card; the conversation's card offers
  "Sim" only (rule 8, PAD-545). No "at the window" button for a new-engine request. A `stale` answer, or
  a message whose request is no longer pending, shows "Este pedido foi substituído por um mais recente."
  / "This request was replaced by a newer one." (proposed) and no buttons; `dismissed` shows "Ignorado" /
  "Ignored". An empty type shows its `emptyQueueReasons` with N6's words.

The card's new words (N5) are proposed, for the owner's approval.

### Rules
1. Applies only when `auto_notify_enabled` is true and `invitation_mode` is `semi_automatic`; in automatic mode vacancies get approval_status "not_required" and behavior is completely unchanged
1a. **Leaving semi-automatic releases the spots awaiting approval (PAD-766, ledger B-688; coordinator 2026-10-27).** When a coach's `invitation_mode` changes from `semi_automatic` to `automatic`, every open vacancy of that coach whose class has not started and whose approval_status is `pending` becomes `not_required`, in the same commit as the mode, and its pending prompt becomes `stale` (with `decided_at`), so its message's buttons answer "stale" and decide nothing. The sweep (`process_invitation_batches`) then starts these spots on its next tick, under the same restrictions, claim and per-class automatic-invitations switch as any spot. A `dismissed` vacancy stays dismissed: the coach already said no to it. The sweep heals itself: it treats an open `pending` vacancy whose coach's mode is now `automatic` the same way (released, prompt stale, started on that tick), so spots stranded before this rule recover with no data repair. **The released spot takes the coach's invitation window (PAD-776 part 2, ledger B-702).** A pending spot carries no `invite_not_before` (only an approval "at the window" writes one), so the release, from the switch and from the sweep alike, stamps the window the coach's current invitation start gives the class (invitations rule 11), exactly as a spot opened in automatic mode gets it: a window still ahead holds the spot until it opens, and a window already past is not stored, so the spot starts on that tick. A save that switches the mode and moves the invitation start in one go ends with the saved window (invitations rule 11a re-times the released spot in the same commit). Switching `automatic` → `semi_automatic` changes nothing for spots already open: `not_required` spots keep inviting, and only spots opened afterwards wait for approval. The release keys on the mode alone: a semi-automatic coach who turns automatic notifications off keeps the spots pending, and they stay decidable when notifications come back on.
2. In semi-automatic mode, every vacancy-creation path sets approval_status "pending" and creates a replacement approval prompt instead of sending invitations: player declines via reminder response, coach confirms presences marking players absent, and the `invite_start` scheduler job
3. One prompt per vacancy (idempotent): re-triggering invitations for a vacancy that already has a prompt does not create a duplicate
4. **The prompt says why each spot is open (PAD-574, B-522).** A spot a student freed reads "O
   {{nome}} não vai. Convites para a vaga libertada" / "{{name}} isn't coming. Invitations for the
   freed spot"; a spot the class never filled (a structural vacancy, `original_player_id` NULL)
   reads "Vaga por preencher. Convites sugeridos" / "Open spot. Suggested invitations" — never a
   student's name, never "confirmou que não vai comparecer". The payload says which with
   `openSpot` and carries the vacancy's `side`; the persisted Assistant text (rule 6) makes the
   same split ("Open spot." / "Spot freed by {name}."). The prompt shows the FULL ordered invite queue — all eligible candidates across all rounds/groups, in the exact order the engine would invite them, computed at prompt-creation time. Exactness principle: the list shown to the coach is exactly the set of players who may receive invitations — the engine may never invite anyone not on the shown list. Eligibility is recomputed at send time using the same rules, which may shrink or reorder the list; a player who wasn't shown may be invited only because their eligibility changed between prompt creation and send time
4b. **An empty queue says why (PAD-661, B-501 follow-up; numbering unconfirmed).** A prompt is
   created even when the engine can suggest nobody (restrictions gate sending, not asking), and
   the coach then saw only "no eligible players". The payload now carries `emptyQueueReasons` for
   a vacancy whose `queue` is empty: the coach's roster evaluated against the engine's LOOSEST wave
   (`invitation_waves`, the last group), counted by the first stage that dropped each student
   (`CANDIDATE_STAGES`: `declined_this_class`, `already_invited`, `eligibility`,
   `excluded_by_coach`, `inactive_account`, `has_class_same_day`, `unavailable`,
   `auto_invites_off`, `no_round_matched`, `offered_another_spot`), in that order, zero counts
   left out; the students already in the class and the departing one are not reasons and are not
   counted. Web and iOS render it under the empty state as one line per stage ("7 fora dos
   critérios de elegibilidade · 2 excluídos pelo treinador"). A non-empty queue carries no
   reasons; an older payload without the key renders the empty state as before. The class
   detail's recomputed suggestions (rule 12) carry the same key, since they share the payload.
5. **The waiting list heads the queue (PAD-446).** The class's waiting-list students the engine would ask first (`notifications.invitations` rule 8a) open the queue, in their order, each entry marked `fromWaitingList: true`; clients tag them "from the waiting list". Nobody is placed without an invitation any more, so the old disclosure ("Player X from the waiting list will be added directly to the class") is never made: `waiting_list_player_id` is stored null, which older builds read as "no disclosure"
6. Every prompt is persisted as a message in the coach's Assistant conversation — the source of truth — regardless of which surface triggered it
7. Presence-confirmation surface: when confirming presences creates N vacancies, the frontend immediately shows one inline approval card bundling all N vacancies (declined players + invite queues concatenated). One decision applies to the whole bundle; the same bundle is also persisted in the Assistant conversation
7a. **How a card presents a bundle (PAD-574; coordinator 2026-10-10, owner veto in the morning).**
   Display only — a decision still reaches the server per vacancy and the engine still invites
   vacancy by vacancy with the rules of today (simultaneous maximum, order, batches, inactivity),
   so one student never gets two invitations for one class because the class has two spots.
   - A freed spot (rule 4's first case) is always its own block with the student's name, even
     when its list equals another spot's.
   - Open spots with the **same side and the same ordered list** are one block, counted: "3 vagas ·
     prioridade esquerda" / "3 spots · left priority" (one: "1 vaga · prioridade esquerda"; no
     side: "qualquer lado" / "any side"). The key includes the side because the label names one;
     identical lists on different sides stay apart; a reordered list is a different list. Grouping
     compares the lists themselves — it never assumes two lists (left, right): the lists change
     when a spot is filled and the suggestions are recomputed (rule 12) or with the side rule
     (PAD-565).
   - Every list shows its **first 5** students; "Ver mais (N)" / "Show more (N)" reveals the rest,
     "Ver menos" / "Show less" folds it back. **Whenever a list is truncated** the block carries the
     line "A mostrar 5 de 31 · ao aprovar, são convidados todos" / "Showing 5 of 31 · approving
     invites them all", on both shells, so the coach never reads the preview as the invite set.
   - Staleness inside a block: when some of a block's spots are already filled or expired (rule
     11), the block reads "N de M vagas já preenchidas ou expiradas" / "N of M spots already filled
     or expired"; approving still sends for the others.
   - Shared logic (`@levelup/config` `approval-display`: groups, preview, stale count); web
     `ReplacementApprovalCard` and iOS `replacement-approval-card` render it. Test ids:
     `approval-block` (with `data-kind` on web), `approval-reason-declined` / `approval-reason-open`,
     `approval-show-more`, `approval-showing-of`, `approval-group-stale`.
8. Coach actions (three):
   - **"Yes, right now"** → approval_status "approved" and invitations are sent right away, bypassing the invitation window
   - **"Yes, at {window open time}"** → approval_status "approved"; invitations are sent when the invitation window opens (per `invitation_start_timing`). The button label shows the concrete window-open datetime. `windowOpenAt` is sent as a naive ISO string on the club's wall clock (`notifications.invitations` rule 11, PAD-256); the clients decide "window still ahead" against the club's clock (`lisbonNow()`), not the device's (PAD-295)
   - **"Ignorar"** (action `dismiss`) → approval_status "dismissed"; the prompt is closed. The vacancy REMAINS OPEN (Vacancy.status unchanged) but the engine never sends invitations for it on its own; the coach can still use the manual invitation flow (notifications.manual). That prompt cannot be re-approved; the coach brings the vacancy back only by recomputing the suggestions from the class (rule 12). **PAD-545 (coordinator, 2026-10-07):** the chat message offers only the two send buttons — there is no "No" in the conversation, a coach who does not want to send simply does not press; "Ignorar" lives on the class's card
   When the invitation window is already open, only **"Yes, right now"** is offered in the conversation (and "Ignorar" on the class card)
9. Gating: `process_invitation_batches()` and the `invite_start` scheduler job skip vacancies with approval_status "pending" or "dismissed"; only "not_required" and "approved" vacancies are processed
10. The waiting list waits for approval like everyone else: its group-0 invitations are invitations, so rule 9's gate holds them until the coach approves, and a dismissed vacancy never invites from the waiting list either
11. **A spot that fills or expires resolves its prompt at once (PAD-765, B-689).** When a vacancy
   leaves `open` by any route (an accepted invitation, an accepted join request, a coach adding a
   student or editing the class, or expiry), its pending prompt becomes `stale` in the same commit,
   and its Assistant message marks that spot `resolved: "filled" | "expired"` (a live
   `message_edited`). Both clients count a resolved spot as stale (rule 7a's "N de M vagas já
   preenchidas ou expiradas"), and a message whose spots are all resolved shows no buttons. A
   decision on it stays a no-op (`stale`), as does a decision once the class has started on the
   club's clock (PAD-256, NOTIFICATIONS-SEMI-AUTO-APPROVAL-32). One `before_flush` listener on the vacancy's status
   (`replacement_approval_service`) is the only place this happens, so no route can forget it; a
   prompt no longer `pending` (decided, or released by a mode switch) is left as it is.
   The invitation tick (`process_invitation_batches`) also resolves, through the same
   `resolve_prompts_for` and before it looks at any open spot, every pending prompt whose spot is no
   longer `open`. This catches rows the listener never saw (spots closed before the listener
   existed, or changed outside a session flush) and logs the count only when it resolved something
   (PAD-780).
12. **Recomputing the suggestions from the class (PAD-545, PAD-542; coordinator, 2026-10-07; numbering unconfirmed).**
   The class view reads the class's suggestion state (`GET /api/app/notify/approval/instance/<id>`,
   the class's coach only): `pending` with **every** pending prompt of the class as `bundles`
   (PAD-765) — grouped by bundle, since the bundle stays the one decision, and ordered by their
   oldest spot (decline order), each listing only its spots still open and pending; `bundle` carries
   the first of them for older builds. Web `ClassDetailSheet` and the iOS class screen render one
   card per bundle in that order. Otherwise `dismissed` when the coach ignored them, or `none`. With `dismissed` it shows a **"Sugestão de convites automáticos"** button
   instead of the names. Pressing it (`POST …/recompute`) computes the list **from scratch with the
   class as it is now** — never the old list — and asks again: every open vacancy of the class that
   is `pending` or `dismissed` is locked (the engine's lock order starts with the vacancy, ascending
   id) and set back to `pending`, its one prompt is moved to a NEW bundle with the fresh queue, and one
   new message carries that bundle to the Assistant conversation (rule 6), all in **one commit**.
   Nothing is sent by the recompute: the coach decides on the new bundle as on any other. An
   `approved` vacancy is never re-opened. A decision on an OLDER bundle answers `stale` for each of its
   vacancies and changes nothing, so a message pressed long after cannot send a list computed
   before; `respond_to_approval` locks each vacancy in the same order and re-reads its prompt before
   deciding, so a decision racing a recompute is decided on one side of it. While the suggestions are
   being computed (confirming presences, recomputing), both clients show "A preparar sugestões de
   convites…" (PAD-542).
12b. **The class view's list is computed when shown (PAD-765).** Each pending spot's queue is
   computed from the class as it is when the view loads (`compute_full_invite_queue`), not from the
   snapshot stored at prompt time, so a student enrolled since is not offered. `roundNumber` is the
   wave that would ask the student if sent now — the same number the engine stamps on that round's
   invitations (`invitation_waves`' 1-based group number; 0 the waiting list). A later send can
   still reach a later round, because eligibility is re-read at each send. The Assistant message
   keeps the queue as it was built and says so: under its spots it reads 'Fila às HH:MM' / 'Queue
   as of HH:MM' (the time the message was built, on the club's clock, with the day when it is not
   today), while the class view shows the queue as it is now. A 'Sim' pressed on the message
   invites only the students eligible when it is pressed (rule 5), so an older list never invites
   an enrolled student, a student who declined, or more spots than are open (PAD-770). The class
   view reads its suggestions again every time it reads the class again (a presence moved, a join
   was accepted), so its cards follow the class without reopening it; a card the coach has just
   answered stays until the class is closed (PAD-770, B-692).

### Acceptance Criteria

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-1: A released spot waits for a window still ahead (rule 1a, PAD-776 part 2)
- **Given** a semi-automatic coach's class tomorrow 09:00 with one open spot `pending` approval and the invitation start saved as "6 hours before" (opens 02:00 UTC tomorrow)
- **When** the coach switches to `automatic`, or the sweep releases the spot after a switch made before this rule
- **Then** the spot is `not_required` with `invite_not_before` 02:00 UTC tomorrow, the sweep sends nothing before then, and its first batch goes out on the first tick after it

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-2: A spot released after its window opened sends at once (rule 1a, PAD-776 part 2)
- **Given** the same spot with the invitation start "24 hours before" (already open)
- **When** the coach switches to `automatic`
- **Then** `invite_not_before` stays empty and the next tick sends the first batch

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-3: One save that switches the mode and moves the window uses the saved window (rule 1a, PAD-776 part 2)
- **Given** the same spot under "24 hours before"
- **When** one save sets `automatic` and "6 hours before"
- **Then** `invite_not_before` is 02:00 UTC tomorrow and the tick at NOW sends nothing

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-4: Prompt created on reminder decline
- **Given** a coach with auto_notify_enabled=true and invitation_mode="semi_automatic"
- **When** player Alice declines a reminder for instance 10
- **Then** a Vacancy is created with approval_status "pending" and no invitations are sent
- **And** a replacement approval prompt for the vacancy is delivered as a message in the coach's Assistant conversation, showing Alice as the decliner and the full ordered invite queue (all eligible candidates across all rounds/groups, in invite order)

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-5: Bundled card on presence confirmation
- **Given** semi-automatic mode and a class instance with players Alice and Bob
- **When** the coach confirms presences marking both Alice and Bob absent
- **Then** two Vacancies are created with approval_status "pending"
- **And** the frontend shows ONE inline approval card bundling both vacancies with their full ordered invite queues
- **And** the same bundled prompt is persisted in the Assistant conversation
- **And** one decision on the card applies to both vacancies

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-6: A never-filled spot says so, a freed spot names the student (rule 4, PAD-574)
- **Given** semi-automatic mode and a class of 4 with Alice and Bob enrolled, so two spots were never filled
- **When** the coach marks Alice absent and the prompt is built
- **Then** the bundle has three vacancies: Alice's with `openSpot: false` and her name, and two with `openSpot: true`, `declinedPlayerName` null and each one's `side`
- **And** on web and iOS Alice's block reads "A Alice não vai. Convites para a vaga libertada" and the open spots read "Vaga por preencher. Convites sugeridos"
- **And** the persisted Assistant text says "Open spot." for them and "Spot freed by Alice." for hers

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-7: An empty queue tells the coach why (rule 4b, PAD-661)
- **Given** semi-automatic mode, a class of 2 with one roster student enrolled, one free roster
  student on the coach's excluded list (`restrictions.excludedPlayers`), and the never-filled place
  inside its invitation window
- **When** the tick opens the place and the prompt is built
- **Then** the bundle has one vacancy with `openSpot: true`, `queue: []` and
  `emptyQueueReasons: [{"stage": "excluded_by_coach", "count": 1}]`
- **And** on web and iOS the block shows the empty state followed by "1 excluído pelo treinador" /
  "1 excluded by the coach"; a vacancy with a non-empty queue carries no `emptyQueueReasons`

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-8: Identical open-spot lists are one block, freed spots never are (rule 7a)
- **Given** a bundle with 8 open spots: 3 left-side spots with list A, 5 right-side spots with list B, and Bob's freed spot with list A
- **When** the card renders, on web and iOS
- **Then** it shows three blocks: "3 vagas · prioridade esquerda" over list A, "5 vagas · prioridade direita" over list B, and Bob's own block over list A
- **And** approving sends vacancy by vacancy, as before (nine vacancies, one request)

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-9: Long lists show five with "Ver mais" and say approval invites everyone (rule 7a)
- **Given** a block whose list holds 31 students
- **When** the card renders
- **Then** it shows the first 5, "Ver mais (26)" and "A mostrar 5 de 31 · ao aprovar, são convidados todos"
- **And** "Ver mais" shows all 31 and the line goes; "Ver menos" folds it back
- **And** a list of 5 or fewer shows neither the button nor the line

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-10: Prompt on scheduler invite-start path
- **Given** semi-automatic mode and the `invite_start` job firing for an instance with an unconfirmed spot
- **When** the job creates a vacancy
- **Then** the vacancy gets approval_status "pending", no invitations are sent, and a prompt is delivered in the Assistant conversation

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-11: Coach schedules approval for the invitation window
- **Given** a pending prompt whose invitation window (per invitation_start_timing) has not yet opened
- **Then** the conversation's prompt offers **"Yes, right now"** and **"Yes, at {window open time}"** (label showing the concrete window-open datetime); the class's card also offers **"Ignorar"** (rule 8)
- **When** the coach responds **"Yes, at {window open time}"**
- **Then** the vacancy becomes approval_status "approved"
- **And** invitations are sent when the invitation window opens, with eligibility recomputed at send time using the same rules (no one outside the shown list is invited unless their eligibility changed)

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-12: Coach approves immediately
- **Given** a pending prompt whose invitation window has not yet opened
- **When** the coach responds **"Yes, right now"**
- **Then** the vacancy becomes approval_status "approved"
- **And** invitations are sent right away, bypassing the invitation window

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-13: Window already open: reduced button set
- **Given** a pending prompt whose invitation window is already open
- **Then** the prompt offers only **"Yes, right now"** (the scheduled option is not shown; the class's card also offers **"Ignorar"**)
- **When** the coach responds **"Yes, right now"**
- **Then** invitations are sent right away

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-14: Coach dismisses
- **Given** a pending prompt for a vacancy
- **When** the coach presses **"Ignorar"** on the class's card (action `dismiss`, rule 8)
- **Then** the vacancy gets approval_status "dismissed" but Vacancy.status remains "open"
- **And** the engine never sends invitations for it (batch processor and scheduler skip it)
- **And** the coach can still send manual notifications for the instance
- **And** the prompt cannot be re-approved afterwards

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-15: Ignored suggestions are recomputed from the class (rule 12)
- **Given** a dismissed vacancy, and a student added to the roster since the first list
- **When** the coach presses "Sugestão de convites automáticos"
- **Then** the vacancy is "pending" again, a new bundle whose queue includes the new student is
  posted to the Assistant conversation, and no invitation is sent

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-16: An old message's yes after a recompute does nothing and says so (rule 12)
- **Given** a recompute has replaced bundle A with bundle B
- **When** the coach presses "Sim, agora mesmo" on bundle A's message
- **Then** every vacancy answers "stale", nothing is sent, and the vacancy stays "pending"; a yes on
  bundle B sends

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-17: The class shows every pending prompt, oldest spot first (rule 12, PAD-765)
- **Given** semi-automatic mode and a class where case 7 declined on 14 Oct and case 8 on 21 Oct,
  each prompt in its own bundle, neither answered
- **When** the coach opens the class (web or iOS)
- **Then** the class shows two approval cards, case 7's bundle first, then case 8's

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-18: The list is the class as it is now (rule 12b, PAD-765)
- **Given** a pending prompt whose stored queue lists case 9
- **When** the coach adds case 9 to the class and opens it
- **Then** case 9 is not in the queue the class view shows

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-19: A spot filled by an accepted join request resolves its prompt (rule 11, PAD-765)
- **Given** the two pending prompts above
- **When** the coach accepts case 9's request to join and it fills case 7's spot
- **Then** that prompt is `stale` in the same commit, its Assistant message marks the spot
  `resolved: "filled"` and shows no buttons, and the class shows only case 8's card
- **And** the same holds when the spot fills by the coach adding a student, or expires

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-20: The tick resolves prompts the listener never saw (rule 11, PAD-780)
- **Given** a prompt still pending on a vacancy already filled and another on one already expired,
  written without the listener firing
- **When** the invitation tick runs
- **Then** both prompts are stale and their messages mark the spots resolved filled/expired; a
  pending prompt on an open spot and a decided prompt on a closed spot are untouched

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-21: A student who joined leaves the suggestions, live (rule 12b, PAD-770)
- **Given** a class with two spots awaiting approval, and case 13 in the suggested queue
- **When** the coach accepts case 13's request to join while the class is open on web or iOS
- **Then** without reopening the class, the card of the spot case 13 took is gone, case 13 is in
  no queue, and one spot is left

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-22: A student who declined is not suggested again (rule 12b, PAD-770)
- **Given** case 10 answered "no" to an invitation for this class
- **When** the coach opens the class
- **Then** case 10 is in no suggested queue

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-23: An old list approved from the message invites only who is eligible now (rules 5, 12b, PAD-770)
- **Given** the Assistant message's list, built at 20:41, still names case 13 (joined since) and
  case 10 (declined since), and reads "Fila às 20:41"
- **When** the coach presses "Sim, agora mesmo" on it
- **Then** neither is invited, and only spots still open send; a closed one answers "stale"

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-24: Batch processor skips unapproved vacancies
- **Given** vacancies with approval_status "pending" and "dismissed" of a coach still in semi_automatic
- **When** `process_invitation_batches()` runs
- **Then** no NotificationEvents or invitation messages are created for those vacancies

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-25: Switching to automatic releases the spots awaiting approval (rule 1a, PAD-766)
- **Given** a semi-automatic coach's class tomorrow with one open vacancy pending approval, its prompt pending and nobody invited
- **When** the coach saves `invitationMode: "automatic"`
- **Then** the vacancy is `not_required` and its prompt `stale` in the same commit as the mode, and the next `process_invitation_batches()` sends the spot's first batch (3 invitations at maxSimultaneous 3)

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-26: The sweep starts a spot stranded by an earlier switch (rule 1a, PAD-766)
- **Given** the same pending vacancy and prompt, and the coach's mode set to `automatic` with nothing else changed (a switch made before rule 1a)
- **When** `process_invitation_batches()` runs
- **Then** the vacancy is `not_required`, its prompt `stale`, and the spot's first batch is sent on that tick

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-27: A dismissed spot stays dismissed (rule 1a, PAD-766)
- **Given** the same vacancy dismissed by the coach (vacancy and prompt `dismissed`)
- **When** the coach saves `invitationMode: "automatic"` and `process_invitation_batches()` runs
- **Then** the vacancy and its prompt stay `dismissed` and nobody is invited

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-28: One prompt per vacancy
- **Given** a vacancy that already has a replacement approval prompt
- **When** invitations are triggered again for the same vacancy
- **Then** no second prompt is created

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-29: Automatic mode unchanged
- **Given** a coach with invitation_mode="automatic" (default)
- **When** a vacancy is created on any path
- **Then** it gets approval_status "not_required", no prompt is created, and invitations are sent exactly as before

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-30: The waiting list heads the prompt's queue (PAD-446)
- **Given** semi-automatic mode and a vacancy for which player Carol is on the class's waiting list
- **When** the replacement approval prompt is created
- **Then** Carol is first in the queue, marked `fromWaitingList: true`, and `waiting_list_player_id` is null

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-31: The waiting list waits for approval (PAD-446)
- **Given** semi-automatic mode, a pending vacancy, and a player with an active standing waiting-list entry
- **When** the engine processes the vacancy
- **Then** nobody is invited or enrolled, the waiting-list student included
- **And** after the coach approves, the waiting-list student is invited first

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-32: An answer that arrives too late is a no-op, and "at the window" on an open window sends at once (rules 8, 11)
- **Given** a pending prompt for a class at 10:00 club time
- **When** the coach answers yes after the class has started on the club's clock
- **Then** the answer is `stale` and nothing is sent; half an hour before the start it is approved
- **And** an answer for a spot that is no longer open is `stale`: the prompt reads stale, the spot's approval is unchanged and nobody is invited
- **And** "yes, at the window" for a window that is already open approves the spot and invites at once
test: `backend/padel_app/tests/test_pad256_class_over.py` › `test_a_replacement_prompt_goes_stale_when_the_class_starts` (+2 more)

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-33: The Assistant is never listed among users (rule 6)
- **Given** the Assistant account that carries the prompts
- **When** the active users are listed
- **Then** the Assistant is not among them
test: `backend/padel_app/tests/test_semi_auto_approval.py` › `test_assistant_user_never_listed_in_active_users`

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-34: Only the class's own coach, in semi-automatic mode, reads or recomputes its suggestions (rules 1, 12)
- **Given** coach A's class and coach B
- **When** B reads or recomputes the suggestions of A's class
- **Then** both answer 403, while A gets the class's state
- **And** a coach in automatic mode who recomputes is refused with 409
test: `backend/padel_app/tests/test_pad545_recompute_suggestions.py` › `test_the_endpoints_are_the_classs_coachs_only` (+1 more)

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-35: The conversation's card offers the send buttons only; ignoring a suggestion is on the class's card (rule 8, PAD-545)
- **Given** an approval card for one open spot
- **When** it is shown in the Assistant conversation
- **Then** it offers "yes, right now" and no "Ignorar"
- **And** the same card on the class offers "Ignorar" too
test: `frontend/apps/web/src/components/notifications/ReplacementApprovalCard.test.tsx` › `the conversation's card has no dismiss button` (+1 more)

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-36: A card shows its buttons only while it can be answered, and says when a yes reached no spot (rules 8, 11, 12; iOS)
- **Given** an approval message in the iOS app
- **Then** a card is drawn only when the message carries a bundle id and at least one spot
- **And** the buttons show while the bundle is unanswered and not read-only; afterwards the recorded answer shows
- **And** the card is stale only when the server refused every one of its spots as stale
- **And** a yes that reached no spot tells the coach the spots were filled or expired, or that the list was recalculated
test: `frontend/apps/mobile/src/features/notifications/approval-bundle.test.ts` › `accepts a bundle carrying an id and at least one vacancy` (+14 more)

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-37: The class's approval state is the session's request (new-engine section N1)
- **Given** a semi-automatic new-engine session with a pending request over two spot types, one student approved and one removed earlier
- **When** the coach's class view reads its suggestions
- **Then** the answer carries the request's id, its queues per type, the approved and removed students and `dismissed` false, and an empty type's `emptyQueueReasons` are the dry run's stage counts
test: `backend/padel_app/tests/test_pad919_engine_simulation.py` › `test_the_approval_state_is_the_sessions_request`

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-38: The coach approves or dismisses the pending request (new-engine section N2)
- **Given** a pending request R2 that replaced R1
- **When** the coach answers "Sim" on R2 removing one student, "Sim" on R1, "Yes, at the window" and "Ignorar"
- **Then** R2's answer is `ApproveQueue(session, R2, removed)`, R1's answers `stale` and decides nothing, "at the window" is refused, and "Ignorar" is `DismissQueue(session)`
test: `backend/padel_app/tests/test_pad919_engine_simulation.py` › `test_the_coach_approves_or_dismisses_the_pending_request`

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-39: Recomputing a dismissed session raises a fresh request (new-engine section N3)
- **Given** a dismissed new-engine session
- **When** the coach recomputes the suggestions from the class
- **Then** the session is reopened and the next run raises a new request with the class as it is now
test: `backend/padel_app/tests/test_pad919_engine_simulation.py` › `test_recompute_raises_a_fresh_request`

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-40: The outbox posts the request in the coach's Assistant conversation (new-engine section N4)
- **Given** an `ApprovalRequest` row in the outbox for a session with two spot types
- **When** the outbox sends it, and sends again
- **Then** the coach's Assistant conversation holds one `replacement_approval` message with `engine` `new`, the request's id, the lesson instance, `responded` false and each type's side, level and queue, the coach gets one push, and the second send adds nothing
test: `backend/padel_app/tests/test_pad919_engine_simulation.py` › `test_the_outbox_posts_the_request_to_the_coachs_assistant`

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-41: The web card approves with removals, dismisses, and reads a stale answer (new-engine section N5)
- **Given** a new-engine request on web with a left type of 7 students and an either type with none, on the class's card and in the conversation
- **When** the coach removes two students and presses "Sim", and on another card presses "Ignorar", and a third card's answer comes back `stale`
- **Then** the left block shows 5 with "Ver mais (2)" and the truncation line, the either block shows its empty-queue reasons, "Sim (2 retirados)" sends `yes_now` with both ids, "Ignorar" sends `dismiss`, the conversation card has no "Ignorar", no card has an "at the window" button, and the stale card shows the replaced line with no buttons
test: `frontend/apps/web/src/components/notifications/ReplacementApprovalCard.newEngine.test.tsx` › `approves with removals, dismisses and reads a stale answer`

#### NOTIFICATIONS-SEMI-AUTO-APPROVAL-42: The iOS card does the same with the same test ids (new-engine section N5)
- **Given** the same requests on iOS
- **Then** the same blocks, removals, buttons, test ids and stale line show, and the same requests are sent
test: `frontend/apps/mobile/src/features/notifications/replacement-approval-card-new-engine.test.tsx` › `approves with removals, dismisses and reads a stale answer`

### Open questions
- Does semi-automatic mode survive the engine swap (swap decision 2)? — decision (owner, 2026-11-11):
  kept, as the hold of `notifications.engine-planning` rule 14 (the shape is the coordinator's,
  reversible by the owner). "Ignorar" is `DismissQueue` (the coordinator's ruling, reversible by the
  owner, `notifications.engine-planning` Open questions). The message and card copy are not decided;
  they go to the owner with this spec's swap step.
