---
id: decision.2026-09-11-per-occurrence-enrolment-source-of-truth
title: "Draft for the owner: one source of truth for per-occurrence enrolment (PAD-259, audit H5)"
date: 2026-09-11T00:00:00Z
compass_rules: []
related_specs:
  - classes.instances
  - classes.enrollment
  - classes.instance-enrollment
  - attendance.presence
  - attendance.confirm
  - calendar.view
  - notifications.invitations
  - classes.class-requests
supersedes: []
sources:
  - ../../archive/documents/data-model-audit-2026-09-02/extracted/findings.md
  - 2026-09-10-data-model-audit-follow-up.md
---

# Draft for the owner: one source of truth for per-occurrence enrolment

**Status:** DRAFT, not decided. Written by Session H on 2026-09-11 from the code on `staging`
(72ac170a8) for the coordinator to put in front of the owner. Nothing below is implemented.
Once the owner picks an option this file becomes the decision record and PAD-259 is coded to it;
PAD-271 (vacancy reconciliation, presence response enum) and PAD-288 (early cancellation) are
built on top of it, and PAD-282 is fixed by it.

## Brief for the owner (one page, plain language)

**What this decides.** Today the app keeps "who is in this class on this date" in two places that
are filled in by different actions and can disagree. When they disagree, the coach's calendar
shows one number, the invitation engine believes another, and a student can hold a place that the
engine is trying to give away. The decision is to keep that fact in one place only.

**What coaches and students will notice.** Nothing changes in the numbers they see or in how they
confirm, decline, cancel or take attendance. The one visible change is a fix: the "cancel my
attendance" action appears on classes where it was missing, which today includes a class a student
booked through a request for the next day, and any class more than a day or two ahead. That fix is
already decided (materialise on demand, below) and ships whichever option is chosen here.

**What the migration does to production data, in one sentence.** It adds one column, then writes a
missing attendance row for every enrolment that has none, skipping anything that points at a
deleted player or class.

**Expected downtime.** The write is a single statement over a few thousand rows and runs in about
one second on the server (the same shape moved 8,371 reminder rows in about a second on
2026-09-10). The API is unavailable while the upgrade runs, so expect the deploy's usual restart
window, a few seconds, and nothing more. The deploy log prints four counts (rows missing before,
rows written, rows missing after, classes whose filled count changes) and the staging deploy, which
runs on a copy of production, tells us the exact numbers to expect on production before we
promote.

**What can go wrong and how we roll back.** The known failure shape is the one that took staging
down for five hours on 2026-09-10: a data write that assumed every referenced row still exists.
This one skips such rows, refuses to finish if any enrolment is still without its row, and is
rehearsed on a production-shaped scratch database first. If the upgrade fails, nothing has been
written (it is one transaction) and the previous release keeps running. If it succeeds and a
number looks wrong afterwards, the old table is kept untouched for one full release as a shadow
copy, so the code can be pointed back at it with a code-only release and no data change.

**Why A over B and C.**
- *A (recommended): the attendance row is the enrolment.* One table answers "who is in", "who
  answered" and "who came". Every future feature writes one row; early cancellation needs it, and
  the audit already recommended it.
- *B: keep both tables, add a repair job.* Cheapest today, but the two tables can still drift
  through any path the repair job does not know, and every new feature must write both. It is the
  shape that produced today's problem.
- *C: the other table is the enrolment, attendance stays separate.* Keeps today's arithmetic, but
  a student's answer and their place stay in different tables forever, and the same orphan rows
  still have to be judged before it can be enforced.

**Decided already (2026-09-11):** a student cancelling a class the app has not yet opened makes the
app open it at that moment, only for a student who is actually in the class (the PAD-288
foundation and the PAD-282 fix). And a student who was removed from a date and still answers the
old reminder is told they are no longer in that class; the answer is kept so they are not asked
again, and it never puts them back in or opens a spot.

**Still to decide:** option A, B or C; and what to do with the small number of attendance rows on
production that belong to nobody's enrolment (enrol them or delete the never-answered ones). The
counts come from a read-only query on the staging copy first.

## The question in one paragraph

