---
path: backend/padel_app/tests/test_coach_invitation.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 440
size_tokens: 3616
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0eaa3b6219322971545b7d4983915e1ada2361fc20e0b2b032c1aa06c74c47b7"
---

## Purpose

Covers the `clubs.coach-invitation` feature end-to-end: creation,
resolution (public), acceptance (as a brand-new user or as an existing
coach), expiry, revocation, and listing. Pins: creation requires club
membership (403 for non-members) and defaults to a 7-day expiry
(`create_coach_invitation_service` with injected `now=`); resolving a
token is public and returns the club name, but expired (410, and flips
the row's status to "expired" as a side effect) or revoked (410) tokens
are rejected, unknown tokens 404; acceptance as a new user creates an
active coach + password hash + club association and returns an access
token, is rejected 400 for missing fields, 409 for a duplicate username
(leaving the invitation still "pending"), 410 if already accepted or
expired; acceptance as an existing coach (with auth) only creates the
club association (no new `User` row) and is a no-op if already a member;
revocation requires membership (403 otherwise), 404 for unknown tokens,
410 if already accepted; listing invitations for a club returns only
"pending" ones (excludes accepted/revoked) and requires membership; and
`GET /api/app/coach` includes the coach's club (id+name) or `None`.

## Connections

- Uses: models `User`, `Coach`, `Club`, `Association_CoachClub`,
  `CoachInvitation`; `padel_app.services.club_service`
  (`create_coach_invitation_service`); `flask_jwt_extended.create_access_token`.
- Used by: (none — leaf test file)
- Semantically related (not imports): shares the invitation-token
  lifecycle pattern (pending/accepted/revoked/expired, 410 on terminal
  states) conceptually with the player-invitation flow covered outside
  this scope in `test_player_invitation.py`.
