---
about: "Event timestamps are naive UTC; class, block and request times are naive Lisbon wall-clock"
permanence: changing
verified: "2026-09-10 (told)"
origin:
  - migrated:compass/rules/R-023-utc-in-backend.md@ef7a5f3
aliases:
  - R-023
  - R-023-utc-in-backend
applies_when: "When the agent does work this rule governs: event timestamps are naive UTC; class, block and request times are naive Lisbon wall-clock"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/**/*.py"] }
source: user@2026-09-10
---

# R-023 — Event timestamps are naive UTC; class, block and request times are naive Lisbon wall-clock

The backend has two clocks. Every comparison must use the one that matches its columns.

- **Event timestamps are naive UTC.** This covers `created_at`, `sent_at`, `decided_at`,
  `expires_at`, `last_activity_at`, `filled_at`, `vacancies.invite_not_before` (a moment the
  server computes, not a time anyone typed), the email and password tokens, and every other
  moment the server records. Write and compare them with `utcnow_naive()`.
- **Scheduling columns are naive Lisbon wall-clock**, exactly the digits the person typed:
  - `lessons`, `lesson_instances`, `calendar_blocks` and `class_requests` — `start_datetime` and
    `end_datetime`.

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

<!-- 3.x fields of compass/rules/R-023-utc-in-backend.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
  - ../../atlas/decisions/2026-09-10-class-time-storage.md
confidence: EXTRACTED
status: active
```
