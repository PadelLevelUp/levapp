---
path: backend/padel_app/services/club_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 176
size_tokens: 1261
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d25cd39e4111eccba9753937964937b060fa2add8cc0be20a8fc15c964c9339e"
---

## Purpose

Club CRUD plus the coach-invitation flow: a club member coach generates
a token-based invitation (`CoachInvitation`, 7-day expiry), which an
existing coach can accept (joins the club via `Association_CoachClub`)
or a brand-new user can accept (registers `User` + `Coach`, seeds
default levels, then joins). Also supports listing and revoking pending
invitations, and lazy-expires an invitation the moment it's fetched past
its `expires_at`.

## Connections

- Uses: `padel_app.models` (`Association_CoachClub`, `Club`, `Coach`,
  `CoachInvitation`, `User`); `padel_app.sql_db.db`;
  `padel_app.tools.request_adapter.JsonRequestAdapter`;
  `werkzeug.security.generate_password_hash`; `services/coach_service.py`
  (`create_default_levels_for_coach`, imported lazily inside
  `accept_coach_invitation_service` to avoid a circular import).
- Used by: club/invitation routes (outside this scope, in the API layer).

## Insights

- `edit_club_service` carries an inline `NOTE:` acknowledging it queries
  `User.query.get_or_404(club_id)` instead of `Club` — preserved
  as-is from earlier code rather than fixed, so `club_id` here is
  actually treated as a `User.id`. Worth confirming with a caller
  before trusting this function's naming.
- Invitation acceptance is a fork on `coach is None`: an existing coach
  only gets an `Association_CoachClub` row created (idempotent — no-op
  if already a member); a brand-new user gets a full `User`+`Coach`
  registration, including the coach's default 3-level ladder via
  `create_default_levels_for_coach` (lazy-imported to dodge a
  `coach_service` ↔ `club_service` circular import).
- Invitations self-expire lazily: `get_coach_invitation_service` flips a
  stale `pending` invitation to `"expired"` the moment it is looked up
  past `expires_at`, rather than via a background job.
