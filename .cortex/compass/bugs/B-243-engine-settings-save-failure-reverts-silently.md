---
id: B-243
title: "Notification-engine settings: a failed save reverts the control silently, to a stale copy"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - notifications.config
  - settings.save-on-change
  - frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx
  - frontend/apps/mobile/src/features/settings/auto-invite-section.tsx
proposed_fix: "settings.save-on-change rule 3: a failed save says so beside the control and returns it to the last value the server confirmed, tracked in response order."
opened: 2026-10-02T08:53:08Z
---

# B-243: an engine setting that fails to save snaps back without a word

**Source:** PAD-473 survey (Session-C, 2026-10-01), reproduced 2026-10-02.

**What happens:** every autosaving control in the notification-engine card (web
`NotificationsEngineSection`, iOS `AutoInviteSection`) goes through one `save()`. On a failed
`POST /api/app/notify/config` the control flips back and nothing is shown, so a coach who looked away
believes the change was stored. The web revert is `setConfig(config)` (`NotificationsEngineSection.tsx:59`),
the closure copy from the render that started the save: with two saves in flight it can restore a value
older than the last one the server confirmed. iOS keeps `previous` the same way
(`auto-invite-section.tsx`, `save`).

**What should happen:** the failure is visible beside the control, and the control shows the last value
the server confirmed.

**Evidence:** Playwright probe on an isolated stack (staging `ede25052e` base): `page.route` answers the
POST with 500; the master toggle went `checked` → click → `checked` again, `POST 500` observed, zero
`role=alert` and zero toast. Code read for the stale-copy path (`:48-60`).

**Root cause (diagnostic tree):** `notifications.config` covers what each setting stores, but no rule
says what a coach sees when an on-change save fails. Type 2, incomplete rule: the new
`settings.save-on-change` rule 3 supplies it.

### Change Plan
- Spec: `settings.save-on-change` rule 3 (+ criterion with two overlapping saves, the first failing after
  the second succeeded); `notifications.config` cites it.
- Code, both clients: a `confirmed` snapshot updated on each successful response, in response order; a
  failure rolls back only the failed patch's keys from it, functionally, and shows the sign's failure
  state for that control.
- Tests red first on each client.

### Resolution
_Pending (PAD-473 PR 2)._
