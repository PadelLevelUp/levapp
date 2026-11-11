---
id: P-LEVELS-1
title: "Coach defines and assigns a skill ladder"
status: implemented
---
# Coach defines and assigns a skill ladder

## Outcome

A coach sets up their own ladder of skill levels and places each player on it. That placement is the shared language of the app: a class's default level, the level on a player's profile, and what the invitation engine uses to match players to open spots.

- Each coach's ladder is their own; there is no shared or global scale.
- Order is explicit: the first level is the strongest, the last the weakest, and the engine relies on it for eligibility.
- A level added without a position goes to the bottom.
- Every level change for a player is kept as history, until the coach removes that rung: its history entries go with it. The same player can hold different levels with different coaches.
- A player's current level is their most recent assignment.
- Removing a rung removes no player: anyone who held it has no level until the coach picks one, and their notes and evaluations stay. Classes and open spots at that level lose the level.

It does not promise who the engine notifies or why, or creating a player.
