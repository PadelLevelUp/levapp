---
id: R-023
title: "Event timestamps are naive UTC; class, block and request times are naive Lisbon wall-clock"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
  - ../../atlas/decisions/2026-09-10-class-time-storage.md
governs:
  - "backend/padel_app/**/*.py"
confidence: EXTRACTED
status: active
---

# R-023 — Event timestamps are naive UTC; class, block and request times are naive Lisbon wall-clock

The backend has two clocks. Every comparison must use the one that matches its columns.

- **Event timestamps are naive UTC.** This covers `created_at`, `sent_at`, `decided_at`,
  `expires_at`, `last_activity_at`, `filled_at`, the email and password tokens, and every other
  moment the server records. Write and compare them with `utcnow_naive()`.
- **Scheduling columns are naive Lisbon wall-clock**, exactly the digits the person typed:
  - `lessons`, `lesson_instances`, `calendar_blocks` and `class_requests` — `start_datetime` and
    `end_datetime`;
  - `vacancies.invite_not_before`.

  Compare them with Lisbon "now", which is `club_now_naive()` in `padel_app/utils/dates.py`.
  PAD-256's first implementation PR adds that helper. Never compare them with `utcnow_naive()`.
- **Crossing between the two clocks goes through the `CLUB_TZ` helpers.** Examples: an APScheduler
  `run_date`, a `+00:00` string sent to a client, and a club-local day boundary for event
  timestamps. Localise a wall value with `CLUB_TZ` before converting it to UTC. Never label a
  wall value as UTC (`to_utc_iso` on a class time is wrong).

**Why:** mixing the two clocks produced PAD-134, PAD-136 and PAD-144. It also produced audit
finding C3: every class deadline was one hour late from April to October. On 2026-09-10 the owner
fixed which columns mean what (option B, `2026-09-10-class-time-storage`). The rule was first
extracted from the legacy `RULES.md` (April 2026), which said all datetimes were UTC. That was
never true of class times.
