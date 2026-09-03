The student-controlled and calendar-driven suppression of class-slot solicitations (PAD-107/112): a student can mark themselves unavailable for a slot or opt out of notifications, and both signals must stop the [[invitation-engine]] from soliciting them for that slot without ever hard-blocking a coach's own scheduling action — the coach still sees a warning dialog and can proceed, because enforcement of *who gets notified* is a server-side concern, not a client-side gate.

## Implemented by
`backend/padel_app/services/student_availability_service.py`
`backend/padel_app/services/student_notification_preferences.py`
`backend/padel_app/tests/test_student_availability_blockers.py`
`backend/padel_app/tests/test_student_notification_block_preferences.py`
`frontend/apps/web/src/components/calendar/UnavailableStudentDialog.tsx`
`frontend/apps/web/e2e/availability/unavailable-student-notifications.spec.ts`

## Related concepts
[[invitation-engine]]
