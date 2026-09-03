---
path: frontend/apps/web/e2e/schedule-calendar/guest-list-dedupe.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 254
size_tokens: 2195
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "678935d0306a620675c1969fe163fca2af7e3910a3c117f3ff46e439c41f7893"
---

## Purpose

PAD-72 regression test: a student invited to the same class several times
(three separate `NotificationEvent` rows from manual re-invites) must appear
exactly ONCE in the coach's class-detail "Invited" guest list — the payload
must be keyed by student, not by invite record. Builds its own dedicated class
("E2E Guest Dedupe Class") via direct API calls (login, create class, send
three manual invites to the same player) so the assertion cannot race other
specs' invites on the shared seeded class, then verifies dedup both at the
`class_instance` API payload level and in the rendered dialog's "Invited (1)"
toggle. Cleans up the class it creates in `afterEach`.

## Connections

Uses:
- ../helpers/api: `API_APP`, `API_AUTH` for direct HTTP calls (login, add_class, notify/manual, class_instance, remove_class)
- ../helpers/auth: `loginAsCoach` for the UI half of the assertion
- ../helpers/calendar-navigation: `findClassOnCalendar` to locate the created class
- ../helpers/navigation: `openCalendar` before searching for the class

Used by: —

Semantically related (not imports): exercises the same class-detail guest-list
payload as `schedule-calendar/participant-count-effective.spec.ts` (both read
`/class_instance`) and the notification engine's multi-round invite matching
that `settings/notification-engine-settings.spec.ts` configures; spec:
specs/calendar/spec.md — calendar.event-detail rules 6-9.
