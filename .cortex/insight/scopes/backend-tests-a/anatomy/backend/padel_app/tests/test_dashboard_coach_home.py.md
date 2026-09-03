---
path: backend/padel_app/tests/test_dashboard_coach_home.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 252
size_tokens: 2255
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6e99c749e299b5a33df55677ca4fe5605cc9aa2f9aeec2e7e25a309fdba90921"
---

## Purpose

Coach-home dashboard redesign blocks: hero (next class), "needs you"
queue, next-7-days schedule, and week pulse. `_seed` builds one coach, 4
coached players, a soon class (45 min out, 2/6 filled — both hero and an
empty-seats queue item), a full tomorrow class, and a past class with one
unvalidated attendance. Pins: the hero is the soonest class with its
roster and `minutesUntil`/`isToday`; the hero's imminence chip
(`minutesUntil`) is null once further than a 2-hour threshold out — the
field doubles as the "should the chip show" switch; the hero block is
OMITTED ENTIRELY (not an empty placeholder) when nothing is scheduled;
`build_needs_you_block` orders items empty-seats -> validation and its
top-level `count` matches `len(items)`, and reaches a genuine `{count: 0,
items: []}` when nothing is outstanding (not a placeholder); the schedule
block's `totalCount` counts only upcoming classes (excludes the past one)
while `items` may ship fewer rows than the total; and the week-pulse block
reports `players` (active/total/idle) and `seatsFilled`
(total/pct/deltaPct/trend of 7), with `deltaPct` null (not "+0%") and
pct/filled/total all zero when there's no prior week or no classes to
compare against.

## Connections

- Uses: `padel_app.helpers.dashboard.coach_home`
  (`build_next_class_block`, `build_needs_you_block`,
  `build_schedule_block`, `build_week_pulse_block`); `padel_app.tests.helpers.make_coach`
  for the "nothing scheduled" cases; models `User`, `Coach`, `Player`,
  `Club`, `Lesson`, `LessonInstance`, `Presence`,
  `Association_CoachLesson`, `Association_CoachPlayer`,
  `Association_PlayerLessonInstance`, `Association_CoachClub`.
- Used by: (none — leaf test file)
- Semantically related (not imports): shares the coach-dashboard domain
  and "denominator must ship alongside every metric" convention with
  `test_dashboard_pending_confirmations.py` (`padel_app.helpers.dashboard.pending`).