"Who is in this class on this date?" is answered by three tables that are written on different
paths and read by different surfaces. The coach's calendar, the class-detail capacity field and
the invitation engine count `player_in_lesson_instance` rows. The student's calendar reads
`presences` first. Attendance, declines and cancellations are written on `presences`. Nothing
keeps the two occurrence tables in step, so a class can show one number to the coach and another
to the engine, and a student can hold a spot the engine is trying to fill. The owner has to choose
which table is the enrolment, because every fix on the queue behind this ticket (PAD-271, PAD-282,
PAD-288) needs the answer before it can be written once.

**Recommendation:** option A, in two phases. The presence row is the enrolment. The occurrence
junction table is kept for one release as a shadow copy written by the one enrolment function and
checked against presences, then dropped. Student-side actions on a class that has no instance row
yet (PAD-282 today, PAD-288 next) materialise the occurrence on demand, the way a join request
already does. Details, costs and the alternatives follow.

## What is stored today

Three tables carry "this player is in this class":

| Table | Grain | Meaning today | Written by |
|---|---|---|---|
| `player_in_lesson` | series (lesson template) | the roster of the recurring class | create/edit class, duplicate on "this and future", import |
| `player_in_lesson_instance` | one occurrence | "enrolled on this date"; **this is what capacity counts** | materialisation, instance create/edit, every engine fill, walk-in attendance |
| `presences` | one occurrence | invitation, RSVP answer, coach attendance, late-cancel flag | materialisation, reminders, declines, cancellations, attendance, import, plus three lazy "create if missing" sites |

Both occurrence tables have the same unique key `(player_id, lesson_instance_id)` and cascade on
player and instance delete (`models/Association_PlayerLessonInstance.py:11-25`,
`models/presences.py:19-27, 51-55`). Capacity is defined on the model as junction rows minus
presences with `status = 'absent'` (`models/lesson_instances.py:142-157`, PAD-71), so the number
is only right when every junction row has a presence and every presence has a junction row.

### What each path writes

| Path (file:line on staging) | `player_in_lesson` | `player_in_lesson_instance` | `presences` |
|---|---|---|---|
| Create class with players (`lesson_service.py:407-431`) | yes | – | – |
| Materialise an occurrence (`lesson_service.py:150-162` via `create_lesson_instance_helper` `206-280`) | – | yes, from the lesson roster | yes, `invited=True` |
| Coach creates a one-off instance directly (`create_lesson_instance_helper` alone, `206-280`) | – | yes | **no** |
| Coach edits an instance: add player (`lesson_service.py:305-308`) | – | yes | **no** |
| Coach edits an instance: remove player (`lesson_service.py:310-321`) | – | deleted | deleted |
| Engine fill: invitation yes, waiting-list placement, accepted join request (`notification_service.py:1932-1963`, called from `3699`, `3778`, `4320`, `class_join_request_service.py:279`) | – | yes | yes, `invited=True, confirmed=True` |
| Walk-in on the attendance sheet (`lesson_service.py:353-385`, PAD-140) | – | yes | yes, `validated=True` |
| Reminder send, lazy (`notification_service.py:2311-2325`) | – | – | yes if missing (only for junction rows) |
| Reminder answer, lazy (`notification_service.py:2692-2705`, PAD-69) | – | – | yes if missing, **for any responder** |
| Cancel attendance, lazy (`notification_service.py:2993-3015`, PAD-73) | – | – | yes if missing (after checking the junction) |
| Decline or cancel (`_free_spot_for_declining_player`, `2814-2818`) | – | – | `status=absent, justification=justified, confirmed=True` |
| Import attendance (`import_service.py:555-575`) | – | **no** | yes, `validated=True` |
| Accepted class request (`class_request_service.py:367-398` → `add_class_service`) | yes | – | – (nothing until the occurrence materialises) |
| Account deletion / player claim (`player_claim_service.py:70` lists the junction) | per service | per service | per service |

Two paths write a junction row and no presence (coach one-off instance, coach add-to-instance);
two write a presence and no junction row (import, and a reminder answer from a player who is not
enrolled). The audit measured the drift on the dev database: 14 of 41 presences had no junction
row, and two instances carried an absent presence for a non-enrolled player, so the capacity
formula subtracted a decline from an enrolment that did not exist and under-counted by one.

### Who reads what

