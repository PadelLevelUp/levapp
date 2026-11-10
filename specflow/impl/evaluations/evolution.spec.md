---
id: evaluations.evolution
status: implemented
depends_on: [evaluations.records, evaluations.history]
serves: [P-EVALUATIONS-1]
governed_by: [R-048]
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
---

# evaluations.evolution

### Intent
How one competency has moved for one player over the months: a monthly-average line, three
rolling means and a delta since the first month. It is the "Evolução" section of the player's
evaluations drawer (`evaluations.history` rule 3). No chart, average or delta exists today.

### Entities
- **READS:** EvaluationEntry (the rows of the coach–player link and competency **that sit in a
  record** — build default Q29: what is averaged is exactly what the history cards show; a
  record-less row is read by nothing here), EvaluationCategory (scale), Association_CoachPlayer.
- **WRITES:** nothing.

### Rules
1. **One instrument: the server computes every figure** — monthly means, rolling means, delta —
   and web and iOS only render them, so the two shells cannot disagree. (Compass rule
   R-048.)
2. **The read.** `GET /api/app/player/<playerId>/evaluations/evolution?categoryId=<id>` (JWT,
   coach) → `{scaleMin, scaleMax, series: [{month: "2026-01", mean}], means: {m1, m6, m12},
   delta: {value, sinceMonth} | null}`. Every figure is a JSON number (or null), never a formatted
   string. Roster miss → 404; no coach profile → 403; a `categoryId` that is not the coach's →
   403; a missing `categoryId` → 400. A competency with no entry for this player answers
   `series: []`, all three means null, `delta: null`.
3. **(AV-033) One competency at a time.** Filter pills, one per id in
   `competenciesWithData` (`evaluations.history` rule 1) — every competency the player has data
   for, switched-off ones included (AV-023), in that order. A competency without data has no pill.
4. **(AV-036) The default is the first competency that has data**, resolved each time the
   section opens for a player. With no data at all the section is a single empty state — "Ainda
   sem avaliações registadas para consultar evolução." — and no pills. (The canvas defaults to
   `bandeja`, never resets it between players and puts the pills inside the has-data card, so a
   player with data but no Bandeja gets the empty state with no way out — mock defect.)
5. **(AV-033) The series is monthly means.** Every figure in this leaf is computed over the
   competency's ratings **that sit in a record** (Q29). One point per calendar month that holds
   at least one such rating; `mean` is the arithmetic mean of that month's ratings. A rating's
   month is the month of its local day (`evaluations.records` rule 3). A month with no rating is
   **absent** — never zero — and the line connects across the gap.
