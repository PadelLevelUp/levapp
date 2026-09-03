---
path: backend/padel_app/tests/test_messaging_report_block_scope.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 288
size_tokens: 2674
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b15556eb3ecfa5d77442cf3916b16b07bfab5e261f4260b1a34e242e6178d157"
---

## Purpose

Phase 3 — Report/Block for messaging (Apple guideline 1.2 UGC), plus
conversation scoping and a conversation-access IDOR fix. Scope rule: a
coach may only start a conversation with players in one of the coach's
own clubs; a player/student may message any coach (not other students).
Fixture `scenario`: two clubs A/B, coach1 in club A, player1 in club A
(coach1's roster), player2 in club B (outside it), coach2 unrelated to
any club. Pins: coach1 can message player1 (201) but not player2 (403);
player1 can message any coach including unrelated coach2 (201) but not
another student (403); `/api/app/messageable-users` is scoped
accordingly for both roles. Block/unblock (`POST`/`DELETE
/users/<id>/block`): idempotent to block twice; a block prevents BOTH
starting a new conversation and sending a new message in an EXISTING one
(tested with the block applied by the counterpart, after the conversation
already exists); blocked users are excluded from `messageable-users`;
unblocking restores the ability to message; `blocked-users` lists exactly
the blocked user. Report: a conversation PARTICIPANT can report a message
(creates a `MessageReport` with reason/reporter_id), a non-participant
cannot (403). IDOR fix: `GET /api/app/conversation/<id>` is 403 for a
non-participant, 200 for a participant.

## Connections

- Uses: models `User`, `Coach`, `Player`, `Club`,
  `Association_CoachClub`, `Association_PlayerClub`, `MessageReport`;
  `flask_jwt_extended.create_access_token`.
- Used by: (none — leaf test file)
- Semantically related (not imports): the "student sees/reaches only
  authorized data" scoping principle here parallels
  `test_class_detail_visibility.py`'s role-based visibility and
  `test_frontend_api_authz.py`'s ownership-gated IDOR contract, applied to
  the messaging domain instead of classes/players.
