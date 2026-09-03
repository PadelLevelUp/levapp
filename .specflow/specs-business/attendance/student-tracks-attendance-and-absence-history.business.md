---
id: attendance.student-tracks-attendance-and-absence-history
status: draft
implemented_by:
  - ../../specs/attendance/history.spec.md
  - ../../specs/attendance/absences.spec.md
---

# Student Tracks Attendance And Absence History

## Outcome

A student can look back at their own record — classes they attended and classes they missed — as
a chart plus a browsable list, with each entry linking straight back to that class on the
calendar; a coach can pull up the same two views for any player on their roster.

## Who This Is For

Students/players reviewing their own record; coaches reviewing a roster player's record.

## User Journey

1. From the dashboard, a student clicks their "Attended" or "Missed" KPI and lands on the
   matching history page.
2. They see a chart bucketed by day, month, or year depending on the range, with preset
   shortcuts (1 week / 1 month / 1 year) or a custom date range.
3. Below the chart, a list of the matching classes, most recent first; clicking one opens that
   class on the calendar.
4. On the missed page, each row also shows whether the absence was excused (justified) or not.
5. A coach viewing a specific player's profile can open that same pair of pages for them.

## Business Rules

- The attended page counts only classes where the player's status is "present"; the missed page
  counts only classes where it's "absent" — the same numbers the dashboard's KPI cards show, so
  they can never disagree.
- The missed page counts every absence, justified or not — justification is shown per row, but
  never changes the total.
- A coach may only view this for a player on their own roster; a student may only view their own.
- The chart never has gaps — every period in the selected range appears, even ones with zero
  classes.

## Success Metrics

Not yet measured.

## Out of Scope

Recording or finalizing attendance in the first place
(`attendance.coach-finalizes-attendance-records`); confirming or cancelling attendance ahead of
the class (`attendance.player-confirms-and-manages-attendance`).

## Notes

None.
