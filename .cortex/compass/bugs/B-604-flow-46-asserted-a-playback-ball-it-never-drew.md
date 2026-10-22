---
id: B-604
title: "Maestro flow 46 asserted the AUTO playback ball on a board with no ball path, so the assertion could never pass on any platform"
type: test-defect
severity: low
status: resolved
resolved: 2026-10-22T08:40:00Z
affects:
  - frontend/apps/mobile/.maestro/flows/46-tactical-board.yaml
proposed_fix: "Draw one ball path on the added step before AUTO (Bola, tap A1, tap B1), then wait for playback-ball; Slow 0.5x on Android widens the window."
opened: 2026-10-22T08:15:00Z
---

# B-604: flow 46 asserted a playback ball it never drew

**Source:** the Android lane. #803's changed job (run 39729251137) and #805's first run (39741894621) both failed at `id: playback-ball is visible`. Slowing playback to 0.5× did not help, which ruled out a timing window.

**Root cause:**
- `boardAddStep` (`packages/config/src/court-diagram.ts`) adds `newStep()` = `{ id, movements: [] }`, so the new steps have no ball paths.
- `interpolateStep` sets the frame's `ball` only when `stepBalls(step).length > 0`.
- `court-surface.tsx:207` draws `playback-ball` only when that ball is set.
- Flow 46's wave-4 block added a step, pressed Passo and AUTO, and asserted the ball without drawing a path. Its header said path drawing wasn't observable from Maestro.

**So:**
- No product defect: with no path there is nothing to animate, by design.
- The flow could not be green on iOS either, so its iOS-confirmed label for that block was wrong.

**Fix (PAD-710, batch 5):**
- Before Passo, the flow picks Bola and taps `piece-a1`, then `piece-b1`. In Situações de jogo, the ball tool makes a path between two court taps, and a tap on a piece passes its point to the board. It then asserts `ball-path-flat`.
- `playback-ball` is awaited with `extendedWaitUntil` (8 s), because it moves only during step 2.
- On Android, Slow 0.5× before AUTO doubles step 2's 800 ms.
- Deleting step 2 afterwards removes the path, so the later waves see the same board as before.
- Android proof: the changed job. iOS: the next simulator slot.
