---
id: attendance.stats
status: implemented
depends_on: [attendance.presence]
implements: ../../specs-business/attendance/coach-relies-on-attendance.business.md
governed_by: []
---

# attendance.stats


### Intent
Calculate attendance statistics for players, used by the notification engine for ranking and restrictions.

### Rules
1. `_attendance_stats(player_id)` returns (attendance_rate, justified_miss_rate)
2. `_unjustified_absence_count(player_id, coach_id)` counts unjustified absences
3. `_has_makeups(player_id, coach_id)` returns True if justified absences > accepted invitations
4. These stats feed into notification engine tiebreaker sorting and restriction checks
