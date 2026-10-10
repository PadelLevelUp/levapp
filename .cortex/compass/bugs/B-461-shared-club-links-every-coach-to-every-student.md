---
id: B-461
title: "A shared club linked a student to every coach in it, so a club-wide join list made the picker list coaches the student never met"
type: wrong-rule
severity: high
status: triaged
affects:
  - backend/padel_app/services/messaging_service.py
  - .specflow/specs/messaging/conversations.spec.md
  - .specflow/specs/messaging/direct-by-username.spec.md
  - .specflow/specs-business/messaging/user-and-coach-message-in-real-time.business.md
  - .specflow/specs-business/messaging/student-reaches-out-and-stays-safe.business.md
proposed_fix: "Drop the shared-club arm from messaging.conversations rule 7 on both sides (roster or live class only, symmetric); the picker and the 403 guard follow; a student with no coach gets the connect shortcut on both clients."
opened: 2026-10-09T19:30:00Z
---

# B-461: a shared club was a messaging link, so one club's join link exposed every coach in it

> Ledger id **unconfirmed** (wave-13 range B-461–480 assigned by the coordinator).

**Source:** PAD-568 (owner, 2026-10-09): a student's "new conversation" picker lists every coach
on the platform, not only the coaches they are associated with.

**What happens:** `GET /api/app/messageable-users` for a student returns, besides the coaches on
whose roster they are and whose live classes they attend, every coach of every club the student
is in (`coach_in_club` ⋈ `player_in_club`). `accept_join_token_service` (players.join-token rule 5)
writes the `player_in_club` row for the coach's club on every join, so a student who joined one
coach by link is "linked" to all that club's coaches, and `POST /api/app/conversation` accepts
them. The coach side has the mirror: roster ∪ every player of every club the coach is in.

**What should happen:** a student messages only the coaches on whose roster they are or whose
class that is not yet over they attend; a club is not a link. A student with no coach sees an
empty picker with a "Ligar-me a um treinador" shortcut, not a list.

**Evidence (Phase 1, 2026-10-09, worktree at origin/staging 4757c13d9):**
- The B-267 fix (#514: 16085caee, 220beca5b) is an ancestor of every prod deploy since
  050e41f1b (2026-10-03), including today's ae03093c8 (deploy-prod success 10:34Z). The ticket
  was filed 16:24Z. So the "every active coach" path of B-267 is not what runs.
- `test_pad483_student_coach_scope.py`: 22 passed on 4757c13d9 (SQLite).
- Read on staging and main: both clients call only `/app/messageable-users`; `/app/users` answers
  the same set (PAD-500); `class-requests/coaches` is roster-only. The only arm that can reach a
  coach the student never met is the shared club.
- Ticket filed 2026-10-09 16:24Z; the B-267 fix has been in prod since 050e41f1b on 2026-10-03;
  the observation date is unconfirmed (the coordinator is asking the owner). If the prod counts
  (`docs/plans/pad-568-prod_counts.sql`, read-only aggregates run by the owner) show students
  whose club adds coaches beyond their roster, the club arm is a reproduced leak on main;
  otherwise this is a product decision to narrow the link. This line is rewritten once the counts
  land.

**Root cause:** messaging.conversations rule 7 names a shared club as a link on both sides. For
the student side that arm came in with B-267/PAD-483 (mirroring the coach side, which PAD-205/
B-025 had deliberately kept "so seeded and club-wide links keep working"). A club is where
classes happen, not a relationship: a coach's join link puts every joiner in the club, and the
club's other coaches never chose those students. Type 3, wrong rule.

**Affected specs:**
- Dev: `.specflow/specs/messaging/conversations.spec.md` rule 7 and its B-267 criteria;
  `.specflow/specs/messaging/direct-by-username.spec.md` rule 7 (wording).
- Business: `user-and-coach-message-in-real-time.business.md` ("a student can message any active
  coach" was already stale since B-267; "any student at a club they coach at" goes stale now);
  `student-reaches-out-and-stays-safe.business.md` ("coaches keep today's reach — the players of
  their clubs").
- Untouched on purpose: messaging.block-and-report rule 7 (`isKnownContact`, the "you don't share
  a club" banner) keeps reading club membership; that is a different concept from who may start a
  conversation.

### Change Plan

**Spec to modify:** `.specflow/specs/messaging/conversations.spec.md`, rule 7.
**Change rule 7's student side from:** "…the coach has them on their roster (`coach_in_player`),
they share a club (`coach_in_club` × `player_in_club`), or the coach teaches a class they are in
that is not yet over…"
**To:** "…the coach has them on their roster (`coach_in_player`), or the coach teaches a class
they are in that is not yet over… A shared club is **not** a link (PAD-568, B-461): a coach's
join link puts every joiner in the club, and the club's other coaches never chose them."
**Coach side (coordinator decision, 2026-10-09):** mirrors the student side — roster students ∪
students in a class the coach teaches that is not yet over; the club arm goes. The two sets must
be symmetric, or one side could open a conversation the other could not have started; "live
class" is the only non-roster link the product deliberately keeps. A test proves the two
directions agree.

**Update these criteria:** "A student's picker lists only linked coaches (B-267)" — coach B
(shared club) moves to the absent set; add "A shared club is not a link (PAD-568)"; add "A student
with no coach gets the connect shortcut (PAD-568)".

**Cross-layer check:** both business specs above say the opposite and are updated in the same
change set.

**Then:**
1. Flip `test_pad483_student_coach_scope.py` (`LINKED` loses "club"; new negative test) — red
   first on 4757c13d9.
2. Fix `_linked_coach_user_ids` (drop the `shared_club` query).
3. Clients: web `NewConversationDialog` and iOS `conversation/new` show the connect shortcut
   when a student's raw list is empty (not when every linked coach already has a thread).
4. Regression: messaging tests that build club-only links (`test_messaging_report_block_scope`,
   `test_messaging_roster_scope`, `test_user_privacy`, `test_messaging_known_contact`) are read
   one by one; only the ones asserting a club-only *messaging* link change.

### Resolution

(filled in when the PR lands)
