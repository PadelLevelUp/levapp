---
id: decision.2026-09-10-class-time-storage
title: "Draft for the owner: what stored class times mean (Lisbon wall-clock or true UTC)"
date: 2026-09-10T00:00:00Z
compass_rules: []
related_specs:
  - classes.instances
  - calendar.blocks
  - attendance.presence
  - notifications.invitations
supersedes: []
sources: []
---

# Draft for the owner: what stored class times mean

**Status:** a draft from the PAD-256 investigation (Session A, 2026-09-10). It covers audit
finding C3. Nothing changes until the owner chooses. PAD-129 and PAD-130 add more date logic and
wait on this.

## Recommendation

Declare the scheduling columns to be **Lisbon wall-clock** (option B), and fix the "now" side of
every comparison.

- **No data migration.** The data is already stored that way.
- **All 18 defects below get fixed** in about 3 to 4 days, shipped site by site. Each fix comes
  with a summer and a winter test.
- **Switch to option A only if a club outside Lisbon's time zone is expected.** Option A stores
  true UTC and converts at the edges. Spain and the Azores are both in other zones.

## What is stored today

All datetime columns are `timestamp without time zone`.

- **Class, block and request times hold the Lisbon wall-clock time the person typed.**
  - Clients send `date` plus `HH:mm`.
  - `build_datetime` (`tools/calendar_tools.py:87-91`) and the other write paths combine the two
    with no time zone: `services/lesson_service.py:569-576` and `599-600`,
    `calendar_service.py:84-85` and `156-157`, `class_request_service.py:83-91`.
  - The calendar returns the same digits (`calendar_tools.py:93-98`).
- **The rest of the backend assumes naive UTC.**
  - The docstring of `utils/dates.py`.
  - Compass rule R-023, "Backend datetimes are naive UTC".
  - The scheduler (`scheduler.py:92`).
  - Every "now" check, which is `utcnow_naive()`.
- **The effect.** From April to October, a stored 10:00 is treated as 10:00 UTC, which is 11:00 in
  Lisbon. Every "has it started" check and every "start minus N hours" deadline therefore passes
  **one hour late**, and every "minutes until" figure is 60 too high. In winter Lisbon is UTC+0,
  so it is right, and the bug looks intermittent.
- **Weekly recurrences.** They expand with wall values labelled as UTC (`calendar_tools.py:5-16`,
  `58-85`). That keeps a weekly class at the same hour across daylight-saving changes, but only
  because the values really are wall-clock.

### The deciding check (run on the staging copy of prod before choosing)

Take each recurring series with occurrences on both sides of a daylight-saving change. Lisbon went
to UTC+0 on 2025-10-26 and back to UTC+1 on 2026-03-29.
- **Wall-clock storage** keeps one stored hour per series.
- **True UTC** shows two.

```sql
SELECT l.id AS lesson_id,
       count(DISTINCT extract(hour FROM li.start_datetime)) AS distinct_start_hours,
       count(*) FILTER (WHERE li.start_datetime <  '2026-03-29') AS winter_rows,
       count(*) FILTER (WHERE li.start_datetime >= '2026-03-29') AS summer_rows
FROM lessons l JOIN lesson_instances li ON li.lesson_id = l.id
WHERE l.is_recurring
GROUP BY l.id
HAVING count(*) FILTER (WHERE li.start_datetime <  '2026-03-29') > 0
   AND count(*) FILTER (WHERE li.start_datetime >= '2026-03-29') > 0;
```

This investigation could not run it. No local database is a prod copy, and staging is reachable
only on the VM. The query was checked for syntax against a local E2E database.

## Inventory

### Columns that hold wall-clock time a person chose

| Column | Model | Written by |
|---|---|---|
| `lessons.start_datetime`, `end_datetime` | `models/lessons.py:21-22` | `lesson_service.py:599-600` (create), `569-576` (edit) |
| `lesson_instances.start_datetime`, `end_datetime` | `models/lesson_instances.py:25-26` | materialised from the lesson, or edited per occurrence |
| `calendar_blocks.start_datetime`, `end_datetime` | `models/calendar_blocks.py:20-21` | `calendar_service.py:84-85`, `156-157` |
| `class_requests.start_datetime`, `end_datetime` | `models/class_request.py:31-32` | `class_request_service.py:83-91` |
| `vacancies.invite_not_before` (mixed) | `models/vacancy.py:48` | `notification_service.py:2753`: wall time minus N hours for `hours_before`, real UTC for `days_before_at_time` |

Date-only wall values stay dates under either option: `lesson_instances.original_lesson_occurence_date`,
`lessons.recurrence_end` and `calendar_blocks.recurrence_end`.

All other timestamps are server events set from `utcnow_naive` or `datetime.utcnow`, and they
really are UTC. That covers messages, joins, approvals, expiries, `vacancies.last_activity_at` and
the email and password tokens.

Audit M13 notes three exceptions:
- `Model.save()` writes `updated_at = datetime.now()`, which is host-local time (`model.py:113`).
- `token_blocklist.created_at` stores a time-zone-aware value in a naive column.
- `evaluation_entries.evaluated_at` can come from a CSV date.

