---
id: levels.coach-defines-and-assigns-skill-ladder
status: implemented
implemented_by:
  - ../../specs/levels/coach-levels.spec.md
  - ../../specs/levels/player-assignment.spec.md
---

# Coach defines and assigns a skill ladder

## Outcome

A coach sets up their own scale of skill levels — however many rungs they want, in whatever order
makes sense to them — and then places each player on that ladder. That placement becomes the shared
language the rest of the app uses: it's what a class's default level means, what a coach sees on a
player's profile, and what the invitation engine uses to match players to open spots at the right
level.

## Who This Is For

Coaches, who each build and maintain their own ladder — there's no shared, app-wide level scale.

## User Journey

1. In Settings, a coach builds their level ladder: a short label (e.g. "Beginner"), a short code
   (e.g. "B1"), ordered from strongest to weakest.
2. The settings page makes the ordering convention explicit — the top row is the strongest level, the
   bottom row is the weakest — so the coach orders the list correctly the first time.
3. The coach can add, edit, reorder, or delete levels at any time; edits are saved as a batch when the
   coach updates the list.
4. When creating or editing a player, the coach picks one of their defined levels from a dropdown; if
   they haven't defined any levels yet, the field tells them so and points them to Settings instead of
   silently showing nothing.
5. Assigning (or changing) a player's level is recorded, so the coach — or the app — can always see
   what level a player held and when it changed.
6. Behind the scenes, that level placement feeds into which vacancies the player gets notified about:
   the app treats a player as eligible for a class one level above or below their current one.

## Business Rules

- Each coach's level ladder is their own — there is no shared or global set of levels across coaches.
- Order matters and is explicit: the first level a coach lists is the strongest, the last is the
  weakest. This isn't just decoration — the notification engine relies on that ordering to decide
  which vacancies a player is eligible for.
- A level added without an explicit position is placed at the bottom of the ladder (the weakest spot),
  never silently treated as the strongest.
- Every level change for a player is kept as history, not just overwritten — so "what level was this
  player at, and when" is always answerable. The same player can hold different levels with different
  coaches.
- A player's current level is always the most recent assignment on record.

## Success Metrics

Not yet measured. No dashboard exists for ladder size, reassignment frequency, or eligibility-match
accuracy.

## Out of Scope

- Everything the level assignment feeds into on the notification/invitation side — who actually gets
  notified about a vacancy and why — belongs to the notifications domain.
- Creating a player in the first place — see the players domain
  (`players.coach-builds-roster`); this outcome only covers the level ladder itself and assigning a
  level once the player exists.

## Notes

None.
