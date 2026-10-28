---
id: notifications.semi-auto-approval
status: draft
depends_on: [notifications.config, notifications.invitations, messaging.conversations, messaging.messages]
implements: ../../specs-business/notifications/coach-approves-replacements.business.md
governed_by: []
---

# notifications.semi-auto-approval


### Intent
In semi-automatic mode, the invitation engine asks the coach for approval before sending replacement invitations. Each vacancy produces a replacement approval prompt showing who declined and the full ordered invite queue; the coach approves (now or at the invitation window), or dismisses and falls back to the manual flow.

### Entities
- **ReplacementApprovalPrompt**: coach_id, vacancy_id (unique — one prompt per vacancy), declined player info, full ordered invite queue (all eligible candidates across all rounds/groups, in invite order, at prompt-creation time), waiting-list disclosure (`waiting_list_player_id`; always null since PAD-446, the waiting list is in the queue), status (pending|approved|dismissed), bundle reference (groups prompts created by a single presence confirmation), created_at, decided_at
- **Assistant conversation**: a system conversation between the platform assistant and the coach (new concept — today conversations exist only between users). One per coach; reuses the existing conversation/message machinery (SSE delivery, push notifications, unread counts). Approval prompts are delivered as messages with coach action buttons
- **Vacancy.approval_status** (defined in notifications.invitations): not_required | pending | approved | dismissed

### Rules
1. Applies only when `auto_notify_enabled` is true and `invitation_mode` is `semi_automatic`; in automatic mode vacancies get approval_status "not_required" and behavior is completely unchanged
1a. **Leaving semi-automatic releases the spots awaiting approval (PAD-766, ledger B-688; coordinator 2026-10-27).** When a coach's `invitation_mode` changes from `semi_automatic` to `automatic`, every open vacancy of that coach whose class has not started and whose approval_status is `pending` becomes `not_required`, in the same commit as the mode, and its pending prompt becomes `stale` (with `decided_at`), so its message's buttons answer "stale" and decide nothing. The sweep (`process_invitation_batches`) then starts these spots on its next tick, under the same restrictions, claim and per-class automatic-invitations switch as any spot. A `dismissed` vacancy stays dismissed: the coach already said no to it. The sweep heals itself: it treats an open `pending` vacancy whose coach's mode is now `automatic` the same way (released, prompt stale, started on that tick), so spots stranded before this rule recover with no data repair. Switching `automatic` → `semi_automatic` changes nothing for spots already open: `not_required` spots keep inviting, and only spots opened afterwards wait for approval. The release keys on the mode alone: a semi-automatic coach who turns automatic notifications off keeps the spots pending, and they stay decidable when notifications come back on.
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
   decision on it stays a no-op (`stale`). One `before_flush` listener on the vacancy's status
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

#### Prompt created on reminder decline
- **Given** a coach with auto_notify_enabled=true and invitation_mode="semi_automatic"
- **When** player Alice declines a reminder for instance 10
- **Then** a Vacancy is created with approval_status "pending" and no invitations are sent
- **And** a replacement approval prompt for the vacancy is delivered as a message in the coach's Assistant conversation, showing Alice as the decliner and the full ordered invite queue (all eligible candidates across all rounds/groups, in invite order)

#### Bundled card on presence confirmation
- **Given** semi-automatic mode and a class instance with players Alice and Bob
- **When** the coach confirms presences marking both Alice and Bob absent
- **Then** two Vacancies are created with approval_status "pending"
- **And** the frontend shows ONE inline approval card bundling both vacancies with their full ordered invite queues
- **And** the same bundled prompt is persisted in the Assistant conversation
- **And** one decision on the card applies to both vacancies

#### A never-filled spot says so, a freed spot names the student (rule 4, PAD-574)
- **Given** semi-automatic mode and a class of 4 with Alice and Bob enrolled, so two spots were never filled
- **When** the coach marks Alice absent and the prompt is built
- **Then** the bundle has three vacancies: Alice's with `openSpot: false` and her name, and two with `openSpot: true`, `declinedPlayerName` null and each one's `side`
- **And** on web and iOS Alice's block reads "A Alice não vai. Convites para a vaga libertada" and the open spots read "Vaga por preencher. Convites sugeridos"
- **And** the persisted Assistant text says "Open spot." for them and "Spot freed by Alice." for hers

