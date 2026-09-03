---
path: frontend/apps/web/e2e/notification-engine/auto-reminder.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 3
size_lines: 387
size_tokens: 4054
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "fafbe65e4388dc9abf7c5b580029fa37c5757adb94f0ffe1f8aa81fda3c1d93d"
---

## Purpose

Full end-to-end proof of the AUTOMATIC, scheduler-driven class-reminder
pipeline with NO manual trigger anywhere in the flow — the only test in this
scope that actually waits for a real APScheduler job to fire rather than
calling a manual send endpoint. It also carries the core PAD-37 regression
assertion: the delivered reminder text must render from the coach's CUSTOM
message template, never the hardcoded default.

## Main players

- `getToken` (lines 49-60) — supporting. Login helper, local to this file
  (not the shared `helpers/auth`, since this file is API-first and only uses
  the `Page` for one optional UI smoke step).
- `setCoachConfig` (lines 63-76) — supporting. `POST /notify/config` wrapper.
- `pollForReminderMessage` (lines 83-140) — critical. Polls a student's
  `/conversations` → `/conversation/{id}` for a `messageType ===
  "notification_reminder"` message tagged with the target
  `lessonInstanceId`, with a progressive 2s→5s backoff, up to `maxWaitMs`.
  Returns the delivered message TEXT (not just a boolean) so the caller can
  assert on template rendering.
- `getNotificationActivity` (lines 143-152) — supporting. Wraps
  `GET /notify/activity`.
- `coachLoginUI` (lines 158-165) — supporting, UI-only. Logs in through the
  real `/auth` page (not the API) for the final informational UI check —
  language-agnostic selectors since pre-auth renders in the default pt
  locale.
- The single test (lines 172-386) — critical. Six numbered steps: (1) set
  `autoNotifyEnabled: true`, `firstReminder: 48h`, and a distinctive
  `"PAD37-CUSTOM..."` template, then verify the GET echoes it back; (2) call
  the E2E-only debug endpoint `POST /notify/debug/schedule_reminder_test`
  with `secondsUntilReminderFires: 45`, which creates a `LessonInstance` at
  (now + 48h + 45s) with 2 students enrolled and arms the real reminder job;
  (3) `await new Promise(setTimeout(msToWait))` — an actual wall-clock wait
  for the scheduled job to fire, not a mock; (4) poll both students for their
  reminder message; (5) assert the delivered text for BOTH students contains
  the `"PAD37-CUSTOM reminder for"` marker and has NO leftover `{token}`
  placeholder — the core regression check; (6) verify the coach sees the
  reminder in ≥2 of their own conversations via `/conversations`; (7) an
  OPTIONAL, best-effort UI smoke check of the coach's Messages page, wrapped
  in try/catch so a slow-HMR UI hiccup never fails the test — the functional
  proof already stands on steps 4-6.

## Insights

- The test has a 3-minute Playwright timeout (`SECONDS_UNTIL_FIRE` + buffers
  + polling + UI nav) — one of the longest-running specs in the E2E suite,
  and it is inherently non-deterministic in WALL-CLOCK terms even though its
  assertions are deterministic; a slow CI box could plausibly blow the
  budget.
- `SECONDS_UNTIL_FIRE = 45` is deliberately `>= 30` "so APScheduler has time
  to pick up the job before it fires" — a documented minimum, not an
  arbitrary value; shortening it risks a flaky false pass/fail cliff.
- The debug endpoint requires BOTH the `E2E_DEBUG_ENDPOINTS` flag AND a JWT
  (PAD-92 tightened it) — the failure message explicitly asks "is
  E2E_DEBUG_ENDPOINTS set?" if the call 404s/403s, doubling as inline runbook
  documentation for the next person debugging a red run.
- `/conversations` is paginated (`{ conversations, hasMore }`), not a bare
  array — every helper here (and the sibling `blank-template-fallback.spec.ts`)
  destructures accordingly; a naive `.map` on the raw response would silently
  break.
- Step 6's assertion is on MESSAGE records (`messageType ===
  "notification_reminder"`), explicitly NOT `NotificationEvent` rows — the
  comment clarifies those are for the separate invitation/vacancy flow, a
  distinction that trips up anyone assuming "notification activity" is one
  unified table.

## Connections

- Uses: `helpers/api` (`API_APP`, `API_AUTH`). (Scope `web-e2e-a`.) All other
  helpers (`getToken`, `setCoachConfig`, `pollForReminderMessage`, etc.) are
  local to this file.
- Used by: — (Playwright entry point; none of its exported helpers are
  imported by another file in `edges_within_scope`, though
  `blank-template-fallback.spec.ts` independently re-implements a near-identical
  `getToken`/`setCoachConfig`/poll-loop pattern against the same endpoints).
- Semantically related (not imports): drives
  `backend/padel_app/services/notification_service.py`'s APScheduler reminder
  job (`_run_send_reminders`), the
  `POST /api/app/notify/debug/schedule_reminder_test` debug route, and
  `POST /api/app/notify/config`'s `messageTemplates.reminder` rendering path
  in `notification_engine_api.py`; covers
  `.specflow/specs/notifications/reminders.spec.md` and
  `.specflow/specs/notifications/message-templates.spec.md` (PAD-37 custom
  template rendering).

## Query pointers

- If you need to change reminder-timing or template config shape, also read:
  `blank-template-fallback.spec.ts` (same config surface, blank-template
  fallback case) and `semi-auto-approval.spec.ts` (same `reminderTiming`
  object shape, different `invitationMode`).
- If you need to understand the debug-endpoint contract
  (`schedule_reminder_test`), read first: this file's Step 2, then:
  `reminder-flow.spec.ts`'s US-REM-08 test, which uses the same endpoint with
  a much larger `secondsUntilReminderFires` so the job never actually fires
  mid-test.
