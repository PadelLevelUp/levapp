---
id: evaluations.player-view
status: implemented
depends_on: [evaluations.entries]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: []
---

# evaluations.player-view


### Superseded (PAD-374)
The card and the add-evaluation sheet this leaf describes were replaced on web and iOS by
`evaluations.history` (the "Avaliação" card, the "Avaliações — {nome}" drawer / pushed screen and
the record form). The at-a-glance score list left the profile, following the owner's canvas; whether
it returns is an open owner question (Q7) — web keeps `PlayerEvaluations.tsx` unmounted with the
restoring line written in `PlayerDetailPage.tsx`. What is still true below: `GET /player_profile`
keeps serving `evaluations[]` for legacy categories (`evaluations.legacy-client-contract`), and
strengths and weaknesses live in the profile card (`players.notes` rule 5). This tree's status
enum has no "deprecated"; the leaf is kept for the contract it records and is not to be built from.

### Intent
Show a player's current scores on the coach's player detail page, and let the coach add an
evaluation from there. Coach-only: the player sees nothing.

### Entities
- **READS:** EvaluationEntry (latest per category), EvaluationCategory, CoachPlayerNote.

### Rules
1. The evaluation card lives on the coach's player detail page and nowhere else. `GET
   /api/app/player_profile/<player_id>` requires a coach profile (403 otherwise; a player not on
   the roster → 404) and the web route is coach-only. No student screen, route or payload carries
   an evaluation: **the player sees nothing.**
2. The card shows the latest score per category (`evaluations.entries` rule 3). **No chart ships**
   and no history, average or delta is served. Web: a progress bar with "score/max" per category,
   no date. iOS: the category name, the last-evaluated date (`d MMM yyyy`) and a "score/max" badge.
3. A category with no score reads "not rated", never a number (PAD-337).
4. The coach adds an evaluation from the player detail page — the page's only entry point (web
   sheet with a slider per category plus strengths/weaknesses; iOS form with a stepper per
   category, strengths/weaknesses on a separate profile card).

### Superseded by / Planned
Not built. The card becomes "Última avaliação em …" with an "Avaliações" drawer holding the
history and a new form — `evaluations.history` (draft); the chart, averages and delta —
`evaluations.evolution` (draft); anything a player sees — `evaluations.sharing` and
`evaluations.student-view` (draft, owner-pending).

### Acceptance Criteria

#### The card shows the latest score per category
- **Given** coach Ana's player Alice with Forehand (1–10) scored 5, then 7, then 8, and Volley never scored
- **When** Ana opens Alice's player detail page on web and on iOS
- **Then** Forehand shows 8/10 (web: a progress bar; iOS: a badge and the date of the 8) and Volley
  reads "not rated"; no chart is rendered

#### A student cannot read a player profile
- **Given** an authenticated user with a player profile and no coach profile
- **When** they GET `/api/app/player_profile/<any id>`
- **Then** the status is 403
