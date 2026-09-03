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
- **ReplacementApprovalPrompt**: coach_id, vacancy_id (unique — one prompt per vacancy), declined player info, full ordered invite queue (all eligible candidates across all rounds/groups, in invite order, at prompt-creation time), waiting-list disclosure (if a standing waiting-list match exists), status (pending|approved|dismissed), bundle reference (groups prompts created by a single presence confirmation), created_at, decided_at
- **Assistant conversation**: a system conversation between the platform assistant and the coach (new concept — today conversations exist only between users). One per coach; reuses the existing conversation/message machinery (SSE delivery, push notifications, unread counts). Approval prompts are delivered as messages with coach action buttons
- **Vacancy.approval_status** (defined in notifications.invitations): not_required | pending | approved | dismissed

### Rules
1. Applies only when `auto_notify_enabled` is true and `invitation_mode` is `semi_automatic`; in automatic mode vacancies get approval_status "not_required" and behavior is completely unchanged
2. In semi-automatic mode, every vacancy-creation path sets approval_status "pending" and creates a replacement approval prompt instead of sending invitations: player declines via reminder response, coach confirms presences marking players absent, and the `invite_start` scheduler job
3. One prompt per vacancy (idempotent): re-triggering invitations for a vacancy that already has a prompt does not create a duplicate
4. The prompt shows which student(s) declined and the FULL ordered invite queue — all eligible candidates across all rounds/groups, in the exact order the engine would invite them, computed at prompt-creation time. Exactness principle: the list shown to the coach is exactly the set of players who may receive invitations — the engine may never invite anyone not on the shown list. Eligibility is recomputed at send time using the same rules, which may shrink or reorder the list; a player who wasn't shown may be invited only because their eligibility changed between prompt creation and send time
5. If a standing waiting-list match exists for the vacancy, the prompt discloses it explicitly (e.g. "Player X from the waiting list will be added directly to the class"), since waiting-list fills place the player without an invitation
6. Every prompt is persisted as a message in the coach's Assistant conversation — the source of truth — regardless of which surface triggered it
7. Presence-confirmation surface: when confirming presences creates N vacancies, the frontend immediately shows one inline approval card bundling all N vacancies (declined players + invite queues concatenated). One decision applies to the whole bundle; the same bundle is also persisted in the Assistant conversation
8. Coach actions (three):
   - **"Yes, right now"** → approval_status "approved" and invitations are sent right away, bypassing the invitation window
   - **"Yes, at {window open time}"** → approval_status "approved"; invitations are sent when the invitation window opens (per `invitation_start_timing`). The button label shows the concrete window-open datetime
   - **"No"** → approval_status "dismissed"; the prompt is closed. The vacancy REMAINS OPEN (Vacancy.status unchanged) but the engine never sends invitations for it; the coach can still use the manual invitation flow (notifications.manual). Dismissal is terminal — the prompt cannot be re-approved
   When the invitation window is already open, only **"Yes, right now"** and **"No"** are offered (the scheduled option is meaningless)
9. Gating: `process_invitation_batches()` and the `invite_start` scheduler job skip vacancies with approval_status "pending" or "dismissed"; only "not_required" and "approved" vacancies are processed
10. Waiting-list auto-fill is also gated: in semi-automatic mode, standing waiting-list fills (`_check_waiting_list()`) do not run for a vacancy until it is approved, since they add a player without coach consent. Dismissed vacancies are never auto-filled from the waiting list
11. If a vacancy is filled or expired before the coach decides (e.g. via the manual flow), the pending prompt becomes stale and any decision on it is a no-op

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

#### Waiting-list match disclosed in prompt
- **Given** semi-automatic mode and a vacancy for which player Carol has a standing waiting-list match
- **When** the replacement approval prompt is created
- **Then** the prompt explicitly discloses the match (e.g. "Carol from the waiting list will be added directly to the class")

#### Waiting-list fill waits for approval
- **Given** semi-automatic mode, a pending vacancy, and a player with an active standing waiting-list entry
- **When** the engine processes the vacancy
- **Then** the standing entry does NOT auto-fill the spot
- **And** after the coach approves, the waiting-list fill proceeds normally