### Comparisons of a wall-clock column with a server "now"

Each row is off by one hour in summer.

| Area | Where (file:line) | Effect in summer |
|---|---|---|
| Reminders, `hours_before` (default 48 h) | `scheduler.py:106-107`, armed at `596`, `674` | fire 1 h late |
| Reminders, `days_before_at_time` | `scheduler.py:125-127` | a class stored at 23:xx gets its reminder a day late (the PAD-134 fix assumes UTC storage) |
| Retry re-arm, send guard | `scheduler.py:177-181`; `notification_service.py:2131` | reminders can go out in the class's first hour |
| Cancellation, already started | `notification_service.py:2853-2855` | students can cancel up to 1 h after the start |
| Late-cancellation flag | `notification_service.py:2927-2929` | turns on 1 h late; the web warns 1 h earlier (`ClassDetailSheet.tsx:448-454`) |
| Proactive-decline deadline | `notification_service.py:2757-2801`, `2820`; `serializers/lesson.py:252-255`, `283-287` | closes 1 h late |
| Invitation window (default 24 h) | `scheduler.py:151-152`, `682-693`; `notification_service.py:2732-2735`, `3313-3318`, `3383` | opens 1 h late |
| `minTimeBeforeClass` | `notification_service.py:1361-1365`; `invite_simulation_service.py:142-146` | 60 minutes too generous; a rule of 60 min or less never blocks |
| Vacancy expiry, class-over checks | `notification_service.py:3369`; `_instance_is_over` `1887-1901` (used at 2440, 2569, 3048, 3285, 3441, 3617, 3921); standing fan-out `4358` | engine keeps inviting and accepting in the class's first hour |
| Coach marks absences | `modules/frontend_api.py:2112`, `2132-2136` | replacement invitations fire in the first hour |
| Replacement approval | `replacement_approval_service.py:196`, `330`, `349-352`, `237` | window checks 1 h off; the card shows "open" 1 h early |
| Class join requests (PAD-131) | `class_join_request_service.py:89-93` | requests and accepts allowed 1 h after the start |
| Class requests (PAD-104) | `class_request_service.py:31-33` (`_now_wall_clock`), `139-160`, `296`, `428` | today's free blocks start up to 1 h in the past; past slots accepted |
| Calendar status, open spots | `serializers/calendar_event.py:25-26`, `48-50`; `helpers/calendar_helpers.py:300-324` | "completed" 1 h late; classes under way still offered |
| Pending validation | `services/presence_overview_service.py:303`, `316-318` | appears 1 h after the class ends |
| Dashboard | `helpers/dashboard/coach_home.py:134`, `216-219`, `399`, `484`; `player_home.py:102-124` | `minutesUntil` 60 too high; "today" and the week wrong 00:00-01:00 |
| Pending "tomorrow" window | `helpers/dashboard/pending.py:11-30` | runs 23:00 today to 23:00 tomorrow in wall terms, so it includes today's late class, drops tomorrow's, and the nudges reach the wrong students |
| Eligibility-bar class time | `notification_service.py:506` (`to_utc_iso` on a wall value) | shown 1 h late after `formatClubDateTime` converts it |
| Season "today" | `season_service.py:57`, `73` (`date.today()`, host date) | wrong current season 00:00-01:00 on a boundary day |
| Calendar ranges | `frontend_api.py:594-595`, `922-923` (`isoparse(...).astimezone(utc)` on naive input) | depends on the host zone: correct in the UTC container, 1 h off on a Lisbon dev machine |

**Already correct, because they compare real UTC timestamps:** quiet hours
(`notification_service.py:1344-1359`, PAD-136), the daily invite quota (`1388-1402`, PAD-144),
max inactive time (`3406-3410`), standing-entry expiry (`4061`) and snoozes.

### The test seed's "tomorrow"

`frontend/apps/web/e2e/scripts/seed_dates.py:41-51` anchors on the **UTC** date unless
`E2E_SEED_TODAY` is set, and its comments call the fixtures "naive UTC" (for example "11:00 UTC").
The UI shows those same digits as Lisbon times. Between 00:00 and 01:00 Lisbon in summer, the seed's
"today" is yesterday, so its "tomorrow" fixtures land today. `seed/mock_data.py:228-230` builds
hours on the UTC date the same way.

## Option A: store true UTC and convert at the edges

**Code.** Every edge changes in one release:
- **Writes** convert Lisbon to UTC: `build_datetime`, lesson create and edit,
  `calendar_service`, `class_request_service._parse_slot`.
- **Recurrences** expand in Lisbon local time and convert each occurrence. Otherwise a weekly
  class drifts an hour across DST.
- **Reads** convert UTC to Lisbon for the date and `HH:mm` strings: `calendar_tools.py:93-98`,
  the serializers, and notification texts such as `notification_service.py:1756`, `1804`, `2169`.
- **Naive `isoformat()` outputs** gain an offset.
- **Naive range parameters** are read as Lisbon.
- **Already right under A:** the `utcnow_naive` comparisons, R-023, and the PAD-134, PAD-136 and
  PAD-144 conversions.

