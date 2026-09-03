---
path: backend/padel_app/helpers/dashboard/coach_home.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 3
size_lines: 459
size_tokens: 4232
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2529526112cb08a464c2ea836cd842401c8e82ad7f0baac3b058499746b7bf8f"
---

## Purpose

Builds the four blocks of the redesigned coach dashboard, in the fixed priority order the module docstring states: the class about to start (`next_class` hero), a "needs you" action queue, the next 7 days, and two health metrics ("week pulse"). The organizing principle, stated up front, is that every number ships with its denominator — the old bare-count `kpi_grid` was retired because "52 players, 19 classes" says nothing about whether anything needs attention. Two deliberate design choices are called out in the docstring: no court/location on the hero (the `Lesson` model has no such column), and validation counts are scoped to a rolling 7-day window rather than an all-time backlog, so the number can reach zero.

## Main players

- `build_next_class_block(*, coach_id, now=None)` (lines 131-169) — critical. Looks 90 days ahead for the coach's next class; returns `None` (not an empty block) when nothing is scheduled, "because an empty hero would be the largest element on the screen saying nothing." Computes `minutesUntil` only when the class starts today within `HERO_SOON_MINUTES` (120), so the client never has to re-derive the "starting soon" rule itself.
- `build_needs_you_block(*, coach_id, user_id, now=None)` (lines 207-227) — critical. Concatenates three item kinds in a fixed order — empty seats (soonest first), unread-message replies, pending-validation summary — deliberately time-critical-to-whenever-you-like.
- `_empty_seat_items` / `_reply_items` / `_validation_item` (lines 230-316) — critical helpers behind the queue. `_reply_items` dedupes to one item per conversation (most recent unread first) and caps at `QUEUE_REPLY_LIMIT` (3). `_validation_item` counts unvalidated `Presence` rows for classes that ended within `VALIDATION_WINDOW_DAYS` (7) — not all-time — and returns `None` entirely when the count is zero, so the queue only ever contains actionable items.
- `build_schedule_block` (lines 322-354) — critical. Next `SCHEDULE_DAYS` (7) days of classes, capped display of `SCHEDULE_ROWS` (5) with a `totalCount` for "see more".
- `build_week_pulse_block` / `_seats_in_window` / `_player_activity` (lines 360-458) — critical. Computes this-week and previous-week seat-fill percentage (with a 7-point daily trend), plus "active" vs "idle" player counts. `deltaPct` is explicitly `None` rather than `0` when there's no prior week to compare, so the client can omit the delta chip instead of falsely showing "+0%". `_player_activity` defines "active" as attended-recently OR signed-up-to-something-upcoming (union, not either alone) — the docstring explains why: attendance-only would mark a player idle the moment they book ahead but haven't played yet, and signups-only ignores regulars between terms.
- `_load_events` (lines 68-85) — critical shared primitive. Loads and filters a coach's classes into a window using raw `date`/`startTime`/`endTime` string fields, deliberately ignoring the serialized event's computed `status` field — because that status is computed against live `utcnow_naive()` inside the serializer itself, which would silently override any `now` injected for testing and make every time-dependent test in this module a lie.

## Insights

- `_load_events`'s decision to re-derive in-window membership from `date`/`startTime`/`endTime` instead of trusting the serializer's `status` is the load-bearing reason this whole module is testable with an injected `now` — any change that made these functions rely on `status` instead would silently break time-travel tests without an obvious symptom (results would just always reflect the real wall-clock instead of the test's `now`).
- `_roster` (lines 172-201) reads player rosters differently depending on whether the occurrence is materialized: a `LessonInstance` gets its roster from `Association_PlayerLessonInstance`, but an unmaterialized (virtual) occurrence falls back to the parent `Lesson`'s `players_relations` — meaning the hero's avatar stack can show different people before vs. after an occurrence gets materialized, if the coach edited the roster in between (materializing "locks in" the roster it was created with; the template's roster keeps moving until then).
- `HERO_AVATAR_LIMIT = 2` (not 3) is an explicit design constraint documented in-line: at the 28px avatar size with the UI's overlap, a third circle visually covers the second one's initials — so this constant is a design-system fact, not a tunable "just bump it" value.
- `build_week_pulse_block`'s trend array iterates `range(SCHEDULE_DAYS - 1, -1, -1)` to build 7 daily points oldest-first ending today — a reader expecting `range(SCHEDULE_DAYS)` (0..6) would get the same length but the wrong day mapping if they tried to "simplify" it.

## File map

Lines 1-63: module docstring, imports, tunable constants (`HERO_SOON_MINUTES`, `SCHEDULE_DAYS`, `SCHEDULE_ROWS`, `QUEUE_REPLY_LIMIT`, `HERO_AVATAR_LIMIT`, `ACTIVE_PLAYER_DAYS`, `VALIDATION_WINDOW_DAYS`).
Lines 65-125: shared event-loading/formatting primitives (`_load_events`, `_event_start`/`_event_end`/`_combine`, `_class_href`, `_fill`, `_initials`).
Lines 128-201: block 1, the next-class hero (`build_next_class_block`, `_roster`).
Lines 204-316: block 2, the needs-you queue (`build_needs_you_block` and its three item builders).
Lines 319-354: block 3, the 7-day schedule (`build_schedule_block`).
Lines 357-458: block 4, week pulse metrics (`build_week_pulse_block`, `_pct`, `_seats_in_window`, `_player_activity`).

## Connections

- Uses: `padel_app.sql_db.db`; `padel_app.models` (`Association_CoachLesson`, `Association_CoachPlayer`, `Association_PlayerLessonInstance`, `ConversationParticipant`, `Lesson`, `LessonInstance`, `Message`, `Player`, `Presence`, `User`); `padel_app.helpers.calendar_helpers` (same scope: `build_lesson_events`, `load_lessons_for_coach`, `load_lesson_instances_for_coach`); `padel_app.tools.tools._safe_int` (same scope); `padel_app.utils.dates.utcnow_naive` (outside scope); `sqlalchemy` (`func`, `or_` — `or_` imported but not directly used in this file's own filters)
- Used by: `padel_app/helpers/dashboard/coach.py` (same scope): `build_coach_dashboard_blocks` calls all four `build_*_block` functions in the documented priority order

## Query pointers

If you need to change what counts as "needs you", read: `build_needs_you_block` and its three item builders together — they share an ordering contract the frontend queue UI depends on.
If you're debugging why the hero or schedule shows stale/wrong occurrences, read first: `_load_events` and its dependency on `padel_app/helpers/calendar_helpers.py`'s materialization-matching logic, then: this file's own window-filtering in `_load_events`.
If you're changing week-pulse metrics, also read: `_player_activity`'s "attended OR upcoming" definition of active — a naive rewrite to "attended only" or "upcoming only" would change dashboard-visible player-engagement numbers.
