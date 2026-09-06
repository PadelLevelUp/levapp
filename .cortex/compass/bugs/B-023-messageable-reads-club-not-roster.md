---
id: B-023
title: "A coach cannot message a player on their own roster — the messageable set reads club membership, which no app path ever writes"
type: incomplete-rule
severity: high
status: resolved
affects:
  - backend/padel_app/services/messaging_service.py
  - messaging.conversations
  - messaging.user-and-coach-message-in-real-time
related_specs:
  - ../../../.specflow/specs/messaging/conversations.spec.md
  - ../../../.specflow/specs-business/messaging/user-and-coach-message-in-real-time.business.md
proposed_fix: "The coach's messageable set becomes the union of their roster (`coach_in_player`) and the players of their clubs (`player_in_club`); the student branch is unchanged."
opened: 2026-09-06T17:40:00Z
resolved: 2026-09-06T18:20:00Z
---

# B-023 — The coach messageable set reads club membership, which no app path ever writes

**Source:** the 2026-09-02 data-model audit
(`.cortex/archive/documents/data-model-audit-2026-09-02/extracted/findings.md`, §6 "smaller
duplications": roster and club membership are never reconciled), filed as PAD-205.

**What happens:** `_messageable_target_ids_for(coach)`
(`backend/padel_app/services/messaging_service.py`) builds the coach's messageable set from
`{player for club in coach.clubs for player in club.players}` — i.e. from `player_in_club`. A
coach's "new conversation" picker therefore lists only club-linked players, and
`_assert_messageable` answers **403** on `POST /api/app/conversation` for everyone else.

**What should happen:** a coach can message any student they added through the app.

**Root cause.** `player_in_club` is a seed-only table. Grep over `backend/` for
`Association_PlayerClub` (2026-09-06, `staging`):

```
backend/padel_app/seed/mock_data.py:765   db.session.add(Association_PlayerClub(...))   # the only write
backend/padel_app/tests/test_messaging_report_block_scope.py:65-66                      # test fixtures
backend/padel_app/models/…                                                              # declarations only
```

Every in-app path that attaches a player to a coach — `player_service`, `import_service`,
`player_invitation_service`, `coach_service`, `invite_simulation_service` — writes
`Association_CoachPlayer` (`coach_in_player`) and nothing else. So the messaging graph is keyed
off a table the product never populates, and only seed-linked players are reachable.

**Reproduced** 2026-09-06 on `feature/pad-205-messageable-roster` with a coach in club A, one
player carrying a roster row and no club row (the in-app shape) and one carrying a club row and no
roster row (the seed shape):

```
assert 2 in {3}          # GET /api/app/messageable-users omits the roster player
assert 403 == 201        # POST /api/app/conversation with the roster player
```

**Diagnostic tree.** `messaging.conversations` exists and governs conversation creation (node 1 →
YES). Its Rules 1–6 cover `participant_key`, dedup, `is_group`, `last_read_at` and the two
endpoints — **no rule states who a coach may start a conversation with at all** (node 2 → NO).
Type 2, incomplete rule. The scope was only ever expressed in code, which is why the code's choice
of table was never reviewed against how the app actually stores a roster.

**Drift check.** The business spec's outcome ("A coach and a student can talk directly inside the
app") was never wrong — it simply never said *which* students, so the dev layer's narrower answer
went unnoticed. Not Type 6; the business spec gains the rule in plain words rather than being
corrected.

**Affected specs:**
- Dev: `.specflow/specs/messaging/conversations.spec.md`
- Business: `.specflow/specs-business/messaging/user-and-coach-message-in-real-time.business.md`

### Change Plan

**Spec to modify:** `.specflow/specs/messaging/conversations.spec.md`
**Change type:** add rule + acceptance criteria

**Add this rule:**

> 12. A coach may start a conversation with any player on their roster (`coach_in_player`) or in
>     any club they belong to — the union is the coach's messageable set. Any other user is a
>     student and may start a conversation with any active coach.

**Add these criteria:**

```
#### Coach messages a player they added in the app
- **Given** coach C added player P through the app (a `coach_in_player` row, no `player_in_club` row)
- **When** C lists messageable users or POSTs a conversation with P
- **Then** P is listed and the conversation is created

#### Coach cannot message an unrelated player
- **Given** player Q is on neither C's roster nor in any of C's clubs
- **When** C POSTs a conversation with Q
- **Then** the request is rejected with 403
```

**Business spec:** add to Business Rules — "A coach can always message any student on their
roster, and any student in a club they coach at; nobody else."

**Then:**
1. Commit the spec deltas on their own.
2. `backend/padel_app/tests/test_messaging_roster_scope.py` — roster-only player is messageable,
   conversation succeeds, unrelated player is still 403, club players do not regress, payload
   shape unchanged.
3. Confirm the tests fail, then widen `_messageable_target_ids_for` to the union.
4. Full backend regression; Playwright spec for the coach-side picker.

**Explicitly out of scope.** Do NOT start writing `player_in_club` when a player is created. The
audit's position is that the roster is the record and the club is a label on lessons; reconciling
the two tables is a separate decision. This ticket teaches the reader (messaging) to read the
table the writer actually fills.

**Not verifiable from here:** the audit asks for a prod comparison of `player_in_club` vs
`coach_in_player` counts for one coach. No prod access from this environment — the grep above is
the standing evidence.

### Resolution

**Resolved 2026-09-06 (PAD-205).** `_messageable_target_ids_for` returns the union of
`coach.players` (roster) and the players of `coach.clubs`, skipping any player row without a
`user_id`. The student branch is untouched, `_assert_messageable` is still reached only from
`create_conversation_service` (so rule 8 holds), and no `player_in_club` write was added
anywhere — the reader was taught to read the table the writer fills, not the other way round.

- Spec changes: `messaging.conversations` rules 7–8 + three criteria;
  `messaging.user-and-coach-message-in-real-time` business rule.
- Tests added: `backend/padel_app/tests/test_messaging_roster_scope.py` (6 cases — two failed
  before the fix: `assert 2 in {3}`, `assert 403 == 201`);
  `frontend/apps/web/e2e/messaging/messageable-roster.spec.ts` (US-205, **unrun** — the shared
  `levelup_test` DB was in use by another session).
- Code changes: `backend/padel_app/services/messaging_service.py` only. No migration.
- Regression: 838 backend tests pass.
