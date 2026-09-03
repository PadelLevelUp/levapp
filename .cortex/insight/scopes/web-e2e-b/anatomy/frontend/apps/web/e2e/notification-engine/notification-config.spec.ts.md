---
path: frontend/apps/web/e2e/notification-engine/notification-config.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 58
size_tokens: 646
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "05fb09aa2c6e9faf53e8b757c1005ae05869a08dcdb6be0cc86e1b9d2cbb47cc"
---

## Purpose

Coarse smoke coverage (US-52/53/54/56) that a class's notification
configuration entry points exist in the class-detail dialog: a "Notify"
button is visible, some notification-related text renders once the dialog is
open, a player/group reference is present (self-skipping via `test.skip` if
not — a soft assertion), and a manual send/invite button exists. Deliberately
thin: US-55 (message-template customisation) was explicitly removed from this
file with a comment redirecting to `settings/notification-engine-settings.spec.ts`
(outside this scope) since templates are global, not per-class.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openCalendar`);
  `helpers/calendar-navigation` (`findClassOnCalendar`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): smoke-covers the entry points into
  `ManualNotificationModal.tsx` and the class-detail notify affordance;
  loosely covers `.specflow/specs/notifications/_overview.md` and
  `.specflow/specs/notifications/config.spec.md`. The stronger, mechanism-level
  coverage of the same "Notify" button lives in `manual-notify-selection.spec.ts`
  and `reminder-flow.spec.ts` (L3) in this scope.
