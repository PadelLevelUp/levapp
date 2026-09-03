The end-to-end class-reminder state machine: an APScheduler job fires a reminder at a club-local instant derived from the coach's configured timing, a student can confirm, decline, or let it lapse, a second reminder for the same instance supersedes the first (disabling its Yes/No buttons rather than leaving two live prompts), and a coach's later manual action must never silently overwrite a student's earlier decline. A student may also decline *proactively*, before their reminder would even fire — the server classifies proactive vs. non-proactive by comparing against the reminder instant itself (never a hardcoded interval), and both paths share one `cancel_attendance` endpoint and produce the same auto-justified absence. This concept also covers the scheduler-job half of the lifecycle: jobs must be correctly created, re-scheduled, and cancelled across a class's create/edit/delete/split operations (PAD-134/136/144).

## Implemented by
`backend/padel_app/services/notification_service.py`
`backend/padel_app/scheduler.py`
`backend/padel_app/utils/notification_preview.py`
`backend/padel_app/tests/test_boolean_coercion.py`
`backend/padel_app/tests/test_notification_reminder_flow.py`
`backend/padel_app/tests/test_notification_schedule.py`
`backend/padel_app/tests/test_scheduler_job_lifecycle.py`
`backend/padel_app/tests/test_reminder_jobs_on_future_edit.py`
`frontend/apps/web/e2e/notification-engine/proactive-decline.spec.ts`
`frontend/apps/web/e2e/notification-engine/cancel-attendance.spec.ts`
`frontend/apps/web/e2e/notification-engine/cancel-attendance-class-view.spec.ts`
`frontend/apps/web/e2e/notification-engine/reminder-flow.spec.ts`
`frontend/apps/web/e2e/notification-engine/auto-reminder.spec.ts`

## Related concepts
[[invitation-engine]]
[[club-local-day-boundary]]
[[notification-template-fallback]]
[[lazy-instance-materialisation]]
