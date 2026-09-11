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
3. If a student stops training with this coach, the coach disconnects from them. The confirmation
   says what goes with the link: this coach's notes and evaluations of the student.
4. Disconnecting only ends this coach's relationship with them — the student's account, their
   attendance and level history, and any relationship they have with other coaches are untouched.
5. A player who never activated and never set a password (a placeholder, with no account) can be
   deleted outright instead. That is the only delete a coach has.

## Business Rules

- Only the coach associated with a player may edit or remove that player.
- Editing a player's level always produces a level-history entry — there's no way to change a level
  quietly, off the record.
- A coach can never delete a student who has an account. Taking such a student off the roster is a
  disconnect: it deletes the coach-student association and that coach's own notes and evaluations
  only; the account, attendance and level history always survive, and can still belong to other
  coaches. There is no exception for a student's only coach.
- A coach may delete a placeholder (never activated, no password), and only if no other coach has it.
- Every disconnect and every delete is recorded: who did it, to whom, and what went with it.

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
