---
id: B-114
title: "Maestro on iOS cannot observe the tactical board mid-playback; AUTO looked dead but plays"
type: test-defect
severity: low
status: triaged
affects:
  - frontend/apps/mobile/.maestro/flows/46-tactical-board.yaml
  - frontend/apps/mobile/.maestro/flows/60-tactical-board-speed.yaml
proposed_fix: "Do not assert playback-ball (or the ■ label) right after ▶ AUTO on iOS. Prove playback in unit tests of the shared clock and timeline (@levelup/config) and on web; if an iOS-observable signal is wanted, add a persistent end-of-playback marker the app keeps after playback."
opened: 2026-09-16T16:44:16Z
---

# B-114: iOS ▶ AUTO looked dead to Maestro; it plays

**Source:** Session E, 2026-09-16, while verifying PAD-310 on the pinned iPhone 17 Pro simulator.
Number from Session E's reserved range (the coordinator asked for it to be filed).

**What was seen (16:18Z-16:31Z):** a Maestro flow drew three basket feeds (a 2400 ms step at
Normal) and tapped `board-auto`. `playback-ball` was never visible, and screenshots taken
"right after" the tap showed "▶ AUTO", not "■". This held on PAD-310's branch and on
`origin/staging`'s `tactical-board.tsx` (fresh `--clear` Metro), tapping by id or by text.

**Localisation (16:33Z-16:44Z, on origin/staging 80a377091 plus temporary instrumentation, since removed):**
- **Runtime logs through Metro:** `startAuto steps=1`, frames advancing (`t=0.16` at 379 ms,
  `t=0.85` at 2030 ms), `frame=null` at 2419 ms, then `stopPlayback`. Playback ran end to end
  on schedule.
- **On-screen counters after the flow's "after" screenshot:** 1 press, 1 start, 80 ticks,
  1 end-of-playback null.
- **Timing:** the "before" screenshot is timestamped 17:40:07 local and the "after" one
  17:40:11. The command between them, `tapOn`, did not return until the screen had settled,
  after playback ended.
- **Settle timeout:** `tapOn … waitToSettleTimeoutMs: 200` (Maestro 2.6.1) still did not
  observe `playback-ball`. The hierarchy query also waits for the app to be idle.

**Conclusion:** not a product defect. On iOS, Maestro's XCUITest driver waits for the UI to
settle before it acts or queries. A 16 ms-interval animation keeps the screen changing, so
every observation lands after playback. Flow 46's `assertVisible: playback-ball` after AUTO
cannot pass on iOS for this reason. It also failed earlier on this date, at `piece-a1`,
before reaching AUTO. That flow may still be meaningful on the Android lane, which was not
measured here.

**What changes:** flow 60 asserts the speed control only and cites this entry. The playback
behaviour itself stays proven where it can be observed: the shared clock and timeline unit
tests in `@levelup/config`, the web component tests with fake timers, and Playwright.