| Reader | Reads |
|---|---|
| Capacity everywhere: calendar card, class-detail capacity, engine, join-request "is full", open-spot feed (`lesson_instances.py:142`, `notification_service.py:1925`, `class_join_request_service.py:98-100`, `calendar_helpers.py:332`) | junction minus absent presences |
| Coach calendar (`calendar_helpers.py:37-69`) | junction (eager-loaded with presences) |
| Student calendar (`calendar_helpers.py:113-169`) | presences first, then junction as a fallback |
| "Is this student in the class" for authorization and eligibility (`frontend_api.py:394, 1029-1040, 2150`, `notification_service.py:1137, 2226, 2292-2304, 2637, 2985, 4173, 4436-4450`, `notification_engine_api.py:173`, `student_availability_service.py:182`) | junction |
| Class-detail participants list (`serializers/lesson.py:163-166`) | junction |
| Client capacity helper (`packages/config/src/capacity.ts`) | `participantCount` minus absent presences, mirroring the model |

The spec already promises what option A implements: `classes.instances` rule 2 and
`attendance.presence` rule 1 say presences exist for every enrolled player from materialisation,
and `attendance.presence` rule 1a (PAD-199) already defines `invited` as "roster membership, not
messaging state". The model is what lags.

## Two new inputs the decision must answer

### PAD-288: cancel a class a week ahead

Today a student can only decline something that has a `lesson_instances` row: `cancel_attendance`
takes a `lessonInstanceId` and checks the junction (`notification_service.py:2940-2990`). Rows
exist only once a reminder job or a coach opens the date (`classes.instances` rule 1). A week out
there is no row, so there is nothing for the cancellation to attach to.

Any option has to say where a cancellation lives before the occurrence exists. Three shapes:

1. **Materialise on demand.** The student's cancel is sent as `(model, originalId, date)` and the
   server materialises the occurrence first, exactly as a join request already does
   (`classes.join-requests` rule 2, `resolve_instance` in `class_join_request_service.py:103-121`).
   Materialisation is idempotent and serialised per series (rule 8, PAD-261) and creates every
   roster presence, so the cancellation is then an ordinary presence update. Cost: one more
   student action that creates an instance and its reminder jobs, which the join-request precedent
   already accepted. **DECIDED by the owner on 2026-09-11: materialise on demand.** Spec: `attendance.confirm` rules 18–20, `classes.instances` rule 1 (numbers unconfirmed).
   Also covers PAD-282.
2. **Pre-materialise a horizon** (say 14 days). Rejected: the audit's §15 keeps lazy
   materialisation, and every coach would get a fortnight of instances and reminder jobs written
   at once, which the scheduler already struggles with (PAD-276).
3. **A per-player exceptions row** keyed on `(lesson_id, date, player_id)` applied at
   materialisation. Rejected: it is a fourth place for the same fact, which is what this ticket
   removes.

PAD-288's product questions (how far ahead, does the spot open to the waiting list at once, does the
coach hear about early cancellations, can the student undo) are unchanged by the data model and
stay with PAD-288.

### PAD-282: a student cannot cancel a class they requested

Read from the code, then confirmed by Session I on 2026-09-11 with a backend test-app repro (PAD-104 fixtures, no scheduler): after accept, zero `lesson_instances` rows for the lesson, the student calendar event has `model="Lesson"`, and `POST /class_instance?model=Lesson` returns `participants=1` with no `presences` key. A request accepted ten days out shows the identical state until its reminder job fires about a day before. An accepted request creates a one-off `private` lesson with the student on the
lesson roster and schedules its reminder job (`class_request_service.py:367-398`,
`lesson_service.py:604-660`). When the request is for tomorrow the reminder's fire time is already
past, so no job is scheduled (`scheduler.py:592-599` skips it) and nothing ever materialises the
occurrence. The student's class detail therefore resolves to the lesson, not an instance
(`frontend_api.py` `/class_instance`, model=lesson with no matching row), the payload has no
presences and `event.model` is `Lesson`, and the web sheet's `cancelInstanceId` is null, so the
cancel button is hidden (`ClassDetailSheet.tsx:427-432, 474-477`). iOS gates harder still: it calls cancel with `myPresence.lessonInstanceId` (`app/class/[id].tsx:637-662`), so with no presence row there is no id to send. An
academy class for tomorrow works because its reminder already fired and materialised it.

