---
id: players.coach-edits-player-details
status: implemented
implemented_by:
  - ../../specs/players/edit.spec.md
  - ../../specs/players/remove.spec.md
---

# Coach edits player details

## Outcome

A coach keeps a student's roster details current — level, side preference, contact info — as things
change over the season, and can take a student off their roster without losing that person's account
or history if the relationship ends.

## Who This Is For

Coaches maintaining their own roster. Only the coach associated with a given player can edit or remove
that player.

## User Journey

1. The coach opens a player and updates whatever changed: name, email, phone, level, or side
   preference (left, right, or both — "both" meaning the player can fill either side).
2. If the level changed, that change is captured in the player's level history automatically, the same
   as any other level assignment (see `levels.coach-defines-and-assigns-skill-ladder`).
3. If a student stops training with this coach, the coach removes them from their roster.
4. Removing a player only ends this coach's relationship with them — the student's account, and any
   relationship they have with other coaches, is untouched.

## Business Rules

- Only the coach associated with a player may edit or remove that player.
- Editing a player's level always produces a level-history entry — there's no way to change a level
  quietly, off the record.
- Removing a player deletes the coach-student association only; the underlying account and person
  always survive, and can still belong to other coaches.

## Success Metrics

Not yet measured. No dashboard exists for edit frequency or roster churn.

## Out of Scope

- Creating a player in the first place — see [[players.coach-builds-roster]].
- Viewing a player's profile, notes, or full level history — see
  [[players.coach-browses-and-reviews-roster]].
- Changing a player's username — a coach can never do this at all; it's the student's own credential
  (see `auth.newcomer-creates-and-activates-an-account`).

## Notes

None.
