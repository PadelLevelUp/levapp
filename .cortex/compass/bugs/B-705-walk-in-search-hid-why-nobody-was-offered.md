---
id: B-705
title: "The walk-in search said \"no player found\" for a student already in the class, with no word on why"
type: missing-criterion
severity: medium
status: resolved
affects:
  - attendance.validation
  - frontend/packages/config/src/walk-in-options.ts
  - frontend/apps/mobile/src/features/presences/ValidateClassesSheet.tsx
  - frontend/apps/web/src/components/presences/ValidateClassesDialog.tsx
proposed_fix: "Under the existing empty line, the walk-in search names a student already in the class (\"… já está nesta aula\", with Ver to scroll to their row) or says the name is not on the coach's roster (with a link to the players list); one shared helper decides, web and iOS."
opened: 2026-10-29T19:30:00Z
resolved: 2026-10-29T20:15:00Z
---

# B-705: the walk-in search hid why nobody was offered

**Source:** coach 2 on iOS build 34 (1.3.2), 2026-10-29, PAD-787. In Presences → "Aulas por
validar" (week 25–31 Oct), typing one of his own students' full name (case 17) into a class's
add-player search answered "Nenhum jogador encontrado para «…»".

**What happened:** case 17 was already in that class. The prod read at 18:57Z found one account,
active, on coach 2's roster only, with no nickname, and a row in three of coach 2's classes that
week, the reported one included. The picker offers only roster players NOT in the class
(`availableRoster`, rule 8a), so it removed case 17 by design and said only "not found". The coach
later found the row and marked it (18:55Z). The name match was not at fault: the typed name
folds to the stored one (players.search rules 2 and 5).

**What should happen:** the empty line should say why nobody is offered. Rule 8a defined what is
offered, and players.search rule 10 defined the empty line, but no criterion said what the coach
learns when the person they typed is in the class already, or is not theirs (missing criterion).

**Fix:** rule 8b. Under "Nenhum jogador encontrado", both shells now show one of two lines:
- "«name» já está nesta aula." with "Ver", which closes the search and scrolls to that row, tinted
  for 2 s;
- "Não está na tua lista de jogadores." with "Abrir Jogadores".

The shared `walkInEmptyReason` decides which, over the class's players with their roster
nicknames. A student linked to another coach and a removed account look the same to the client,
and both get the second line.

**Evidence:**
- `packages/config/src/walk-in-options.test.ts`: the three outcomes.
- `apps/web/src/components/presences/ValidateClassesDialog.walkin-reason.test.tsx`: three render
  tests (named and scrolled to, not on the roster with the link, nothing while someone is offered).
- `apps/mobile/src/features/presences/walk-in-reason.test.ts`: the picker's inputs and the
  sheet's wiring.
- Maestro flow 313 types the name of a student already in a class on the simulator.
