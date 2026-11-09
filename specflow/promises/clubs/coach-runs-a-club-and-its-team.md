---
id: P-CLUBS-1
title: "Coach runs a club and its team"
status: implemented
---
# Coach runs a club and its team

## Outcome

A coach sets up a club as the home base for classes, players and calendar, and grows it into a team by bringing in other coaches. Everything else hangs off a club, so having one, and knowing which is current, is where using LevApp starts.

- A club needs a name; location, description and logo are optional.
- A club's courts are names in an order. A class names one of its club's courts or none, and removing a court never removes a class.
- Coaches and players can each belong to several clubs; club scoping keeps one coach's classes, players and calendar apart from another's.
- A coach in several clubs works by default in the one joined most recently.
- Deleting a club deletes its classes; a class always belongs to exactly one club.
- A club invitation is single-use and expires after 7 days; once accepted, revoked or expired, nobody can accept it.
- Only a member of a club can invite someone into it or revoke a pending invitation.
- Accepting again never duplicates membership.
- Nobody joins a club without a current member saying yes, by invitation or by approving a join request; both end in the same membership.
- An approved coach can find any club by name, and sees only its name, location and logo, never who belongs to it.

It does not promise how players join a roster, what a player does inside a club, account creation for an invited coach, or the push and email about a join request and its decision (that is P-NOTIFICATIONS-5; Settings → Club shows a badge).
