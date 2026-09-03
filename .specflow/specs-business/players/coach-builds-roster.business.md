---
id: players.coach-builds-roster
status: draft
implemented_by:
  - ../../specs/players/create.spec.md
  - ../../specs/players/duplicate-name-check.spec.md
  - ../../specs/players/add-existing.spec.md
  - ../../specs/players/invite-completion.spec.md
---

# Coach builds their roster

## Outcome

A coach gets new students onto their roster, either by filling in the basics themselves or by handing
the student a link to finish their own profile. Either way, the student ends up with their own
account, and the coach is warned — without being blocked — if a name looks like it might already be on
the roster, so duplicate records are a rare accident rather than a routine one.

## Who This Is For

Coaches adding students to their roster, and the students themselves when they're the ones completing
the invite-link half of the journey.

## User Journey

1. A coach opens "new player" and enters what they know — name, and optionally level, side preference,
   email. They never enter a username; that's the student's own credential to choose later.
2. As they type the name, if it matches a player already on their roster (case-insensitive, exact
   match), a quiet warning appears under the field — but the "Create" button stays enabled, because two
   real students can genuinely share a name.
3. On save, the student gets a real account, associated with the coach and the coach's club, sitting
   inactive until the student sets their own credentials.
4. Instead of (or in addition to) filling in every detail, the coach can create a "pending" player with
   just a name and generate a one-time invite link. The student opens it, chooses their own username
   and password, and fills in the rest — completing their own profile turns the account active and
   signs them in.
5. If the level field is opened and the coach hasn't defined any levels yet, the form says so plainly
   and points them to Settings rather than showing an empty, broken-looking dropdown.
6. (Not yet built) A coach will eventually be able to add a student who's already active with another
   coach onto their own roster too, rather than only ever creating a fresh person.

## Business Rules

- A coach never sets a student's username — not at creation, not afterward. The student picks it
  themselves when they activate or complete their profile.
- A newly created player starts as an inactive account until the student completes it (directly via
  the activation link, or via the invite-completion form).
- Duplicate-name detection is a warning, never a block: it compares names case-insensitively and
  exactly, and always leaves the coach free to proceed.
- An invite link for profile completion is single-use and expires after 7 days, following the same
  pattern as club invitations.
- A username chosen at profile completion must be unique across the whole app; a taken one is
  rejected.
- The level field must always give the coach a clear path forward — either real options to pick from,
  or an explicit nudge to go define some — never a silently empty control.

## Success Metrics

Not yet measured. No roster-growth, duplicate-warning-override-rate, or invite-completion-rate
dashboard exists in the codebase.

## Out of Scope

- Adding an already-existing player to a second coach's roster is not yet built (see the "not yet
  built" journey step above) — open product decisions (consent, cross-roster discovery) are recorded
  on the underlying dev spec, not resolved here.
- Editing a player's details after creation, or removing them from the roster — see
  [[players.coach-edits-player-details]].
- Browsing, searching, or viewing a player once they're on the roster — see
  [[players.coach-browses-and-reviews-roster]].
- The account-activation mechanics themselves (setting a password, flipping inactive→active) — see
  `auth.newcomer-creates-and-activates-an-account`.

## Notes

OPEN: `players.add-existing` is design-only, not implemented — no `coach/player` route exists yet, and
today a second coach has no way to take on an existing student without creating a duplicate person.
The dev spec records two open product decisions (student consent, and whether cross-roster search is
acceptable) that need answers before this ships.
