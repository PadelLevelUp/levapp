---
path: frontend/apps/web/src/components/calendar/UnavailableStudentDialog.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 62
size_tokens: 463
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0208ba32b9c0f61fd2a782f681512820e61de184d5cbe24458c1619c1caa6ea7"
---

## Purpose

PAD-107's non-blocking warning shown when a coach books a class into a window one or more selected students marked unavailable. Never blocks — enrolment is the coach's call — but tells them up front, by name, that no notification will reach that student for this slot because the student explicitly asked not to be disturbed then.

## Connections

Uses: none within this scope; imports `@/components/ui/alert-dialog`, `@/api/notificationEngine` (`BlockedStudent` type), `react-i18next` — all outside this scope.

Used by: `frontend/apps/web/src/components/calendar/AddClassSheet.tsx` — shown from `checkUnavailableThenSave` when `checkAvailabilityConflicts` returns a non-empty `blocked` list.