#### An empty queue tells the coach why (rule 4b, PAD-661)
- **Given** semi-automatic mode, a class of 2 with one roster student enrolled, one free roster
  student on the coach's excluded list (`restrictions.excludedPlayers`), and the never-filled place
  inside its invitation window
- **When** the tick opens the place and the prompt is built
- **Then** the bundle has one vacancy with `openSpot: true`, `queue: []` and
  `emptyQueueReasons: [{"stage": "excluded_by_coach", "count": 1}]`
- **And** on web and iOS the block shows the empty state followed by "1 excluído pelo treinador" /
  "1 excluded by the coach"; a vacancy with a non-empty queue carries no `emptyQueueReasons`

#### Identical open-spot lists are one block, freed spots never are (rule 7a)
- **Given** a bundle with 8 open spots: 3 left-side spots with list A, 5 right-side spots with list B, and Bob's freed spot with list A
- **When** the card renders, on web and iOS
- **Then** it shows three blocks: "3 vagas · prioridade esquerda" over list A, "5 vagas · prioridade direita" over list B, and Bob's own block over list A
- **And** approving sends vacancy by vacancy, as before (nine vacancies, one request)

#### Long lists show five with "Ver mais" and say approval invites everyone (rule 7a)
- **Given** a block whose list holds 31 students
- **When** the card renders
- **Then** it shows the first 5, "Ver mais (26)" and "A mostrar 5 de 31 · ao aprovar, são convidados todos"
- **And** "Ver mais" shows all 31 and the line goes; "Ver menos" folds it back
- **And** a list of 5 or fewer shows neither the button nor the line

#### Prompt on scheduler invite-start path
- **Given** semi-automatic mode and the `invite_start` job firing for an instance with an unconfirmed spot
- **When** the job creates a vacancy
- **Then** the vacancy gets approval_status "pending", no invitations are sent, and a prompt is delivered in the Assistant conversation

#### Coach schedules approval for the invitation window
- **Given** a pending prompt whose invitation window (per invitation_start_timing) has not yet opened
- **Then** the prompt offers **"Yes, right now"**, **"Yes, at {window open time}"** (label showing the concrete window-open datetime), and **"No"**
- **When** the coach responds **"Yes, at {window open time}"**
- **Then** the vacancy becomes approval_status "approved"
- **And** invitations are sent when the invitation window opens, with eligibility recomputed at send time using the same rules (no one outside the shown list is invited unless their eligibility changed)

#### Coach approves immediately
- **Given** a pending prompt whose invitation window has not yet opened
- **When** the coach responds **"Yes, right now"**
- **Then** the vacancy becomes approval_status "approved"
- **And** invitations are sent right away, bypassing the invitation window

#### Window already open: reduced button set
- **Given** a pending prompt whose invitation window is already open
- **Then** the prompt offers only **"Yes, right now"** and **"No"** (the scheduled option is not shown)
- **When** the coach responds **"Yes, right now"**
- **Then** invitations are sent right away

#### Coach dismisses
- **Given** a pending prompt for a vacancy
- **When** the coach responds **"No"**
- **Then** the vacancy gets approval_status "dismissed" but Vacancy.status remains "open"
- **And** the engine never sends invitations for it (batch processor and scheduler skip it)
- **And** the coach can still send manual notifications for the instance
- **And** the prompt cannot be re-approved afterwards

#### Ignored suggestions are recomputed from the class (rule 12)
- **Given** a dismissed vacancy, and a student added to the roster since the first list
- **When** the coach presses "Sugestão de convites automáticos"
- **Then** the vacancy is "pending" again, a new bundle whose queue includes the new student is
  posted to the Assistant conversation, and no invitation is sent

#### An old message's yes after a recompute does nothing and says so (rule 12)
- **Given** a recompute has replaced bundle A with bundle B
- **When** the coach presses "Sim, agora mesmo" on bundle A's message
- **Then** every vacancy answers "stale", nothing is sent, and the vacancy stays "pending"; a yes on
  bundle B sends

#### The class shows every pending prompt, oldest spot first (rule 12, PAD-765)
- **Given** semi-automatic mode and a class where case 7 declined on 14 Oct and case 8 on 21 Oct,
  each prompt in its own bundle, neither answered
- **When** the coach opens the class (web or iOS)
- **Then** the class shows two approval cards, case 7's bundle first, then case 8's

