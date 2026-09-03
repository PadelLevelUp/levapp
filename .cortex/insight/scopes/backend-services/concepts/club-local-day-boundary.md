---
concept: club-local-day-boundary
---

# Club-local day boundary

**Definition.** The DB stores every datetime naive-UTC, but every
human-facing notion of "a day", "quiet hours", or "wall-clock time a
coach configured" is a CLUB-LOCAL (`CLUB_TZ = Europe/Lisbon`) concept.
Converting between the two naively (e.g. `.replace(hour=0, ...)` on a
naive-UTC instant, or comparing a raw UTC hour against 22/7) silently
pins the boundary to UTC midnight/hours — correct only in Portuguese
winter time (WET = UTC+0) and off by one hour through summer time
(WEST = UTC+1), which is why every bug in this family "looks
intermittent". The fix pattern is always: convert the naive-UTC instant
OUT to `CLUB_TZ`, do the calendar-day/hour arithmetic there, convert
back to naive UTC. `CLUB_TZ` itself was collapsed from three drifting
copies into one definition in the dependency-free leaf module
`utils/dates.py` (PAD-144) specifically so every consumer imports the
same constant with no import-cycle excuse to duplicate it.

**Implementing files:**
- `backend/padel_app/utils/dates.py` — `CLUB_TZ`, `club_day_start_utc`
  (the canonical local-midnight conversion), `to_utc_iso`.
- `backend/padel_app/scheduler.py` — `_compute_timing_dt` (PAD-134: a
  coach's "send at 18:00" setting is a CLUB_TZ wall clock).
- `backend/padel_app/services/notification_service.py` —
  `_check_restrictions` (PAD-136: quiet-hours 22:00–07:00 is club-local),
  `_check_per_student_daily_limit` (PAD-144: "per day" quota boundary is
  the club-local calendar day, via `club_day_start_utc`).
- `backend/padel_app/services/student_availability_service.py` —
  recurring blocker occurrences are expanded/compared in `CLUB_TZ`.

**Related concepts:** [[lazy-instance-materialisation]] (an occurrence's
calendar date is itself a club-local concept), [[invitation-engine]]
(quiet-hours and per-day limits gate every invitation send).
