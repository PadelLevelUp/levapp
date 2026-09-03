---
path: frontend/apps/web/e2e/schedule-calendar/participant-count-effective.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 201
size_tokens: 1676
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6f5e01646c484b7a27de994526668a5ecf4bd0f6b8f52dcd1aebb263fac94dd7"
---

## Purpose

PAD-71 regression test: the weekly calendar's "X/Y" participant badge must show
the EFFECTIVE filled-spot count (enrolled minus declined), not the raw
enrolment count, and it must match the "Capacity" field in the class-detail
sheet. Asserts both surfaces against the seeded "E2E Declined Count Class" (3
enrolled, 2 declined, 4 spots -> expected "1/4", never "3/4"), and separately
creates a dedicated "E2E Full Count Class" via direct API calls to prove an
unanswered (not-yet-declined) invite still occupies a spot ("2/4", not "0/4")
— deliberately avoiding the shared seeded "E2E Academy Class" because other
specs mutate its enrolment/attendance state. Cleans up its own created class
in `afterEach`.

## Connections

Uses:
- ../helpers/api: `API_APP`, `API_AUTH` for direct HTTP (login, coach_players, add_class, remove_class)
- ../helpers/auth: `loginAsCoach`
- ../helpers/calendar-navigation: `findClassOnCalendar`
- ../helpers/navigation: `openCalendar`

Used by: —

Semantically related (not imports): reads the same class-detail "Capacity"
tile and calendar-event-card badge exercised by
`schedule-calendar/guest-list-dedupe.spec.ts`; the effective-count computation
(enrolled minus declined) lives in the backend calendar/class-instance
serialization layer.
