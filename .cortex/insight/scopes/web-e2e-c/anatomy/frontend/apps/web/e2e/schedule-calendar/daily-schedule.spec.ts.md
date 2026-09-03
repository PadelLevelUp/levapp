---
path: frontend/apps/web/e2e/schedule-calendar/daily-schedule.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 28
size_tokens: 306
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5148c853d06e81131e8283c30a01a23734e4fb070f55a9587cce48d887ec2faa"
---

## Purpose

US-1 smoke test for the weekly calendar: after login, the coach sees the
week-navigation controls (next/previous week) and an abbreviated-month week
label, and the seeded "E2E Academy Class" is findable via `findClassOnCalendar`.
The shortest spec in the folder — no fixtures of its own, purely a baseline
render/navigation check that would catch a broken CalendarPage before any of
the more elaborate schedule-calendar specs run.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach` to authenticate before each test
- ../helpers/navigation: `openCalendar` to land on `/calendar`
- ../helpers/calendar-navigation: `findClassOnCalendar` to locate the seeded class across weeks

Used by: —

Semantically related (not imports): exercises the desktop calendar week view
(CalendarPage / CalendarHeader) and the seeded "E2E Academy Class" fixture
from `scripts/seed.py`.