#### The list is the class as it is now (rule 12b, PAD-765)
- **Given** a pending prompt whose stored queue lists case 9
- **When** the coach adds case 9 to the class and opens it
- **Then** case 9 is not in the queue the class view shows

#### A spot filled by an accepted join request resolves its prompt (rule 11, PAD-765)
- **Given** the two pending prompts above
- **When** the coach accepts case 9's request to join and it fills case 7's spot
- **Then** that prompt is `stale` in the same commit, its Assistant message marks the spot
  `resolved: "filled"` and shows no buttons, and the class shows only case 8's card
- **And** the same holds when the spot fills by the coach adding a student, or expires

#### The tick resolves prompts the listener never saw (rule 11, PAD-780)
- **Given** a prompt still pending on a vacancy already filled and another on one already expired,
  written without the listener firing
- **When** the invitation tick runs
- **Then** both prompts are stale and their messages mark the spots resolved filled/expired; a
  pending prompt on an open spot and a decided prompt on a closed spot are untouched

#### A student who joined leaves the suggestions, live (rule 12b, PAD-770)
- **Given** a class with two spots awaiting approval, and case 13 in the suggested queue
- **When** the coach accepts case 13's request to join while the class is open on web or iOS
- **Then** without reopening the class, the card of the spot case 13 took is gone, case 13 is in
  no queue, and one spot is left

#### A student who declined is not suggested again (rule 12b, PAD-770)
- **Given** case 10 answered "no" to an invitation for this class
- **When** the coach opens the class
- **Then** case 10 is in no suggested queue

#### An old list approved from the message invites only who is eligible now (rules 5, 12b, PAD-770)
- **Given** the Assistant message's list, built at 20:41, still names case 13 (joined since) and
  case 10 (declined since), and reads "Fila às 20:41"
- **When** the coach presses "Sim, agora mesmo" on it
- **Then** neither is invited, and only spots still open send; a closed one answers "stale"

#### Batch processor skips unapproved vacancies
- **Given** vacancies with approval_status "pending" and "dismissed" of a coach still in semi_automatic
- **When** `process_invitation_batches()` runs
- **Then** no NotificationEvents or invitation messages are created for those vacancies

#### Switching to automatic releases the spots awaiting approval (rule 1a, PAD-766)
- **Given** a semi-automatic coach's class tomorrow with one open vacancy pending approval, its prompt pending and nobody invited
- **When** the coach saves `invitationMode: "automatic"`
- **Then** the vacancy is `not_required` and its prompt `stale` in the same commit as the mode, and the next `process_invitation_batches()` sends the spot's first batch (3 invitations at maxSimultaneous 3)

#### The sweep starts a spot stranded by an earlier switch (rule 1a, PAD-766)
- **Given** the same pending vacancy and prompt, and the coach's mode set to `automatic` with nothing else changed (a switch made before rule 1a)
- **When** `process_invitation_batches()` runs
- **Then** the vacancy is `not_required`, its prompt `stale`, and the spot's first batch is sent on that tick

#### A dismissed spot stays dismissed (rule 1a, PAD-766)
- **Given** the same vacancy dismissed by the coach (vacancy and prompt `dismissed`)
- **When** the coach saves `invitationMode: "automatic"` and `process_invitation_batches()` runs
- **Then** the vacancy and its prompt stay `dismissed` and nobody is invited

#### One prompt per vacancy
- **Given** a vacancy that already has a replacement approval prompt
- **When** invitations are triggered again for the same vacancy
- **Then** no second prompt is created

#### Automatic mode unchanged
- **Given** a coach with invitation_mode="automatic" (default)
- **When** a vacancy is created on any path
- **Then** it gets approval_status "not_required", no prompt is created, and invitations are sent exactly as before

#### The waiting list heads the prompt's queue (PAD-446)
- **Given** semi-automatic mode and a vacancy for which player Carol is on the class's waiting list
- **When** the replacement approval prompt is created
- **Then** Carol is first in the queue, marked `fromWaitingList: true`, and `waiting_list_player_id` is null

#### The waiting list waits for approval (PAD-446)
- **Given** semi-automatic mode, a pending vacancy, and a player with an active standing waiting-list entry
- **When** the engine processes the vacancy
- **Then** nobody is invited or enrolled, the waiting-list student included
- **And** after the coach approves, the waiting-list student is invited first