**Migration and backfill** (one guarded Alembic revision, deployed with the code):
1. Before migrating, list any rows that fall in the nonexistent hour (01:00-01:59 on
   2026-03-29) or the ambiguous hour (01:00-01:59 on 2025-10-26), and decide those by hand.
2. For each wall-clock column in the table above:
   `UPDATE t SET col = (col AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'UTC'`.
   Postgres's time zone database applies the offset that was in force on each row's own date.
   `vacancies.invite_not_before` is recomputed from the new start instead of shifted, because it
   holds mixed values.
3. Rebuild the persisted APScheduler jobs, whose `run_date`s were computed from the old meaning.
   The simplest way is to clear `apscheduler_jobs` and let the reschedule sweep re-arm them.
4. The downgrade applies the reverse expression.

Staging is copied from prod on every deploy (PAD-200), so the revision is rehearsed on real data
there first.

**Clients:**
- The displays that append `Z` and format in UTC would start showing UTC, 1 h early in summer.
  They must format in `Europe/Lisbon`:
  - web `AttendanceHistoryList.tsx:44-53`, `78`;
  - web `ValidateClassesDialog.tsx:508`, `595`, `616`, `729`, `748`;
  - mobile `ValidateClassesSheet.tsx:638`, `668`, `784`, `805`;
  - mobile `AttendanceHistoryList.tsx:85-97`.
- Day and week bucketing moves to Lisbon days: `dateRanges.ts`, `date-ranges.ts`, the presences
  week helpers.
- Deadline parsing becomes correct once offsets arrive.
- `calendar-status.ts:337-351` still needs a Lisbon-aware build, or a server-sent instant, to be
  right on a device outside Lisbon.

**Risk.** It is a big-bang cutover. A missed edge shows the same one-hour error inverted, and a
rollback needs the reverse migration.

**Effort:**

| Part | Days |
|---|---|
| Backend | 4 to 5 |
| Clients | 1.5 to 2 |
| Seed and E2E | 1 |
| **Total** | **about 7 to 9, plus a coordinated release** |

**Audit variant.** The audit recommends a variant of A: `Lesson.timezone`, time-of-day columns for
the series and true-UTC instances. It is more work again, and it pays off with a second time zone.

## Option B: declare Lisbon wall-clock for the scheduling columns

**Code:**
- Add `club_now_naive()` next to `utcnow_naive` in `utils/dates.py`: Lisbon "now" as a naive
  value. Use it at every row of the comparison table. `class_request_service._now_wall_clock` is
  the swap point that module already prepared.
- The scheduler turns a wall instant into a UTC `run_date` by localising with `CLUB_TZ`. The
  day-before arithmetic uses the wall date directly.
- `pending.py` uses plain wall dates.
- `notification_service.py:506` stops labelling a wall value as UTC.
- `invite_not_before` becomes wall-clock in both timing modes.
- Quiet hours, the daily quota and every event timestamp stay UTC. They are correct today.
- R-023 splits into two rules. Event timestamps are naive UTC; the listed scheduling columns are
  naive Lisbon; crossing between them goes through `CLUB_TZ` helpers.
- `Model.save()` moves to UTC (audit M13).

**No migration and no backfill.**

**Clients:**
- A `lisbonNow()` helper in `packages/config` replaces device "now" in about eight checks:
  `calendar-status.ts:368-397`, `ClassDetailSheet.tsx:439-453`, `attendance-decline.ts:60-69`,
  `MessageBubble.tsx:340`, `353`, `reminder-state.ts:68`, `83`, `ReplacementApprovalCard.tsx:44`,
  `approval-bundle.ts:121`.
- `invite-simulation.ts` stops converting class times.
- The UTC day and week presets move to Lisbon days: attendance, presences, seasons, and the
  mobile tutorial range.
- Most displays already work, because they print the digits unchanged.

**Tests.** The seed anchors on the Lisbon date and renames its "naive UTC" comments. Every fixed
site gets a summer and a winter test pair, as PAD-134 did.

**Risk:**
- The database carries two meanings, kept apart by the rule and by naming.
- A club in another time zone later means doing option A then.
- The deploy risk is low: no data changes, and fixes can ship one at a time.

**Effort:**

| Part | Days |
|---|---|
| Backend | 1.5 to 2 |
| Clients | 1 |
| Rule, specs, tests | 0.5 to 1 |
| **Total** | **about 3 to 4** |

## Either option, separately

- **Web date-only parsing.** `new Date("YYYY-MM-DD")` parses as UTC midnight, so devices west of
  UTC show the day before: `AddClassSheet.tsx:187`, `288` and similar.
- **Hermes parsing.** Offset-less strings may not parse in `attendance-decline.ts:66`.
- **A dead chat warning.** `MessageBubble.tsx:351` reads a `cancellationDeadline` that no backend
  code writes.

## Questions for the owner

1. **Option B now, or option A?** The recommendation is B.
2. **Will LevApp have a club outside Lisbon's time zone in the next six months,** in Spain or the
   Azores? If so, choose A now.
3. **Who runs the deciding check** on the staging VM before work starts?
