---
path: frontend/apps/web/e2e/schedule-calendar/class-detail-privacy.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 130
size_tokens: 1093
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "fbff3e5f6589806cbb376fe864e16726c078b1c07328a0852f56ea305a83da69"
---

## Purpose

E2E for PAD-36: role-based visibility of class-instance detail data. This is
explicitly an API-CONTRACT test, not a UI-hiding test — its own header
comment states UI hiding alone is insufficient, since the privacy leak lives
in what the backend RETURNS, so it asserts directly on the
`POST /api/app/class_instance?model=lessoninstance&id=1` JSON payload for two
different callers. Setup: the coach sends an open-spot notification
(`/notify/manual`) to "E2E Student Two", creating a coach-only
`NotificationEvent`. The coach's own view of the payload must include that
invitation (sanity check that the endpoint actually has the data to leak).
The seeded student's ("E2E Student", enrolled) view of the SAME instance must
NOT include student-2 in `participants`, `presences`, or `invitations` — even
though the coach's view does — while still exposing shared non-sensitive data
(`name`).

## Connections

- Uses: `helpers/api` (`API_APP`, `API_AUTH`) only — no UI helpers, this is a
  pure API test. (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises the role-scoped serialization
  branch in `lesson_service.py` / `serializers/lesson.py` for the
  `class_instance` route; covers
  `.specflow/specs/classes/detail-visibility.spec.md` in full.
