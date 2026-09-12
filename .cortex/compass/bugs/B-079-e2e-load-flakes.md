---
id: B-079
title: "E2E load flakes: specs that pass alone and fail under batch-time load (≥100, iCloud sync)"
type: test-defect
severity: low
status: triaged
affects:
  - frontend/apps/web/e2e/attendance/presences-validation.spec.ts
  - frontend/apps/web/e2e/dashboard/validation-count.spec.ts
  - frontend/apps/web/e2e/dashboard/dashboard-i18n.spec.ts
  - frontend/apps/web/e2e/player-management/add-player.spec.ts
  - frontend/apps/web/e2e/settings/language-preference.spec.ts
  - frontend/apps/web/e2e/schedule-calendar/class-delete-confirm.spec.ts
  - frontend/apps/web/e2e/schedule-calendar/class-deletion.spec.ts
  - frontend/apps/web/e2e/players/keyboard-card-activation.spec.ts
proposed_fix: "Pin only where a wait-for-settle makes the spec deterministic (wait for the fetch the UI depends on, then assert); never loosen an assertion; record the rest as 'load, no pin'."
opened: 2026-09-11T22:00:00Z
---

# B-079 — E2E load flakes (the list, PAD-300)

**Source:** batch 3 and batch 4 suites (Session E), F's #217 targeted set, and Session I's
PAD-148 hardening, all on 2026-09-11 with the machine's 1-minute load ≥100 (iCloud Drive
syncing the worktrees under ~/Documents plus parallel Playwright and Maestro runs). Every
spec below is green alone on the same code; "alone-pass" counts are the evidence that the
code is right and the spec's wait is wrong.

**The model fix (PAD-148, #207):** the players keyboard spec returned as soon as a matching
card was visible — which the UNFILTERED first page already satisfied — so the debounced
server-side search fetch landed mid-test, re-rendered the list and dropped focus. The pin:
wait for THAT fetch (`waitForResponse` on `coach_players?…search=`), prove the list settled
on the result, then assert. Assertions untouched; 6 repeats × 3 parallel workers green.
Every pin below follows that shape.

| Spec | Symptom under load | Alone | Pin (PAD-300) |
|---|---|---|---|
| `attendance/presences-validation` (×2 in batch 3, ×2 in batch 4) | empty card list after "previous week" | 8/8, 9/9 | wait for the previous week's `pending_validation?from=` response before reading cards |
| `dashboard/validation-count` (batch 3, batch 4) | card list empty / English nav | 8/8, 1/1 | wait for the tab's `pending_validation?from=` response before counting |
| `dashboard/dashboard-i18n` (batch 4) | English leftovers after the switch | 9/9 | wait for `PATCH /auth/me` 200 before the toast and the nav assertions |
| `settings/language-preference` nav switch >5 s (batch 3) | nav still English | 2/2 | same `PATCH /auth/me` wait |
| `settings/language-preference` — browser crash (batch 4) | Chromium died mid-test | 2/2 | **load, no pin** — nothing in the spec can settle a crashed browser |
| `player-management/add-player` US-35 (batch 4) | "New E2E Player" not visible in 8 s | 3/3 | wait for the `coach_players?…search=` response (PAD-148 shape) |
| `schedule-calendar/class-delete-confirm` PAD-24/58 (batch 3) | loading state not observed | 3/3 | replace the fixed 800 ms after "Create class" with the `add_class` + calendar refetch responses |
| `schedule-calendar/class-deletion` (F, two-worker folder run) | hangs walking weeks for a class not drawn yet | 2/2 twice | same create + refetch wait |
| `players/keyboard-card-activation` PAD-148 | focus lost mid-Tab-loop | 8/8 | **fixed in #207** (the model above) |

**Rule for the next one:** a flake that passes alone is a missing wait, not a loose assertion.
Find the fetch the UI depends on, `waitForResponse` it, prove the list settled, assert the
same thing as before. `waitForTimeout` is never a settle. A crash under load stays on this
list as "load, no pin" until the machine is quiet enough to tell.

## Batch 6, 2026-09-12 09:30-10:23 (Session E): 36 failures, 21 files, all green alone

The four shards ran at load 360 with ~14 MB free memory and no peer suite running — the
pressure was the concurrent sessions themselves. Shard 4 finished clean in 9.8 min; shards
1-3 took 36-50 min for the same work and failed 36 tests across 21 files. Every one passed
in an isolated rerun on the same commit at load 21-26.

Signature worth recognising again: `locator.click` / `locator.fill` timeouts scattered across
unrelated features, plus `Target page, context or browser has been closed` and ENOENT while
Playwright wrote its own artifact zips. The last two only appear under memory exhaustion. A
real regression clusters on one code path instead (batch 4: three caplog asserts in
test_pad294_push_sender_review; batch 5: the presences/validation pair).

Files that failed under load and passed alone (tests in the isolated rerun):

| File | Tests green alone |
|---|---|
| e2e/attendance/presences-validation.spec.ts | 7 |
| e2e/class-requests/class-request-booking.spec.ts | 1 |
| e2e/dashboard/validation-count.spec.ts | 1 |
| e2e/editor/editor-i18n.spec.ts | 2 |
| e2e/evaluation-tools/eval-categories.spec.ts | 2 |
| e2e/evaluation-tools/evaluation-persist.spec.ts | 1 |
| e2e/evaluation-tools/player-notes.spec.ts | 2 |
| e2e/exercise-management/browse-exercises.spec.ts | 2 |
| e2e/exercise-management/exercise-crud.spec.ts | 4 |
| e2e/import-history/import-history.spec.ts | 6 |
| e2e/notification-engine/eligibility-class-override.spec.ts | 1 |
| e2e/notification-engine/eligibility-manual-add.spec.ts | 2 |
| e2e/notification-engine/manual-notify-selection.spec.ts | 3 |
| e2e/notification-engine/notification-config.spec.ts | 4 |
| e2e/notification-engine/reminder-flow.spec.ts | 8 (full file: it hid a real regression in batch 4) |
| e2e/player-management/player-side-both.spec.ts | 1 |
| e2e/player-management/ticket-pad-105-coach-no-username.spec.ts | 4 |
| e2e/schedule-calendar/attendance-reminder-signal.spec.ts | 1 |
| e2e/schedule-calendar/attendance-save.spec.ts | 2 |
| e2e/schedule-calendar/attendance.spec.ts | 1 |
| e2e/schedule-calendar/class-management.spec.ts | 4 |

Totals: 59 tests rerun, 59 passed, in 4.5 minutes of isolated running against 128 minutes of
starved shard time. Recorded by Session E at the coordinator's request so the pattern lives
in the ledger rather than in one session's head.
