---
id: B-267
title: "A student could start a conversation with any active coach, linked or not"
type: wrong-rule
severity: high
status: triaged
affects:
  - backend/padel_app/services/messaging_service.py
  - .specflow/specs/messaging/conversations.spec.md
  - .specflow/specs/messaging/direct-by-username.spec.md
proposed_fix: "Scope the student side of messaging.conversations rule 7 to linked coaches (roster, shared club, shared class); the picker and the 403 guard both follow; the clients show the refusal."
opened: 2026-10-02T16:59:56Z
---

# B-267: a student's messageable set was every active coach

**Source:** PAD-483, reported by a tester on Discord (2026-10-02): a new student's "new message"
screen listed coaches the student had never met, including the App Review account.

**What happened:** `GET /api/app/messageable-users` returned every active coach to a student, and
`POST /api/app/conversation` with `otherParticipants` accepted any of them. A read-only production
count (coordinator, 2026-10-02 16:56Z) found 7 unlinked coach–student 1:1 conversations out of 192:
4 opened by the student with a typed first message (all to one coach), 3 created and left empty.

**What should happen:** a student's picker lists, and the server lets them start a conversation
with, only coaches they are linked to. Anyone stays reachable by exact username
(messaging.direct-by-username), which is the deliberate route to a new contact.

**Evidence (Phase 1):** `backend/padel_app/tests/test_pad483_student_coach_scope.py` against
unmodified `origin/staging` 4a77b1134: 3 failed, 8 passed. The picker returned all five coaches
including the unlinked one (`assert 2 not in {2, 3, 4, 5, 6}`), and starting a conversation with
the unlinked coach was not refused. Root cause read in `_messageable_target_ids_for`
(messaging_service.py:48-79): the student branch is `Coach.query … status == "active"`.

**Root cause:** the code implemented messaging.conversations rule 7 faithfully, and the rule was
wrong: "everyone else is a student and may start a conversation with any active coach". It also
contradicted messaging.direct-by-username rule 7 ("the picker lists only … a student's coaches").
Type 3 (wrong rule), with drift between two developer specs.

**Affected specs:**
- Dev: `.specflow/specs/messaging/conversations.spec.md` rule 7; `.specflow/specs/messaging/direct-by-username.spec.md` rule 7
- Business: `.specflow/specs-business/messaging/user-and-coach-message-in-real-time.business.md` (unchanged: it never promised open access to coaches)

### Change Plan

**Change rule 7 from:** "…Everyone else is a student and may start a conversation with any active coach."
**To:** "…A student may start a conversation with any active coach they are linked to: the coach has
them on their roster (`coach_in_player`), they share a club (`coach_in_club` × `player_in_club`),
or the coach teaches a class they are in (`coach_in_lesson` × `player_in_lesson`, or
`coach_in_lesson_instance` × `presences`)."

Unchanged: rule 8 (sending inside an existing conversation), the exact-username path, automatic
messages (`_send_system_message` and the direct `Message(` writers never consult the scope; every
student-initiated automatic flow already requires the roster row).

Clients: the picker path on web (`MessagesPage.handleNewConversation`) and iOS
(`conversation/new.tsx`) swallowed a refusal silently; both now show `messages.cannotMessageUser`.
Old iOS builds (1.0–1.2.1) list whatever the server returns, so unlinked coaches simply disappear
from their picker; a stale row tapped after the fix is a silent no-op there.

### Resolution

(filled in when the PR lands)
