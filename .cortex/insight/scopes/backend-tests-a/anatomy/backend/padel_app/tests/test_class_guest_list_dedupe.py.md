---
path: backend/padel_app/tests/test_class_guest_list_dedupe.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 293
size_tokens: 2498
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "65bccab5590240e55885a0ca4dad48f4993c6ce8f6b1f4bbd8d2fbfa865b1bf5"
---

## Purpose

PAD-72 — the class-detail guest ("invited") list must be keyed by
STUDENT even though the invitation engine legitimately writes one
`NotificationEvent` per invite sent (multi-round matching, manual invite
on top of automatic, re-invite after decline). Spec `calendar.event-detail`
rules 6-9. Pure-logic tests against
`dedupe_invitation_events` (using a minimal `_Event` stand-in) pin: one
row survives per student; first-appearance order is preserved; status
priority when a student has multiple events — an actual response
(confirmed/expired) beats a still-pending "sent"/"queued", confirmed beats
expired, and delivered beats not-yet-delivered — with ties broken by the
most recent (`round_number`) record, not by which id sorts higher; and
empty/single-element lists are handled without error. An end-to-end
DB-backed test (`repeat_invite_scenario`: 4 `NotificationEvent` rows for
Bob, 1 for Alice) confirms the real class-detail endpoint response has no
duplicate `playerId`s and that the surviving row for Bob carries his
actual `status` ("confirmed"), `playerName`, and a real event `id` (so
coach actions like `coach_respond` still resolve against it).

## Connections

- Uses: `padel_app.serializers.lesson.dedupe_invitation_events` (the
  function under test, both in isolation via `_Event` and end-to-end);
  models `User`, `Coach`, `Player`, `Club`, `Association_CoachClub`,
  `Lesson`, `LessonInstance`, `NotificationEvent`,
  `Association_CoachLessonInstance`, `Association_PlayerLessonInstance`;
  `flask_jwt_extended.create_access_token`.
- Used by: (none — leaf test file)
- Semantically related (not imports): the "one row per student despite
  multiple NotificationEvents" invariant complements
  `test_calendar_participant_count.py`'s effective-seat-count invariant —
  both guard against the invitation engine's multi-round writes leaking
  raw row counts into user-facing payloads.
