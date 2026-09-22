---
id: R-048
title: "Evaluation figures are computed by the server only; web and iOS render them"
source:
  - ../../archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
governs:
  - "backend/padel_app/services/evaluation_api_service.py"
  - "frontend/apps/web/src/**/evaluations/**"
  - "frontend/apps/mobile/src/features/evaluations/**"
  - "frontend/packages/**/evaluation*"
check:
  kind: grep
  pattern: "reduce\\(|Math\\.round|toFixed\\(|differenceIn|subMonths"
confidence: EXTRACTED
status: active
---

# R-048 — Evaluation figures are computed by the server only; web and iOS render them

Number from Session-B's reserved range, confirmed by the Coordinator (2026-09-21), who also read the wording.

The owner's canvas computes its figures in the page, and gets them wrong in ways two clients
would each get wrong differently: monthly points and deltas rounded with `Math.round(x*10)/10`
("3", "+1") next to period means printed with `toFixed(1)` ("4.0") on one screen; a period cutoff
at *now including the time of day*, so the same player shows different averages at 09:00 and at
18:00; `setMonth` arithmetic that rolls over at month ends; a delta that is always green
(`requirements.md` AV-035, AV-074). LevApp ships a web client and an iOS client written
separately; a figure each computes is a figure on which they can disagree, and nobody would see
it until a coach compared a phone with a laptop.

1. **One function per figure, on the server.** Monthly means, the three rolling means (1, 6, 12
   months), the delta since the first month, "latest" per competency, the reminder's "due", and
   the per-competency deltas on a shared card are each computed by one server function and
   served as **JSON numbers** (or null) — never as formatted strings, never as raw rows for the
   client to reduce. Spec: `evaluations.evolution` (rules 1, 5–9), `evaluations.sharing` rule 5,
   `evaluations.reminders` rule 3.
2. **A client renders; it does not average, round, window or diff.** No mean, sum-and-divide,
   rounding, month arithmetic or subtraction of two ratings in web or iOS evaluation code.
   Formatting a number the server sent — one decimal, a sign, a locale month name, a colour by
   sign — is rendering. If a screen needs a figure the API does not send, the change is to the
   API, in the same ticket, for both clients.
3. **One definition of each input.**
   - *Which ratings count:* entries that sit in a record (`record_id IS NOT NULL`). A record-less
     entry — a same-day score a later one superseded — is read by nothing, so what is averaged is
     exactly what the history cards show (build default Q29).
   - *Rolling means are means of the ratings in the window*, not means of the monthly means.
     (With the reference dataset the two differ: 3.1 against 3.3 for twelve months.)
   - *One clock, named at its source.* "The day" everywhere in evaluations — the day a record is
     filed under, "editable on its day", "today" in a rolling window, the month a rating belongs
     to — is the calendar date on **`CLUB_TZ`, the constant in `backend/padel_app/utils/dates.py`
     (`ZoneInfo("Europe/Lisbon")`, R-023's wall clock, the zone class times use)**, applied to
     the naive-UTC instant. No per-coach or per-club zone is stored today; if one ever is, all
     of these move to it together, in one change. Never the server's UTC date, never a client's
     device date.
   - *A window is whole days on that clock*, from `today − N months` (day of month clamped:
     31 March − 1 month = 28 or 29 February) to today, both inclusive; the time of day plays no
     part, so the same call returns the same figures all day.
   - *"Latest"* is the greatest `(evaluated_at, id)`.
   - *Rounding* is half-up to one decimal, in decimal arithmetic, once, on the server; a delta is
     the difference of the two **rounded** monthly means.
4. **The legacy reads are outside this rule and stay as they are.** `current_evaluations` and
   `GET /api/app/player_profile/<id>` serve the App Store builds and are governed by R-047; they
   keep their own tie order and do not use these functions.
5. **Proof is a fixed dataset with a pinned "today", asserted on the server and only rendered in
   the clients.** Reference dataset, "today" pinned to **2026-09-21**, one competency rated:
   2 on 2026-01-08, 3 on 2026-01-22, 3 on 2026-03-05, 3 on 2026-03-19, 3 on 2026-06-04,
   4 on 2026-06-18, 4 on 2026-09-21. Monthly means 2.5, 3.0, 3.5, 4.0; delta 4.0 − 2.5 = +1.5.
   One month runs from 2026-08-21 → {4} → **4.0**; six months from 2026-03-21 → {3, 4, 4} =
   3.67 → **3.7** (the 03-19 rating falls outside by two days — that boundary is the point of
   the case); twelve months from 2025-09-21 → all seven, 22/7 = 3.14 → **3.1**. The mean of the
   four monthly means would be 3.25 → 3.3: the wrong instrument. Second case, for the rounding
   rule: a month rated 2, 2, 3 (2.33 → 2.3) and a later month rated 3, 4, 4 (3.67 → 3.7) →
   delta **+1.4**, the difference of the two points the coach sees, not +1.3 from the raw
   means. Server tests: `backend/padel_app/tests/test_pad364_evolution_and_class_api.py`. Client tests assert the rendering
   of a known response — never the arithmetic again, because a client test that re-derives a
   figure is a second instrument. Fixtures derive every date from the pinned instant, never from
   the wall clock (a rolling window is exactly where a wall-clock fixture fails by the hour).
6. **The check is a prompt, not a verdict.** The grep flags arithmetic idioms in the governed
   client folders; a hit is reviewed — summing a list of stars to draw them is not a figure; a
   mean of `ratings` is.
