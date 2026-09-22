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
1. `_attendance_stats(player_id)` returns (attendance_rate, justified_miss_rate)
2. `_unjustified_absence_count(player_id, coach_id)` counts unjustified absences on this coach's occurrences (`classes.coach-assignment` rule 4). **An absence is a row whose `status` is `absent`** (PAD-381, B-152): the count is `status == "absent"` AND `justification == "unjustified"`. A justification left on a `present` row — they exist from before `attendance.validation` rule 21 — is not an absence. An `absent` row with NO justification (the import writes one for an empty justification cell) counts in NEITHER bucket; whether an untyped absence should count against a coach's bar is not decided here.
3. `_has_makeups(player_id, coach_id)` returns True if justified absences > accepted invitations. The credit side uses the same predicate as rule 2 (`status == "absent"` AND `justification == "justified"`, this coach's occurrences; a student's own decline or cancellation ahead of the class writes exactly that pair, so it counts before the coach validates). The debit side is every `NotificationEvent` of that player and coach with `status == "confirmed"`, all time, not tied to the missed class — **unchanged by PAD-381, and an open product question** ("who is owed a make-up"): a corrected mark now removes a credit while the acceptance it may have funded stays a debit.
4. These stats feed into notification engine tiebreaker sorting and restriction checks
