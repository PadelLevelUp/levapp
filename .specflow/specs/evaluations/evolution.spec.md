---
id: evaluations.evolution
status: implementing
depends_on: [evaluations.records, evaluations.history]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
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
6. **(AV-034) Three rolling means** — "Média mensal" (`m1`), "Média semestral" (`m6`), "Média
   anual" (`m12`): the mean of the **raw ratings** (not of the monthly points) whose local day is
   inside the window; null when the window holds none, rendered "—".
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
10. **Each competency charts on its own scale.** **(pending owner decision Q1)** The y-axis runs
    from `scaleMin` to `scaleMax` — 1–5 for a stars competency, 1–10 or 0–10 for a legacy
    category — and nothing is rescaled.
11. **(AV-074) The chart states its values.** Dots on the points, month labels in the active
    locale ("Jan"…), the scale's bounds on the y-axis, and the value of a point on hover (web) or
    tap (iOS). The year is added to the month labels once the series spans two calendar years.
    A single point draws one dot, no line and no delta. Each shell uses the chart library it
    already ships. Same ticket for web and iOS (build default Q23).

### Acceptance Criteria

Dataset (the canvas's seed): coach Ana's player João Silva (id 9), competency Bandeja (id 12,
1–5), rated 2 on 2026-01-08, 3 on 2026-01-22, 3 on 2026-03-05, 3 on 2026-03-19, 3 on 2026-06-04,
4 on 2026-06-18 and 4 on 2026-09-21. "Today" is 2026-09-21.

#### Monthly means, rolling means and delta (rules 5–9)
- **When** Ana calls `GET /api/app/player/9/evaluations/evolution?categoryId=12`
- **Then** `series` is `[{"month": "2026-01", "mean": 2.5}, {"month": "2026-03", "mean": 3.0},
  {"month": "2026-06", "mean": 3.5}, {"month": "2026-09", "mean": 4.0}]`
- **And** `means` is `{"m1": 4.0, "m6": 3.7, "m12": 3.1}` — `m6` is (3+4+4)/3 because 2026-03-19
  is before the 2026-03-21 cutoff; `m12` is 22/7
- **And** `delta` is `{"value": 1.5, "sinceMonth": "2026-01"}`, rendered as up, in green, since
  January; `scaleMin` is 1 and `scaleMax` 5

#### The boundary day is inside the window, and the hour does not matter (rule 7)
- **Given** the same data plus a Bandeja 5 dated 2026-03-21
- **When** the endpoint is called at 00:05 and again at 23:55 local time on 2026-09-21
- **Then** both answers have `m6` = 4.0 ((5+3+4+4)/4)

#### A zero delta reads "=" and is neutral (rule 8)
- **Given** Técnica rated 4 in January 2026 and 4 in September 2026
- **Then** `delta` is `{"value": 0.0, "sinceMonth": "2026-01"}` and both shells render "=" in the
  neutral treatment (`data-testid` `evolution-delta`, `data-trend="flat"`)

#### A falling delta is neutral, not green (rule 8)
- **Given** Tática monthly means 3.5 in January and 3.0 in September
- **Then** `delta.value` is −0.5 and the shells render it with `data-trend="down"` in the neutral
  treatment

#### One point draws no delta (rules 8, 11)
- **Given** a player with exactly one Bandeja rating, in September
- **Then** `series` has one item, `delta` is null, one dot is drawn and no delta is rendered

#### The default pill is the first competency with data (rule 4)
- **Given** Rui has ratings only in Consistência, and Sara only in Técnica
- **When** Ana opens Rui's drawer, then Sara's
- **Then** Consistência is selected for Rui and Técnica for Sara; neither sees the empty state

#### No data is one empty state and no pills (rule 4)
- **Given** player Tiago with no rating from Ana
- **Then** `competenciesWithData` is `[]` and the section shows only the empty state
  (`data-testid` `evolution-empty`)

#### A legacy category charts on its own scale (rule 10)
- **Given** Ana's legacy "Forehand" (0–10) with 7 in January and 9 in September
- **Then** `scaleMin` / `scaleMax` are 0 and 10, the means are 7.0 and 9.0, `delta.value` is 2.0,
  and nothing is rescaled to 1–5

#### A record-less row still counts (Entities, `evaluations.records` rule 13)
- **Given** the backfill left Forehand 7 (2026-03-02 10:15) with `record_id` NULL beside
  Forehand 8 (2026-03-02 18:40) in the day's record
- **Then** March's mean for Forehand is 7.5

### Notes
- No seed today produces past-dated history except the import. Tests need a seed helper writing
  dated records, every date derived from `e2e/scripts/seed_dates.py` and a pinned "today" —
  never the wall clock.
- Criteria quote Portuguese copy for the reader; tests locate by test id and `ui()`.
