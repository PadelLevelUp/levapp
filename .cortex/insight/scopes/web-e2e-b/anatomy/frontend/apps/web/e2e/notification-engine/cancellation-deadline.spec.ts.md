---
path: frontend/apps/web/e2e/notification-engine/cancellation-deadline.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 108
size_tokens: 1098
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6072d7cfb533bce24dd7524b24e10807446c9f76b674c2098f43f577d6a2523f"
---

## Purpose

E2E for PAD-45: the coach-facing "cancellation deadline" control in Settings →
Notifications → Restrictions (hours before class start a student may still
cancel, default 24), which round-trips through the existing
`GET|POST /api/app/notify/config` endpoint under
`restrictions.cancellationDeadlineHours`. Two tests: the control defaults to
24, and incrementing it via its "+" stepper button (armed with
`page.waitForResponse` on the auto-save POST containing `"26"` — deliberately
NOT a fixed sleep, since under full-suite load the write didn't always land
before an immediate reload, making the test flaky) persists to 26 across a
full page reload. Reaches the Restrictions accordion by first enabling
auto-notify if the trigger button is disabled.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openSettings`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises
  `GET|POST /api/app/notify/config` in `notification_engine_api.py` /
  `notification_service.py`; covers `.specflow/specs/notifications/config.spec.md`
  (restrictions). Uses `data-testid="settings-nav-notifications"` — see the
  `settings-nav-locator-collisions` project convention (a loose
  `/notifications/i` role+name locator broke after PAD-112 added a second
  matching sidebar label).
