---
id: clubs.membership
status: implemented
depends_on: [clubs.crud]
implements: ../../specs-business/clubs/coach-runs-a-club-and-its-team.business.md
governed_by: []
---

# clubs.membership


### Intent
Manage which coaches and players belong to a club.

### Rules
1. Players are added to a club when created by a coach in that club, or when they redeem that
   coach's join token (`players.join-token`)
2. Coaches join a club through `coach_in_club` association
3. All lesson, player, and calendar operations are scoped to the coach's current club

### Notes
- Club membership is implicit for players — there's no explicit "join club" endpoint for players.
  Players are associated when a coach adds them, or when they redeem a coach's join token, which
  carries the coach's club.
- Coaches join a club explicitly via `clubs.coach-invitation` (member acts first) or
  `clubs.join-request` (newcomer acts first), or implicitly by creating it (`clubs.crud`,
  `auth.register`).
