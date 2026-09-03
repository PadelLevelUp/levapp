---
id: players.add-existing
status: draft
depends_on: [players.create]
implements: ../../specs-business/players/coach-builds-roster.business.md
governed_by: []
---

# players.add-existing


### Intent
Add an already-existing player to a coach's roster (e.g., player already registered with another coach).

### Rules
1. `POST /api/app/coach/player` with player_id
2. Creates a new `coach_in_player` association
3. Player must already exist

### Status correction (2026-08-07)
This capability is **not implemented**, despite having read `implemented` since the tree was written.
No `coach/player` route exists in `padel_app/modules/`, and every path that builds an
`Association_CoachPlayer` creates a brand-new User and Player first. A second coach therefore has no
way to take on an existing student except by creating a duplicate person — and the duplicate-name
warning does not fire across coaches, because it is deliberately scoped to the calling coach's own
roster.

Rules 1–3 above are the intended design and are retained as such. Two open decisions before this is
built:
- **Consent.** Attaching a student to a roster grants that coach their attendance, evaluations and
  direct-message access. The student should approve rather than be assigned.
- **Discovery.** `player_search` is roster-scoped by design; a cross-roster search is a privacy
  widening that needs its own decision.

A coach-scoped join token that the student redeems while authenticated (the QR flow) satisfies both
and is the same backend capability initiated from the other side.