So PAD-282 is not a guard that fails to recognise a path. It is the same gap as PAD-288 one day
out: a student-side action on an occurrence that has no row. Shape 1 above fixes both with one
change to `cancel_attendance`'s contract. If Session I's repro shows a different mechanism (for
example a private class whose reminders are disabled), the fix shape does not change.

## Options

### Option A: the presence row is the enrolment (audit's recommendation)

- `presences` gains `enrolment_source` (see below). A presence row means "this player holds a
  spot on this occurrence"; `status = 'absent'` means they gave it up or were marked absent.
- One function, `enrol(player, instance, source)`, replaces every junction write and every lazy
  presence create. Removing a player from an occurrence deletes the presence.
- `effective_filled_spots` becomes presences minus absent presences. Every "is enrolled" reader
  and the participants list move to presences. The client helper's arithmetic is unchanged
  (`participantCount` already means effective filled spots).
- `player_in_lesson_instance` is dropped. `player_in_lesson` (the series roster) stays: it is a
  different fact and is not part of H5.
- The lazy "create a presence if missing" sites go away except for `respond_to_reminder`, which
  today accepts an answer from a non-enrolled player and creates a row for it (PAD-69). Under A that
  row would enrol them. Proposed: an answer from a player with no presence is recorded on the
  reminder attempt and refused as an enrolment (403, as `cancel_attendance` already does).

### Option B: keep all three tables, one writer plus reconciliation

- `enrol_in_instance(player, instance, source)` writes both occurrence tables; a reconciliation
  pass on the two-minute tick (or a one-off script) adds the missing side wherever they differ.
- No schema change (`enrolment_source` would still be wanted somewhere). Readers unchanged.
- Cheapest now, but the drift is only ever repaired, never prevented: the editor, the import, the
  engine-API seeds and any raw SQL still write one table. Every future feature (PAD-288 first) has
  to write two rows, and the reconciliation is a permanent tax and a permanent source of "which one
  was right" questions. This is the shape that produced H5.

### Option C: the junction row is the enrolment, presences are attendance only

- Keep capacity as it is (junction minus absent). Add `enrolment_source` to the junction. Make a
  presence impossible without a junction row (composite foreign key onto the junction's unique
  pair) and delete or re-link the presences that have none.
- Matches the current capacity arithmetic, so the smallest code change on the read side.
- Two rows per enrolment forever; the student's answer and the student's enrolment live in
  different tables; PAD-288 and every engine fill keep writing both; the 14-of-41 orphan presences
  are either deleted (losing recorded RSVP answers) or turned into enrolments (changing capacity
  the same way A does), so the data question is not avoided, only hidden.

### Comparison

| | A: presence is the enrolment | B: writer + reconcile | C: junction is the enrolment |
|---|---|---|---|
| Schema change | one column, then one table drop | none | one column, one composite FK |
| Backfill | insert a presence for every junction row without one | insert both sides | insert a junction row (or delete) for every presence without one |
| Orphan risk on prod data | inserts must skip rows whose player or instance is gone (see B-059) | same | same, plus the new FK fails on any leftover |
| Code touched | ~15 writers → 1; ~20 readers of the junction; 39 junction and 47 presence constructions in backend tests | 15 writers → 1; 0 readers | 6 lazy presence sites; 0 readers |
| PAD-288 / PAD-282 | one row, materialise on demand | two rows | two rows |
| PAD-271 fit | response enum lives on the enrolment row | enum on presences, enrolment elsewhere | same as B |
| Long-run | one fact, one table | drift repaired forever | two tables per fact forever |

### `enrolment_source` values (for A or C)

`roster` (from the series roster at materialisation), `coach` (added to this occurrence by the
coach), `fill` (invitation accepted, waiting-list placement, accepted join request),
`walk_in` (recorded on the attendance sheet after the fact), `import`, and `unknown` for backfilled
rows whose origin cannot be told. The audit's `guest | substitute` split is not something the code
distinguishes today, so it is not proposed. Stored as a short string with a CHECK constraint, not
a native Postgres enum, so adding a value later is one migration line (this also settles the
deferred native-enum-vs-CHECK question from the audit follow-up for new columns; the existing
native enums stay).

## Migration and backfill under option A (recommended)

