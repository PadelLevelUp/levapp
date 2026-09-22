# evaluations

## What this is

Business outcomes for the evaluations domain: a coach scoring players over time, and — planned,
pending the owner — a coach choosing to show a player part of it.

## What it covers

- `evaluations.coach-evaluates-a-player` — draft. What ships today (the coach's own categories,
  scores, the latest-score card on the player's page, bulk import) and the planned coach journey
  from the 2026-09-21 "Sistema de Avaliações" canvas: competencies, evaluating from a class, one
  evaluation per occasion, history, evolution, reminders. It was `implemented` until the planned
  journey joined it; under Policy A an outcome with an open leaf is `draft`.
- `evaluations.coach-shares-an-evaluation` — draft, owner-pending. The coach picks what to show,
  previews it and shares it.
- `evaluations.student-sees-their-evaluations` — draft, owner-pending. The player's side of a
  share.

## Why it's grouped this way

Everything a coach does alone — set up, rate, look back, be reminded — is one journey and one
outcome. Sharing and the student's view are split off because they are a new disclosure with a
different audience, and they are exactly what the owner has not decided: they can be held, changed
or dropped without touching the coach's journey.
