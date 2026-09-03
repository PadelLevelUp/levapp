---
id: clubs.coach-runs-a-club-and-its-team
status: implemented
implemented_by:
  - ../../specs/clubs/crud.spec.md
  - ../../specs/clubs/membership.spec.md
  - ../../specs/clubs/coach-invitation.spec.md
---

# Coach runs a club and its team

## Outcome

A coach sets up a club as the home base for their classes, players, and calendar, and can grow that
club into a team by bringing in other coaches. Everything else in the app — lessons, players, the
calendar — hangs off a club, so having one (and being clear about which one is "current") is the
starting point for using LevApp at all.

## Who This Is For

Coaches — both the one who first creates a club, and any coach who later joins it via an invite link.
Players belong to a club too, but join implicitly (see User Journey) rather than through an action of
their own.

## User Journey

1. A coach creates a club — name, location, description, and optionally a logo — and is automatically
   a member of it.
2. Everything the coach does afterward (adding players, scheduling classes) happens inside that club's
   scope. If the coach belongs to more than one club, the one they joined most recently is treated as
   their "current" one.
3. To bring on a co-coach, the coach generates a shareable invite link for the club and sends it
   however they like (message, email, in person).
4. Whoever opens the link sees the club's name and an accept form. If they don't have an account yet,
   accepting creates one for them and adds them to the club in one step; if they're already a coach
   elsewhere, accepting just adds them to this club.
5. The inviting coach can see and revoke any invitation that hasn't been used yet.
6. Players never explicitly "join" a club — they become members automatically the moment a coach in
   that club adds them as a player (see the players domain).

## Business Rules

- A club needs at least a name to exist; location, description, and logo are optional.
- A coach can belong to multiple clubs, and a player can too; club scoping is what keeps one coach's
  classes, players, and calendar separate from another's.
- When a coach belongs to several clubs, whichever one they joined most recently is their default
  working context.
- Deleting a club takes its classes with it — a class always belongs to exactly one club and can't be
  orphaned.
- A club invitation is single-use and expires after 7 days; once it's been accepted, revoked, or has
  expired, nobody can accept it again.
- Only a coach who already belongs to a club can invite someone else into it, or revoke a pending
  invitation for it.
- Accepting an invitation never duplicates membership — an already-member coach accepting again is a
  no-op, not a second association.

## Success Metrics

Not yet measured. No club-count, invite-acceptance-rate, or team-size dashboard exists in the
codebase.

## Out of Scope

- How players get added to a club's roster in the first place — that's a player-management action,
  see the players domain (`players.coach-builds-roster`).
- What a player does once inside a club (attending classes, viewing their profile) — covered by other
  domains.
- The generic account-creation/activation mechanics an invite triggers for a brand-new coach — see
  `auth.newcomer-creates-and-activates-an-account`.

## Notes

None.
