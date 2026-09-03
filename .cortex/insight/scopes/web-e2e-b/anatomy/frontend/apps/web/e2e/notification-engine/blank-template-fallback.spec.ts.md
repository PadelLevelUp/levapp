---
path: frontend/apps/web/e2e/notification-engine/blank-template-fallback.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 3
size_lines: 238
size_tokens: 2457
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a5ecf34c13c36c2e0e171f89e5f391d0cb77caba600dcf8b76d869fc77b2a02e"
---

## Purpose

Regression proof for PAD-67: a coach's blank/whitespace-only message template
must never result in an actually-empty delivered message (chat bubble or push
notification). Reproduces the exact reported "no template defined" state —
saving `reminder_declined: "   "` — then drives the real scheduler-fired
reminder → decline → automatic-confirmation pipeline to prove the fallback
lands on the built-in default text, not silence.

## Main players

- `getToken` (lines 40-49), `setCoachConfig` (lines 51-64) — supporting,
  identical in shape to `auto-reminder.spec.ts`'s local helpers (not shared —
  each file redefines its own copy).
- `getAllMessages` (lines 74-94) — critical. Flattens every message across
  every one of a user's conversations into one array sorted by ascending
  `id`, so later helpers can reason about message ORDER (which message came
  "after" the reminder) without per-conversation bookkeeping.
- `pollForMessage` (lines 97-112) — critical. Generic predicate-based poll
  over `getAllMessages`, reused for both "find the reminder" and "find the
  post-decline confirmation" waits in the single test.
- The single test (lines 115-236) — critical, 5 steps: (1) save
  `reminder_declined: "   "` (whitespace-only) alongside a normal custom
  reminder template and `autoNotifyEnabled: true`; (2) THE core contract
  check — `GET /notify/config` must hand back a RESOLVED, non-blank
  `reminder_declined` (the settings UI must never render an empty textarea for
  an "uncustomised" key), and this is asserted for EVERY key in
  `messageTemplates`, not just the one under test; (3) schedule + wait for a
  real reminder to fire (45s, same debug endpoint as `auto-reminder.spec.ts`);
  (4) student receives the reminder and declines (`action: "no"`); (5) the
  resulting automatic confirmation message must be non-blank AND must equal
  one of the two known BUILT-IN DEFAULT strings
  (`DEFAULT_DECLINED_EN`/`DEFAULT_DECLINED_PT`) — not just "not empty", but
  specifically the real fallback text — and a final sweep asserts NO message
  produced by this flow (by id, scoped past the reminder to avoid unrelated
  soft-deleted messaging-spec fixtures) is empty.

## Insights

- The `finally` block resets `messageTemplates: {}` on the coach specifically
  "so later specs don't inherit this coach's templates" — an explicit
  acknowledgment that coach config is GLOBAL, shared-DB state across the
  whole suite, not per-test-isolated; every notification-engine spec that
  mutates `messageTemplates`/`reminderTiming` carries an equivalent cleanup
  obligation (see `proactive-decline.spec.ts`'s
  `restoreReminderTiming`/`resetStudentPresence` pattern for the same
  concern applied to a different config field).
- Step 2's "every key in `messageTemplates` must be non-blank" assertion is
  broader than the PAD-67 bug report itself (which was specifically about
  `reminder_declined`) — a deliberately wider regression net around the whole
  blank-template-fallback mechanism, not just the one reported key.
- Accepting BOTH `DEFAULT_DECLINED_EN` and `DEFAULT_DECLINED_PT` as valid,
  with a comment noting "the seeded e2e coach is `en`, but accept either so
  the assertion survives a seed change" — a deliberate hedge against future
  seed-locale changes rather than a locale bug in the app itself.

## Connections

- Uses: `helpers/api` (`API_APP`, `API_AUTH`). (Scope `web-e2e-a`.) All other
  helpers are local to this file.
- Used by: — (Playwright entry point; not imported elsewhere)
- Semantically related (not imports): exercises the same
  `notification_service.py` reminder-job + `respond_reminder` decline path as
  `auto-reminder.spec.ts`, plus the template-resolution fallback (stored
  blank → resolved built-in default) that `GET /notify/config` performs;
  covers `.specflow/specs/notifications/message-templates.spec.md` (blank-template
  fallback rule) and `.specflow/specs/notifications/reminders.spec.md`.

## Query pointers

- If you need to change how `messageTemplates` resolve/fall back, also read:
  `auto-reminder.spec.ts` (custom-template rendering, the positive case this
  file's negative case complements).
- If you need the reminder→decline→auto-confirmation message SEQUENCE, read
  first: `getAllMessages`/`pollForMessage` here, then:
  `respond_reminder`'s decline branch in `notification_service.py`.
