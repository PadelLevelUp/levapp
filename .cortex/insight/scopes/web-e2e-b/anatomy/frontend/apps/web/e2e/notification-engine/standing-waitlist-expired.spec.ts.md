---
path: frontend/apps/web/e2e/notification-engine/standing-waitlist-expired.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 123
size_tokens: 1388
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "975a4fc34cec9350facff049bddb2b51adcfd81c1765303db26b4e69dbed5fb3"
---

## Purpose

E2E for PAD-110: expired standing-waiting-list entries must be visually
distinguished in Settings → Notifications → Standing waiting list. Root
context: `GET /api/app/notify/standing_waiting_list` filters on `is_active`
only — expiry is enforced lazily, only by the invitation path — so an already
past-`expires_at` entry can be listed with nothing in the UI saying so. The
test seeds its own genuinely-expired row directly through the API rather than
the shared seed script: `POST /notify/standing_waiting_list` derives
`expires_at` from `durationDays` without validating its sign, so passing a
NEGATIVE `durationDays` (-2) backdates it. Asserts the expired row shows an
"expired" label the valid row (durationDays: 30) does not, is de-emphasised
via the app's `text-muted-foreground` token, but keeps its remove/delete
control fully visible, enabled and at full opacity (removing an expired entry
is the obvious next action). Both created entries are deleted in a `finally`
block.

## Connections

- Uses: `helpers/api` (`API_APP`, `API_AUTH`); `helpers/auth` (`loginAsCoach`);
  `helpers/navigation` (`openSettings`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises
  `POST/GET/DELETE /api/app/notify/standing_waiting_list` in
  `notification_engine_api.py` / `notification_service.py`, and
  `frontend/apps/web/src/components/settings/StandingWaitingListSection.tsx`;
  covers `.specflow/specs/notifications/waiting-list.spec.md` rule 11 (expired
  standing entry visual distinction). Reuses the same
  `settings-nav-notifications` testid convention noted in
  `cancellation-deadline.spec.ts`.
