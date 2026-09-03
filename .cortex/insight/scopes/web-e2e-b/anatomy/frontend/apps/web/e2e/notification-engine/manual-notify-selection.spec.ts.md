---
path: frontend/apps/web/e2e/notification-engine/manual-notify-selection.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 115
size_tokens: 1153
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "eedb8063924b0269bb02638ff1082fbb4122edfc21f91f5c7a412aac1086cf46"
---

## Purpose

E2E for PAD-74: regression test for a checkbox-selection bug in the manual
"Notify students" modal (`ManualNotificationModal`). The bug: each student row
carried both its own `onClick` AND its checkbox carried its own
`onCheckedChange`, so clicking the checkbox toggled selection twice (select +
deselect) and netted out to no visible change — only clicking the student's
NAME worked, because that hit only the row handler. Three tests: clicking the
checkbox now selects a searched student (the actual bug); clicking the name
still works (unchanged behaviour, regression guard); and checkbox/name behave
identically for a player inside an expandable notification GROUP card too
(located structurally via `div.rounded-lg.border.overflow-hidden` since group
labels are coach-configurable, not fixed text).

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openCalendar`);
  `helpers/calendar-navigation` (`findClassOnCalendar`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises
  `frontend/apps/web/src/components/calendar/ManualNotificationModal.tsx`;
  covers `.specflow/specs/notifications/manual.spec.md` and
  `.specflow/specs/notifications/groups.spec.md` (the notification-group
  bundling this test's third case checks).
