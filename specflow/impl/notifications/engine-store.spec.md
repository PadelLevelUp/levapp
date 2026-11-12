---
id: notifications.engine-store
status: draft
depends_on: [notifications.engine-planning, notifications.engine-answers]
serves: [P-NOTIFICATIONS-8]
governed_by: []
---

# notifications.engine-store

### Intent
What the new engine's table-backed store guarantees when it writes the engine's effects and sends its
messages (PAD-916; swap plan §5). The engine decides; the store makes each decision land exactly once.

### Entities
- **READS:** the engine's effects (`invitation_engine/effects.py`).
- **WRITES:** `EngineEffect` (one row per effect applied), `EngineInvitation`, the app's presences and
  messages through the outbox (`padel_app/services/engine_store.py`, `dispatch`).

### Rules
1. **An effect is written once.** Each effect has a content key; applying the same effect again, as a
   retried apply does, writes nothing more.
2. **The outbox sends each message once.** The effects that reach a person (`Invited`, `Message`,
   `AttendanceRequested`, `CoachAlert`, `ApprovalRequest`) become outbox rows in the unit that applies
   them. `dispatch` claims rows and commits the claim before it sends, so a row is sent at most once;
   an effect that reaches nobody (an `Answered`) is no outbox row.
3. **The store refuses what the engine forbids.** A second invitation for one student and session
   (`notifications.engine-planning` rule 2), a second waiting-list entry (`notifications.engine-answers`
   rule 12) and a second placement at the same hour (`notifications.engine-answers` rule 10) are
   refused; their criteria are in those specs.

### Not this spec
- Which sessions the store lists and how it builds the settings (`notifications.config` rules 18, 19).
- The locks a unit takes (`notifications.engine-answers` rule 10).

### Today
- The engine's in-memory store is `invitation_engine/store.py` (`MemoryStore`, `apply`, `unit`); the
  table-backed store and its outbox are PAD-916's (`padel_app/services/engine_store.py`, on H's branch,
  not yet on staging), pinned by `backend/padel_app/tests/test_pad916_engine_store.py`. The old engine
  has no outbox: it sends inside its own transactions (`notification_service.py`).

### Acceptance Criteria

#### NOTIFICATIONS-ENGINE-STORE-1: An effect applied twice is written once (rule 1)
Given an `Invited` and an `AttendanceRequested` applied in one unit, when the same two effects are
applied again in a new unit, then there is one invitation and two effect rows.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_an_effect_applied_twice_is_written_once`

#### NOTIFICATIONS-ENGINE-STORE-2: The outbox sends each message once (rule 2)
Given two `Invited`, one `Message` and one `Answered` applied, when `dispatch` runs twice, then the first
run sends three rows (the two invitations and the message), the second sends none, and the `Answered`
is never sent.
test: `backend/padel_app/tests/test_pad916_engine_store.py` › `test_the_outbox_sends_each_message_once`

### Waves
1. (PAD-916) STORE-1, STORE-2 — `padel_app/services/engine_store.py` (content keys, the outbox,
   `dispatch`); `ApprovalRequest` joins the outbox with `notifications.engine-planning` wave 6.

### Open questions
- None.
