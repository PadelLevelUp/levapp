---
id: attendance.stats
status: implemented
depends_on: [attendance.presence]
implements: ../../specs-business/attendance/coach-finalizes-attendance-records.business.md
governed_by: []
---

# attendance.stats


### Intent
Calculate attendance statistics for players, used by the notification engine for ranking and restrictions.

### Rules
1. `_attendance_stats(player_id, coach_id)` returns (attendance_rate, justified_miss_rate) **over this coach's occurrences only** (PAD-382, B-143; `classes.coach-assignment` rule 4). The batched `_attendance_stats_for(player_ids, coach_id)` and the counts behind both (`_attendance_counts_for`: total, present, justified absences) take the same scope, and so do the two readers that fill the manual-invitation dialog's default groups, `_students_with_recent_absences` and `_students_with_justified_absences` (`GET /notify/groups`): what happened in another coach's classes shapes neither this coach's bar, nor their ranking, nor their dialog. The `justified_absences` eligibility attribute compares the scoped COUNT itself, not a rate multiplied back by a total. Denominator unchanged from PAD-276: every presence row on the coach's occurrences, whatever its status.
2. `_unjustified_absence_count(player_id, coach_id)` counts unjustified absences on this coach's occurrences (`classes.coach-assignment` rule 4). **An absence is a row whose `status` is `absent`** (PAD-381, B-152): the count is `status == "absent"` AND `justification == "unjustified"`. A justification left on a `present` row — they exist from before `attendance.validation` rule 21 — is not an absence. An `absent` row with NO justification (the import writes one for an empty justification cell) counts in NEITHER bucket; whether an untyped absence should count against a coach's bar is not decided here.
3. **Classes owed** (PAD-505; resolves the open question PAD-381 left). `makeups_owed(player_id, coach_id)` (batched: `makeups_owed_for(player_ids, coach_id)`, one query) is justified absences minus make-ups taken, **never below 0**, over this coach's occurrences. A justified absence is rule 2's predicate with `justified` (`status == "absent"` AND `justification == "justified"`; a student's own decline or cancellation ahead of the class writes exactly that pair, so it counts before the coach validates). A **make-up taken** is a class the student **attended as a fill**: `status == "present"` AND `enrolment_source == "fill"` — every way into another class's spot (an invitation "yes", a waiting-list "yes", an accepted join request) enrols as `fill` (`classes.instance-enrollment` rule 4). An accepted invitation the student then missed is not a make-up; rows from before PAD-259 (`enrolment_source == "unknown"`) are not counted as make-ups. `_has_makeups(player_id, coach_id)` is `makeups_owed > 0`. Until PAD-505 the debit was every `NotificationEvent` with `status == "confirmed"`, all time.
4. These stats feed into notification engine tiebreaker sorting and restriction checks. The `justified_misses` tiebreaker sorts on **classes owed** (rule 3, more owed first), not on the justified-miss rate (PAD-505): the number the coach reads in the simulation is the number the engine ranks by.

### Acceptance Criteria

#### Classes owed are justified absences minus classes attended as a fill (rule 3, PAD-505)
- **Given** a student with 3 justified absences and 1 class of this coach attended as a fill
- **Then** `makeups_owed` is 2 and `_has_makeups` is true

#### A fill reached without an invitation is a make-up taken (rule 3)
- **Given** 1 justified absence and 1 attended fill that left no `NotificationEvent` (an accepted join request)
- **Then** nothing is owed

#### An accepted invitation the student then missed is not a make-up (rule 3)
- **Given** 1 justified absence, and a fill class the student accepted (a `confirmed` event) and then missed
- **Then** 1 class is owed

#### Classes owed never go below 0 (rule 3)
- **Given** 1 justified absence and 3 attended fills
- **Then** nothing is owed

#### A class on the student's own roster is not a make-up (rule 3)
- **Given** 1 justified absence and 1 attended roster class
- **Then** 1 class is owed

#### The tiebreaker ranks by classes owed (rule 4)
- **Given** Ana with 2 justified absences in 10 classes (20 %, 2 owed) and Bruno with 1 in 2 (50 %, 1 owed), and only the `justified_misses` tiebreaker on
- **When** a spot opens
- **Then** Ana is ranked before Bruno
