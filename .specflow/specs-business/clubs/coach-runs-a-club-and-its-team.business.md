---
id: clubs.coach-runs-a-club-and-its-team
status: implemented
implemented_by:
  - ../../specs/clubs/crud.spec.md
  - ../../specs/clubs/membership.spec.md
  - ../../specs/clubs/coach-invitation.spec.md
  - ../../specs/clubs/join-request.spec.md
  - ../../specs/clubs/courts.spec.md
---

# Coach runs a club and its team

## Outcome

A coach sets up a club as the home base for their classes, players, and calendar, and can grow that
club into a team by bringing in other coaches. Everything else in the app — lessons, players, the
calendar — hangs off a club, so having one (and being clear about which one is "current") is the
starting point for using LevApp at all.

## Who This Is For

Coaches — the one who first creates a club, any coach who later joins it via an invite link, and a
coach who signs up on their own and asks to join a club that already exists. Players belong to a club
too, but join through a coach's action (being added, or scanning a coach's QR) rather than a club
action of their own.

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
   that club adds them as a player, or the moment they redeem that coach's join QR (see the
   players domain).
7. A coach who signed up on their own and has been approved by the LevApp admin picks an existing
   club instead of creating one, which sends that club a join request. Every current coach of the club sees it under Settings → Club, with the
   requester's name, and approves or declines. Approval makes them a member exactly as an accepted
   invitation would; a decline is final for that request (they can ask again, or create their own
   club).
8. The club's coaches list the club's courts in Settings → Club ("Campo 1", "Campo 2", in the
   order they want them). When scheduling or editing a class, the coach can say which court it is
   on, and everyone sees the club and the court on the class card and its detail.

## Business Rules

- A club needs at least a name to exist; location, description, and logo are optional.
- A club's courts are just names in an order; a class may name one of its club's courts or none, and
  removing a court never removes a class.
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
- Nobody joins an existing club without a current member saying yes — by invitation (member acts
  first) or by approving a join request (newcomer acts first). Both end in the same membership.
- Any club may be found by name when signing up; what a search reveals is the club's name, location
  and logo — never who belongs to it.

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

- Join requests were added by decision 2026-09-06 (`open-registration-and-connections`, item 2):
  self-registering coaches must end up in a club, and letting them join any club by name would
  hand a stranger the club's students (messaging reach is club-scoped).
- OPEN: no push notification for a new join request in v1 — Settings → Club shows a badge.
