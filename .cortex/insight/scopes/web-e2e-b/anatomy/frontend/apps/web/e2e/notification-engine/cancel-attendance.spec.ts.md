---
path: frontend/apps/web/e2e/notification-engine/cancel-attendance.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 138
size_tokens: 1586
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "cc191de893e7e3aa001fa1d24a4d9f9495affcff72b6c1e8b3cee316d1278a55"
---

## Purpose

E2E for PAD-35: the API-only counterpart to `cancel-attendance-class-view.spec.ts`,
covering the same `POST /api/app/notify/cancel_attendance` contract without
driving the UI (reminders are APScheduler-fired and can't be awaited in E2E,
so the flow is proven via direct API calls). Three tests: (1) a student who
confirmed via `respond_reminder` can cancel before class start and the
response's `action` is `"declined"` — cancel reuses the exact decline path;
(2) cancelling reverts the student's presence to `absent`/`justified`,
verified through the coach's `/lesson_instance/{id}/presences` view, freeing
the spot the same way a reminder decline does; (3) a second cancel of an
already-cancelled attendance is a safe no-op (idempotent-before-start), not an
error. The after-class-start 409 rejection is explicitly NOT exercised here
(the seeded class is always in the future) — that path is covered by the
backend unit test `TestCancelAttendance::test_cancel_after_start_rejected_409`.

## Connections

- Uses: `helpers/api` (`API_APP`, `API_AUTH`) for direct login and API calls
  — no UI helpers needed. (Lives in scope `web-e2e-a`.)
- Used by: — (Playwright entry point; not imported elsewhere in this scope)
- Semantically related (not imports): same backend surface as
  `cancel-attendance-class-view.spec.ts` — `POST /api/app/notify/cancel_attendance`
  in `notification_engine_api.py` / `notification_service.py`; covers
  `.specflow/specs/attendance/confirm.spec.md` (the cancel-after-confirm
  rules). Also related to `proactive-decline.spec.ts`, which covers the same
  endpoint's OTHER branch (`proactive: true`, decline BEFORE the reminder
  fires) with server-side classification.
