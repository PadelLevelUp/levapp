---
id: evaluations.coach-evaluates-a-player
status: draft
implemented_by:
  - ../../specs/evaluations/categories.spec.md
  - ../../specs/evaluations/entries.spec.md
  - ../../specs/evaluations/player-view.spec.md
  - ../../specs/evaluations/bulk-import.spec.md
  - ../../specs/evaluations/legacy-client-contract.spec.md
  - ../../specs/evaluations/competencies.spec.md
  - ../../specs/evaluations/records.spec.md
  - ../../specs/evaluations/class-panel.spec.md
  - ../../specs/evaluations/history.spec.md
  - ../../specs/evaluations/evolution.spec.md
  - ../../specs/evaluations/reminders.spec.md
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
  - derives_from: archive/documents/sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md
---

# Coach Evaluates A Player

## Outcome

A coach keeps a picture of how each of their players is developing: they choose what they score
players on, record scores over time, and look back at them — including scores brought in through
a bulk data import.

**Status note (2026-09-21).** This outcome is `draft` because it now carries the planned
evaluation system from the owner's "Sistema de Avaliações" canvas next to what ships. "Today"
below is in production; "Planned" is specified and not built.

## Who This Is For

Coaches. **Players are not an audience of this outcome: today a player sees no evaluation
anywhere.** Showing a player anything is a separate, deliberate act with its own outcomes (a
coach shares an evaluation; a student sees their evaluations).

## User Journey

Today:

1. The coach sets up their own evaluation categories, each with a name and a scoring scale
   (for example 1–10), in Settings.
2. From a player's page, the coach scores the player in any of those categories. Only the
   categories the coach actually scored are saved.
3. The player's page shows the coach the latest score in each category. There is no chart and no
   history view, although every past score is kept.
4. When importing player data in bulk, past evaluation scores come in with everything else,
   linked to the right player and category, with their original dates.

Planned:

5. The coach picks their competencies from a built-in catalogue of 17 in three groups, switched
   on and off, plus their own; the categories they already had stay exactly as they were.
6. In a class, the coach opens "Avaliações", works down the participants and rates each on
   stars, with a private note if they want. Whatever they tap is saved as they tap it; nothing
   has to be filled in.
7. Away from a class, the coach does the same from the player's page ("Nova avaliação").
8. Everything rated for one player on one occasion is one evaluation: one day, one optional
   class, one note.
9. The player's page says when the last evaluation was; "Avaliações" opens every past evaluation,
   newest first, and, per competency, how it has moved month by month with monthly, half-yearly
   and yearly averages.
10. The coach chooses how often to be reminded to evaluate, and the app marks the players who are
    due. It never messages anyone. *(Pending owner decision Q4.)*

## Business Rules

Today:

- Evaluation categories belong to the coach who created them, each with its own scoring scale.
  A coach never has two with the same name.
- A player can be scored in a category more than once over time; the player's page shows the
  latest score per category.
- The scale is kept by the app's controls only. The server does not check it, so an imported or
  hand-crafted score outside the scale can exist and is shown as it is.
- A player's record holds only scores a coach actually gave. Saving records the categories the
  coach scored and nothing for the ones left alone, and a coach can decline to score a category.
  A category without a score shows as not rated, never as a number (PAD-337).
- Deleting a category deletes its scores, after the coach has seen how many and typed its name.
- Bulk-imported evaluations are created the same way as ones entered by hand — same entities,
  same rules.

Planned:

- Catalogue competencies are switched on and off, never deleted; switching one off keeps its
  history. The coach's own can be renamed and deleted with today's warning.
- New competencies are rated on five whole stars. Categories a coach already had keep their scale
  and their numbers; nothing existing is converted, deleted or re-dated.
  *(Pending owner decision Q1.)*
- An evaluation is identified by the player, the class occurrence (or none) and the day. The same
  day in the same class is the same evaluation; another class, or none, is another one.
- A rating can be taken back. An evaluation can be corrected on the day it was made; afterwards
  it can be deleted, not edited.
- On the new screens a rating outside its scale is refused.
- The private note is the coach's. It reaches a player only if the coach puts it in a share.
- Averages, trends and "due" are worked out in one place, so web and phone always agree.
- Coaches still on an App Store version from before this redesign keep working unchanged: they
  see and score only the categories they already had, and nothing they do can put a score into a
  competency they were never shown.
- Strengths and weaknesses keep working; they leave the web evaluation form only once another
  place to edit them on web is proven to exist.
- Does the at-a-glance list of latest scores leave the player's page? *(Pending owner decision
  Q7; default: yes, as in the canvas.)*

## Success Metrics

Not yet measured. Candidates: share of a coach's active players evaluated in the last 30 days;
evaluations recorded from a class versus from a player's page.

## Out of Scope

The general player-data import flow itself, beyond evaluation entries (`import` domain). Showing
anything to a player (the two sharing outcomes). Dark mode (web already has a theme selector; iOS
dark mode is not this project). Converting existing scores to stars (a later, coach-triggered
step, if the owner wants it — Q1).

## Notes

- The previous version said the coach "(and the player)" sees the scores "and a chart", and that
  "a recorded score must fall within its category's defined scale". None of the three was ever
  built: every evaluation endpoint is coach-only, no chart exists on either client, and the
  server checks no range. They were corrected on 2026-09-21 from a static read of production
  code, not silently kept.
- OPEN: owner questions Q1, Q4 and Q7 (`open-questions.md` in the canvas's archive entry).
