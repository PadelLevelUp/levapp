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
2. In semi-automatic mode, every vacancy-creation path sets approval_status "pending" and creates a replacement approval prompt instead of sending invitations: player declines via reminder response, coach confirms presences marking players absent, and the `invite_start` scheduler job
3. One prompt per vacancy (idempotent): re-triggering invitations for a vacancy that already has a prompt does not create a duplicate
4. **The prompt says why each spot is open (PAD-574, B-521).** A spot a student freed reads "O
   {{nome}} não vai. Convites para a vaga libertada" / "{{name}} isn't coming. Invitations for the
   freed spot"; a spot the class never filled (a structural vacancy, `original_player_id` NULL)
   reads "Vaga por preencher. Convites sugeridos" / "Open spot. Suggested invitations" — never a
   student's name, never "confirmou que não vai comparecer". The payload says which with
   `openSpot` and carries the vacancy's `side`; the persisted Assistant text (rule 6) makes the
   same split ("Open spot." / "Spot freed by {name}."). The prompt shows the FULL ordered invite queue — all eligible candidates across all rounds/groups, in the exact order the engine would invite them, computed at prompt-creation time. Exactness principle: the list shown to the coach is exactly the set of players who may receive invitations — the engine may never invite anyone not on the shown list. Eligibility is recomputed at send time using the same rules, which may shrink or reorder the list; a player who wasn't shown may be invited only because their eligibility changed between prompt creation and send time
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
11. If a vacancy is filled or expired before the coach decides (e.g. via the manual flow), the pending prompt becomes stale and any decision on it is a no-op
12. **Recomputing the suggestions from the class (PAD-545, PAD-542; coordinator, 2026-10-07; numbering unconfirmed).**
   The class view reads the class's suggestion state (`GET /api/app/notify/approval/instance/<id>`,
   the class's coach only): `pending` with the newest pending bundle, `dismissed` when the coach
   ignored them, or `none`. With `dismissed` it shows a **"Sugestão de convites automáticos"** button
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

#### Batch processor skips unapproved vacancies
- **Given** vacancies with approval_status "pending" and "dismissed"
- **When** `process_invitation_batches()` runs
- **Then** no NotificationEvents or invitation messages are created for those vacancies

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