Phase 1 (PAD-259's PR, batch 4, chained after the id the coordinator sends, expected `95bfee084ad1`):

1. `ALTER TABLE presences ADD COLUMN enrolment_source` with the CHECK, default `'unknown'`,
   guarded with `IF NOT EXISTS` (prod schema drift, PAD-200/B-059).
2. Backfill, one statement, tolerant of gone rows: insert a presence for every
   `player_in_lesson_instance` row that has none, `invited=true`, `enrolment_source='roster'` when
   `player_in_lesson` has the pair for the instance's lesson else `'coach'`, only where the player
   and the instance still exist. Set `enrolment_source='roster'` on existing presences that have a
   junction row and a series roster row, `'coach'` where only the junction row exists.
3. Presences with **no** junction row are the decision the owner should see numbers for before
   choosing (query below). Proposed rule: `status='absent'` rows stay as they are (they already do
   not count); `status IS NULL OR 'present'` rows become enrolments with `enrolment_source='unknown'`
   and are listed in the PR body by count per coach. This can raise a class's filled count by one
   where a decline was recorded against a removed player. If the count on prod is large, the
   alternative is to delete rows with `status IS NULL` and `confirmed=false` (never answered, not
   enrolled) and keep the rest.
4. Code: `enrol()` writes the presence **and**, for this release, the junction row (shadow). Every
   reader moves to presences. A `reconcile_enrolment` check (test helper plus a one-off script on
   the staging copy) asserts the two tables agree after the backfill and after each E2E suite.
5. Idempotent, dry-run on a prod-shaped scratch database seeded with orphan references (the
   B-059 lesson), and read-only counts on the staging copy of prod first.

Phase 2 (a later batch, after one release with zero reconcile differences): drop
`player_in_lesson_instance`, remove the shadow write, remove the junction from the claim and
deletion table lists (`player_claim_service.py:70`, account deletion), regenerate insight.

Outage risk: phase 1 is one column add and one `INSERT … SELECT`; on 2026-09-10 the same shape for
8,371 reminder rows ran in about one second on the VM once written as a single statement. The
per-row form took five minutes and 502'd staging (B-059 follow-up), so this backfill is written as
one statement from the start, with the SQLite loop only for the test suite.

### What the backfill should report, and what would be alarming

The migration logs four numbers at INFO on every run, so the deploy log carries them (the check
PAD-207 never had, B-059):

| Number | Where it comes from | Normal | Alarming |
|---|---|---|---|
| `junction_without_presence_before` | query 1 before the insert | a small share of junction rows: only the coach's one-off instance and add-to-instance paths write a junction row without a presence, so tens to low hundreds on prod, well under 10% of `player_in_lesson_instance` | more than 10% of junction rows (a path nobody found), or a number that differs from the staging run by more than a day's activity |
| `presences_inserted` | the statement's rowcount | equal to `junction_without_presence_before` minus the orphan rows of query 4 | zero while the first number is non-zero (the statement skipped everything), or larger than the first number (the `NOT EXISTS` filter is wrong) |
| `junction_without_presence_after` | query 1 after the insert | exactly the orphan rows of query 4, which is 0 when prod's foreign keys are in place | anything else: the migration **fails** here on purpose, before the phase-1 code that reads presences can see a partial backfill; a re-run is idempotent |
| `capacity_changes` | query 3, instances whose filled count differs under A | only future instances matter; a handful, all explained by query 2's rows | a change on any instance in the next seven days that the coach was not told about in the PR body |

Timing: one statement over a table the size of prod's `presences` (thousands of rows, an order of
magnitude below the 8,371 reminders PAD-207 moved in about a second) should finish well inside a
second. The entrypoint runs the upgrade before gunicorn, so anything past 30 seconds is a per-row
loop that got in by mistake, and the deploy is stopped rather than waited out.

The strongest comparison is the staging deploy itself: staging is a copy of prod taken at each
deploy (PAD-200), so the four numbers staging logs are the numbers prod will log at promotion,
plus or minus whatever the academies did in between. A prod run that inserts noticeably more than
staging did is stopped and looked at before the container is allowed to keep restarting.

A second run after `stamp` inserts nothing; that is asserted in the SQLite migration test and in
the scratch-Postgres dry run, the same two proofs B-059 used.

### Read-only queries for the staging copy of prod (Session I's permission-gated slot)

