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

## A second family, named 2026-09-12: the assertion that only passes by accident

Not a load flake — worth recording here because it was found in the same sweep and looks
identical from the outside (a red spec on a green product).

The cancellation fix release replaced the per-status attendance badges with one state word.
`e2e/schedule-calendar/attendance-save.spec.ts` then failed on `getByText("Present")`. The
product was right and the spec was stale — but the interesting part is *why the spec ever
passed*: Playwright renders this app in **Portuguese** (see the e2e-web-renders-portuguese
note), so an assertion on the English string "Present" could only ever have matched because
that particular badge had no translation. The test was green for a reason unrelated to the
behaviour it claimed to check, and it went red the moment the string was localised properly.

Same family as a test that passes only while the feature is broken. Two sightings in one day.

**Rule:** assert on `data-testid` and on the state value, never on user-facing text. Where a
test does assert text, treat a sudden failure as a question about the assertion first and
the product second. The replacement ids in this area are `attendance-state` (with the state
value), `attendance-cancelled-by-student` and `attendance-reminder-hint`; the removed ones
were `class-not-attending`, `class-not-attending-at` and `class-proactive-decline`.

## Addendum, 2026-09-16 — the rendered-text family closed out; the new ratchet baseline

The second family named above (the assertion that only passes by accident) has its own
entry now: **B-103**, with both failure modes and the conversion pattern. PAD-320 converted
the rendered-text backlog its guard counted when it landed (#264: 125 assertions, 42 files)
and then widened the guard, because the conversions proved the exact-match scanner was a
floor. This is the baseline the ratchets start from.

**Converted (the original 125).**
- Session C: #308, #310, #315, #320 (batch 2) and the final PR: notification-engine-settings,
  import-history, ticket-pad-105-coach-no-username, class-deletion, mobile-day-view,
  reminder-flow, player-notes, duplicate-username-warning, validation-watermark,
  profile-persistence, semi-auto-approval, class-delete-confirm, attendance-save,
  recurring-occurrence-delete, temp-id-delete-after-save, season-end-no-season, courts,
  season-definition, unavailable-student-notifications, class-overlap-warning,
  standing-waitlist-expired, class-cancellation-notification.
- Session E: #314, #319 (eight files each), #325 (the four Maestro flows 04, 13, 34, 43).

**Widened** (final PR, `e2e-rendered-text-scan.ts`): edge punctuation, `{{placeholder}}`
templates (substantial fixed text, or numeric placeholders only), word-bounded substantial
substrings for substring matchers, and the copy inside anchored / escaped regex literals.
Validated against the old scanner on the same tree before regenerating — nothing previously
counted was lost, every added literal was read, and three false-positive shapes found that
way are pinned by fixture tests ("{{name}}"-only templates, "{{name}} class" claiming test
titles, an input's "e.g." example text).

**Baseline after regeneration and the final conversions** (one guard run wrote all three
lists; counts are the sum of each list's `max` and its entry count):

| List | Before widening (batch 2 head) | Baseline now |
|---|---|---|
| rendered text (`e2e-rendered-text-backlog.ts`) | 14 in 8 files | **52 in 23 files** |
| typed role names (`e2e-role-name-backlog.ts`, PAD-342) | 185 in 53 files | **199 in 55 files** |
| bilingual alternations (`e2e-bilingual-backlog.ts`, PAD-322) | 50 in 32 files | **50 in 32 files** |

The re-grown text entries include files already cleared by the slices — the widened scanner
found copy the old one filed as test data (e.g. `notification-engine-settings` 14,
`import-history` 3: "are you sure", "successfully reverted"). The four `mz:` entries (34 at 6)
are reconciled with #325 by whichever of the two lands second. The regeneration commit's
message overstates each list's file count by one (a counting script matched the
`max: number;` declaration); the table above is the corrected count.

**Still out, on record in B-103:** copy that is in no locale file (B-102's backend prose,
backend constants), text values under three characters (a separate decision), and the regex
forms of `getByPlaceholder` / `getByLabel`. These backlogs are the open remainder — tracked
here, not in an open ticket.

## 2026-09-23 — another `presences-validation` test on the list, extreme sustained load

A scheduled test-health run's full E2E suite (load averaging 250-390 on 8 cores, well past
this ledger's original ≥100 threshold) failed `PAD-191: bulk validation guards every queued
class › classes 2..N are disabled while the run is in flight` once. A `--workers=1` isolated
re-run of all 5 failures from that suite cleared 4/5 (direct-messages, message-timestamp-
timezone, messageable-roster, attendance-save all green alone) but this one failed again —
with a *different* symptom than the first time. A further `--repeat-each=3` of just this test
alone: 1 passed, 2 failed, each at a different assertion (line 67's initial card-visibility
wait once, line 279's final undo-count once). Varying failure locus across repeats on
unmodified code is this ledger's signature for load, not a logic bug (see rule above).

Line 67 already carries the PAD-300 pin (wait for `pending_validation?from=` before asserting
visibility, 15s timeout) — it still lost under today's load, which is a heavier load than the
pin was tuned against, not a missing wait. Line 279 (`await expect(...).toHaveCount(n)`) had
no explicit timeout, unlike every other settle-sensitive assertion in this test (line 275 uses
15_000ms for the identical per-iteration count check two lines above it) — that inconsistency
is fixed in the same PR that adds this note. Recorded here rather than opened as a new ticket:
this is more evidence for the existing "load, no pin" reality of this file, not a new defect.

## 2026-09-23 (Session-B): correction — the undo-count failure is a test race, not load (PAD-412)

The paragraph above is **wrong about line 279**. Re-run at `eb89cfb45` (this branch, with its
15 s timeout) on an isolated stack at load ~19, not 250+: the PAD-191 test failed 1 in 5 **at
line 279 itself**, `Expected 3 · Received 0 · Timeout 15000ms`. An instrumented 20× repeat on
staging `8dc17185d` found the cause: the queue response had arrived (`pending=0 validated=3`),
yet at the undo loop's start the page showed `undo=0 cards=0`, so the loop's instant guard
`(await undoAfter.count()) > 0` skipped every undo; 1.5 s later `undo=3`. `PresencesPage.loadQueue`
renders the "validated this week" list only after BOTH the list and the count requests resolve.
A 2×2 with a trigger that delays `/pending_validation/count` 3 s: the old loop fails with the exact
symptom, the fixed loop (wait for `undoAfter.nth(n - 1)` first) passes 3/3; untriggered, both pass.
A longer timeout on the final count cannot help — nothing is ever undone. Tracked as **PAD-412
(B-176)**. The same diagnosis surfaced a separate, user-visible race (stale queue state after two
quick undos): **PAD-413 (B-177)**. #405 is superseded (Coordinator ruling D126).
