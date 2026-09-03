The database stores every instant as naive UTC, but every human-facing day/hour concept a coach reasons about — quiet hours, per-day reminder limits, reminder timing, "today" vs. "tomorrow" — is club-local (Europe/Lisbon). Naive UTC-hour comparisons drift by an hour across a DST transition, so the day-boundary logic must explicitly convert into `CLUB_TZ`, do the comparison, and convert back to naive UTC before writing. PAD-144's fixes prove correctness by showing the same UTC wall-clock instant lands on a different local calendar day on either side of a DST change.

## Implemented by
`backend/padel_app/utils/dates.py`
`backend/padel_app/scheduler.py`
`backend/padel_app/services/notification_service.py`
`backend/padel_app/services/student_availability_service.py`
`backend/padel_app/tests/test_dates.py`
`backend/padel_app/tests/test_dashboard_pending_confirmations.py`

## Related concepts
[[reminder-lifecycle]]