6. **(AV-034) Three rolling means** — `m1`, `m6`, `m12`: the mean of the **raw ratings** (not of
   the monthly points) whose local day is inside the window; null when the window holds none,
   rendered "—". **(build default Q32) They are labelled by their WINDOW**, under one small
   heading: "Médias" — "Último mês", "Últimos 6 meses", "Último ano" (en: "Averages" — "Last
   month", "Last 6 months", "Last year"); the canvas's "Média mensal / semestral / anual" is
   overruled. Why: the chart's points are calendar-month means, and the first real rendering read
   "Set: 7.0" on the chart with "Média mensal: 6.5" under it — both correct, and a contradiction
   to a coach. The arithmetic and the API keys `m1` / `m6` / `m12` are unchanged; the words are
   the owner's own (the share flow already says "Últimos 6 meses" and "Último ano"), and it is
   "Último mês", not "30 dias", because rule 7's window is calendar arithmetic.
7. **(AV-074) A window is whole local days.** It runs from `today − N months` (calendar
   arithmetic, day of month clamped: 31 Mar − 1 month = 28 or 29 Feb) to today, both inclusive,
   on the club-zone calendar. The time of day plays no part, so the same call returns the same
   figures all day. (The canvas cuts at *now* including the time of day — mock defect.)
8. **(AV-035, build default Q13) The delta** needs two or more monthly points: `value` = the last
   monthly mean minus the first, `sinceMonth` = the first point's month; otherwise `delta` is
   null and nothing is rendered. Rendering: above zero "↑ +1.5 desde Jan" in the positive (green)
   treatment; below zero "↓ -0.5 desde Jan" in the **neutral** treatment; zero prints "=" in the
   neutral treatment — never "↑ +0", never green for everything (both canvas mock defects).
9. **(AV-074) One rounding rule.** Every figure is rounded half-up to one decimal by the server
   (decimal arithmetic, not binary float rounding); the delta is the difference of the two
   *rounded* monthly means. The shells render every figure with exactly one decimal ("3.0",
   "+1.5"). The canvas mixes "3" and "4.0" on one screen.
10. **Each competency charts on its current scale.** The y-axis runs from the competency's current
    `scaleMin` to `scaleMax`; a score given on an earlier scale is placed on it by proportion, on
    the server (`evaluations.scale` rule 5, R-048). A legacy category charts on its own scale.
    No stored score is rescaled.
11. **(AV-074) The chart states its values.** Dots on the points, month labels in the active
    locale ("Jan"…), the scale's bounds on the y-axis, and the value of a point on hover (web) or
    tap (iOS). The year is added to the month labels once the series spans two calendar years.
    A single point draws one dot, no line and no delta. Each shell uses the chart library it
    already ships. Same ticket for web and iOS (build default Q23).
12. **(build default Q33) The section keeps its shape while the evaluation form is open** —
    `evaluations.history` rule 11 is the statement; here it means the pills and the selected
    competency's figures are held (`useHeldWhile`) and released when the form closes. Choosing
    another pill still works while held.

### Acceptance Criteria

Dataset (the canvas's seed): coach Ana's player João Silva (id 9), competency Bandeja (id 12,
1–5), rated 2 on 2026-01-08, 3 on 2026-01-22, 3 on 2026-03-05, 3 on 2026-03-19, 3 on 2026-06-04,
4 on 2026-06-18 and 4 on 2026-09-21. "Today" is 2026-09-21.

#### EVALUATIONS-EVOLUTION-1: Monthly means, rolling means and delta (rules 5–9)
- **When** Ana calls `GET /api/app/player/9/evaluations/evolution?categoryId=12`
- **Then** `series` is `[{"month": "2026-01", "mean": 2.5}, {"month": "2026-03", "mean": 3.0},
  {"month": "2026-06", "mean": 3.5}, {"month": "2026-09", "mean": 4.0}]`
- **And** `means` is `{"m1": 4.0, "m6": 3.7, "m12": 3.1}` — `m6` is (3+4+4)/3 because 2026-03-19
  is before the 2026-03-21 cutoff; `m12` is 22/7
- **And** `delta` is `{"value": 1.5, "sinceMonth": "2026-01"}`, rendered as up, in green, since
  January; `scaleMin` is 1 and `scaleMax` 5

#### EVALUATIONS-EVOLUTION-2: The boundary day is inside the window, and the hour does not matter (rule 7)
- **Given** the same data plus a Bandeja 5 dated 2026-03-21
- **When** the endpoint is called at 00:05 and again at 23:55 local time on 2026-09-21
- **Then** both answers have `m6` = 4.0 ((5+3+4+4)/4)

#### EVALUATIONS-EVOLUTION-3: A zero delta reads "=" and is neutral (rule 8)
- **Given** Técnica rated 4 in January 2026 and 4 in September 2026
- **Then** `delta` is `{"value": 0.0, "sinceMonth": "2026-01"}` and both shells render "=" in the
  neutral treatment (`data-testid` `evolution-delta`, `data-trend="flat"`)

#### EVALUATIONS-EVOLUTION-4: A falling delta is neutral, not green (rule 8)
- **Given** Tática monthly means 3.5 in January and 3.0 in September
- **Then** `delta.value` is −0.5 and the shells render it with `data-trend="down"` in the neutral
  treatment

#### EVALUATIONS-EVOLUTION-5: One point draws no delta (rules 8, 11)
- **Given** a player with exactly one Bandeja rating, in September
- **Then** `series` has one item, `delta` is null, one dot is drawn and no delta is rendered

#### EVALUATIONS-EVOLUTION-6: The default pill is the first competency with data (rule 4)
- **Given** Rui has ratings only in Consistência, and Sara only in Técnica
- **When** Ana opens Rui's drawer, then Sara's
- **Then** Consistência is selected for Rui and Técnica for Sara; neither sees the empty state

#### EVALUATIONS-EVOLUTION-7: No data is one empty state and no pills (rule 4)
- **Given** player Tiago with no rating from Ana
- **Then** `competenciesWithData` is `[]` and the section shows only the empty state
  (`data-testid` `evolution-empty`)

#### EVALUATIONS-EVOLUTION-8: A competency charts on its own scale (rule 10)
- **Given** Ana on the 1–10 scale (`evaluations.scale`) and her competency Bandeja with 7 in January and 9 in September
- **Then** `scaleMin` / `scaleMax` are 1 and 10, the means are 7.0 and 9.0, `delta.value` is 2.0,
  and nothing is drawn on 1–5

#### EVALUATIONS-EVOLUTION-9: A record-less row does NOT count (Entities; Q29, R-048 point 3; corrected on PAD-375's review)
- **Given** the backfill left Forehand 7 (2026-03-02 10:15) with `record_id` NULL beside
  Forehand 8 (2026-03-02 18:40) in the day's record
- **Then** March's mean for Forehand is 8.0 — the record-less row is read by nothing here
  (the server joins entries to records; `test_pad375_history_seed.py` pins that record-less
  rows are shown nowhere)

#### EVALUATIONS-EVOLUTION-10: A rating's month is the club's month, and a half rounds up (rules 5, 9)
- **Given** ratings of 2 at 23:30 UTC on 31 July, which is 1 August in Lisbon, and of 3, 2 and 2 on three days of August
- **When** the evolution is read
- **Then** the series is one point, August, with mean 2.3: the late rating counts in August, and 2.25 rounds up
- **And** a mean is shown with its one decimal ("4.0", "3.7"), and a dash when there is none
test: `backend/padel_app/tests/test_pad364_evolution_and_class_api.py` › `test_a_month_is_the_clubs_month_and_a_half_rounds_up` (+1 more)

#### EVALUATIONS-EVOLUTION-11: The evolution of a category that is not the coach's own is refused (rule 2)
- **Given** a coach, one of their players, and another coach's category
- **When** the coach asks for that player's evolution with that category's id
- **Then** the answer is 403
- **And** a `categoryId` that is missing or not a number answers 400
test: `backend/padel_app/tests/test_pad364_evolution_and_class_api.py` › `test_evolution_needs_a_category_of_the_coachs_own`

#### EVALUATIONS-EVOLUTION-12: The section follows the chosen pill, and holds still while the evaluation form is open (rules 3, 12)
- **Given** the evolution section with two competencies that have data
- **When** the coach presses the second pill
- **Then** the server is asked for that competency and its pill is the pressed one
- **Given** the evaluation form open
- **When** the server's figures change, or a competency gains its first data
- **Then** the section keeps the pills and figures it had; another pill can still be chosen and shows its own figures
- **And** when the form closes, the section shows the server's latest
- **And** a section that had nothing loaded when the form opened still shows its first load
test: `frontend/apps/web/src/components/evaluations/EvaluationEvolution.test.tsx` › `switching the pill asks the server for that competency` (+8 more)

#### EVALUATIONS-EVOLUTION-13: The chart states its values without hover (rules 6, 11)
- **Given** a series from January to September
- **When** the section renders
- **Then** a table beside the chart lists each month with its mean
- **And** the month labels are the short month in the active language, with the year once the series spans two calendar years
- **And** the three means sit under their heading, each named by its window
- **And** on iOS the tapped month's point is the one shown, and the last point when none is tapped or the tapped month has left the series
test: `frontend/apps/web/src/components/evaluations/EvaluationEvolution.test.tsx` › `every value is reachable without hover: a table of the series sits beside the picture` (+6 more)

### Runs cited for `implemented` (PAD-375, #359)
- Web, Playwright `evaluation-tools/evaluation-evolution.spec.ts`, `~/levapp-wt-j`, `--workers=1`, isolated DB and ports: **1 passed** at
  `b10db81cf`, 2026-09-22 09:49:52–09:51:39 UTC (and at `5df49f51c`, 00:04:14–00:04:37 UTC).
- The full E2E suite with the history seed ON, which this slice turns on (four serial shards, `--workers=1`), at `b10db81cf`, 2026-09-22:
  shard 1 09:51:47–10:15:43 UTC **110 passed** (five tail timeouts at load 346 — a starved run; each of the five passed alone, seed ON,
  12:44:39–12:45:59 UTC); shard 2 10:32:23–10:45:03 **118 passed**, 1 skipped; shard 3 12:31:25–12:38:11 **113 passed**, 1 skipped;
  shard 4 12:38:21–12:42:49 **111 passed** — **452 passed, 2 skipped**; `coach-working-hours` green now that staging carries #367
  (PAD-392, surfaced by this chain's new i18n namespace, fixed at the source there); the `E2E Eval Yesterday Class` fixture reddened
  nothing. (At `5df49f51c` earlier that day: 453 passed, every red run through the seed-ON / seed-OFF / origin/staging cells.)
- iOS, Maestro on the iPhone 17 Pro simulator (Session-D): `79-evaluation-evolution` **PASSED** at `3b9e05d4b`, 2026-09-21 21:26:56–21:28:07
  UTC (the chart, the three means, the delta, a point tap and its caption); `57-evaluation-untouched-categories` **PASSED** at `7798a3046`
  and `3b9e05d4b` — the layout-hold fix measured by the flow's own clear tap with no settle wait.
- Looked at: the chart on iOS (Session-D's screenshot, 2026-09-21 — one duplicate arrow found and removed) and on web in light and dark
  (Session-E, 2026-09-22 ~07:58 UTC, against the design tokens).
- Unit at `5df49f51c`: `npm test` web 245, packages 531, mobile 538 (2026-09-21 21:48:54–21:49:07 UTC); at `b10db81cf`: config 12, hooks 6,
  web evaluation components 46, both `tsc` clean.

### Notes
- No seed today produces past-dated history except the import. Tests need a seed helper writing
  dated records, every date derived from `e2e/scripts/seed_dates.py` and a pinned "today" —
  never the wall clock.
- Criteria quote Portuguese copy for the reader; tests locate by test id and `ui()`.