```sql
-- 1. junction rows with no presence (become presences in step 2)
SELECT count(*) FROM player_in_lesson_instance j
LEFT JOIN presences p ON p.player_id = j.player_id AND p.lesson_instance_id = j.lesson_instance_id
WHERE p.id IS NULL;

-- 2. presences with no junction row, by status (step 3's decision)
SELECT p.status, p.confirmed, count(*) FROM presences p
LEFT JOIN player_in_lesson_instance j ON j.player_id = p.player_id AND j.lesson_instance_id = p.lesson_instance_id
WHERE j.id IS NULL GROUP BY 1, 2 ORDER BY 3 DESC;

-- 3. instances whose capacity would change under A, with the delta
WITH a AS (
  SELECT lesson_instance_id, count(*) FILTER (WHERE status IS DISTINCT FROM 'absent') AS filled_a
  FROM presences GROUP BY 1),
 t AS (
  SELECT j.lesson_instance_id,
         count(*) - count(p.id) FILTER (WHERE p.status = 'absent') AS filled_today
  FROM player_in_lesson_instance j
  LEFT JOIN presences p ON p.player_id = j.player_id AND p.lesson_instance_id = j.lesson_instance_id
  GROUP BY 1)
SELECT coalesce(a.lesson_instance_id, t.lesson_instance_id) AS instance_id,
       coalesce(filled_today, 0) AS today, coalesce(filled_a, 0) AS under_a
FROM a FULL JOIN t USING (lesson_instance_id)
WHERE coalesce(filled_today, 0) <> coalesce(filled_a, 0);

-- 4. orphan references the backfill must skip (B-059)
SELECT count(*) FROM player_in_lesson_instance j
WHERE NOT EXISTS (SELECT 1 FROM players WHERE id = j.player_id)
   OR NOT EXISTS (SELECT 1 FROM lesson_instances WHERE id = j.lesson_instance_id);
```

## What changes for web and iOS

Nothing in the numbers: `participantCount`, `confirmedCount`, `maxPlayers` keep their meaning and
the client capacity helper is untouched. The class-detail `participants` list is built from
presences instead of the junction, which on a student's own view is the same single row. The one
visible change is the PAD-282/PAD-288 shape: the cancel action is offered on a not-yet-materialised
occurrence and the client sends `(model, originalId, date)` instead of an instance id, on both
shells in the same PR.

## Spec and ledger consequences (to be written once decided, rule numbers from the coordinator)

- `classes.instance-enrollment`: rewritten around presence-as-enrolment and `enrolment_source`;
  `classes.enrollment` entity list drops the junction after phase 2.
- `classes.instances` rule 2 and `attendance.presence` rule 1: unchanged in intent, now true.
- `attendance.confirm` rule 14 (authorisation on the junction) and rule 4 (`lessonInstanceId`)
  become "on the presence" and "on `(model, originalId, date)`, materialising first".
- `calendar.view` rules 8 to 10: wording only.
- Compass ledger B-071 (H's range): "capacity under-counts when the two occurrence tables disagree",
  resolved by this ticket.

## Open questions for the owner

1. ~~Option A, B or C~~ DECIDED by the owner on 2026-09-11, in person: **A**. The owner's framing, which the model must keep: three separate things on the one row — planned (the coach put the student in; the row exists and holds the spot), intends to come (the student's answer: confirm, decline, cancel; only the student writes it), was there (the coach's attendance record; only the coach writes it). One table, never one field.
2. ~~Presences with no junction row~~ MOOT, counts from the prod copy (Session E, 2026-09-11 20:03, prod as of 19:5x, head 95bfee084ad1): query 1 = 2 junction rows without a presence (both past instances); query 2 = 0 presences without a junction row; query 3 = 2 instances change, 0 in the future; query 4 = 0 orphan references; presences 4,418, junction 4,420. The backfill inserts 2 rows and nothing is enrolled or deleted by judgment.
3. ~~Materialise on student cancel~~ DECIDED 2026-09-11: yes.
4. ~~Reminder answer from a non-enrolled player~~ DECIDED 2026-09-11 (coordinator, with the owner's known intent): the answer is recorded on the reminder attempt so the bubble settles and no re-reminder fires, the student is told they are no longer in this class, and no enrolment or vacancy is created. Removing a participant also retires their pending reminder bubble (folded into PAD-259's PR). The PAD-69 pin keeps its intent (an answer is never silently lost); its test changes what "recorded" means.
