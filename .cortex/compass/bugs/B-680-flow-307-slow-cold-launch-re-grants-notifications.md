---
id: B-680
title: "Flow 307: a slow cold launch sends login.yaml into its clearState relaunch, which re-grants notifications after the wrapper's deny"
type: test-defect
severity: medium
status: resolved
affects:
  - frontend/apps/mobile/scripts/push-grant-flow.sh
  - frontend/apps/mobile/.maestro/flows/307-push-grant-without-restart.yaml
  - frontend/apps/mobile/.maestro/subflows/login.yaml
proposed_fix: "The wrapper runs a clearState prep flow that waits for the login screen before the deny, then checks that the deny took; flow 307 always starts warm and signed out."
opened: 2026-10-23T13:51:37Z
resolved: 2026-10-23T15:03:07Z
---

# B-680: flow 307 goes red when a slow cold launch makes login.yaml clear the app's state

**Source:** la-2110-SessionE, promotion 21's iOS gate (staging 01125fb09, simulator 180A9433,
`scripts/push-grant-flow.sh`, 2026-10-23). Linear PAD-752.

**What happens:** run 1 failed at `Assert that id: notifications-banner-enable is visible`
(21 COMPLETED / 1 FAILED / 3 SKIPPED, exit 1). The thread was open and showed no blocked banner.

**What should happen:** the wrapper denies notifications, and the student sees the blocked banner
on the thread, whatever the machine load and whoever was signed in before.

**Root cause (observed):**
- The cold first launch reached the dashboard at `dashboard-mounted t=16926ms` (load average 33).
  `login.yaml` waits 15 s for `login-username`, missed it, and ran `launchApp clearState: true`
  ("Launch app … with clear state… COMPLETED" in run 1's log).
- That relaunch re-granted notifications. SpringBoard's `VersionedSectionInfo.plist` entry for
  `com.padellevelup.app` decoded to `authorizationStatus 2` (authorized). The file was written at
  13:50:57Z, after the wrapper's deny at 13:49Z. With notifications allowed, there is no banner.
- Run 2, straight after, started signed in, took the logout branch (no clearState) and passed
  51 / 0 / 4.
- The spec (`messaging.push-notifications` rule 15) and the app are right. The harness depended on
  launch time and on the start state, so the type is a test defect. The step count also depended on
  the start state: 44 signed out, 51 signed in (login.yaml's logout branch adds 7).

### Change plan (applied)

**Test:** `frontend/apps/mobile/scripts/push-grant-flow.sh` and the new
`frontend/apps/mobile/.maestro/subflows/push-grant-prep.yaml`.
1. Before the deny, run the prep subflow: a `clearState` launch, then wait up to 180 s for
   `login-username`. That builds the bundle and leaves the app signed out. clearState leaves
   notifications authorized, so it runs before the deny, never after it.
2. Deny with applesimutils, then read `authorizationStatus` back and stop unless it is 1 (denied).
3. Run 307. If it fails, print the status again, so a re-grant is named instead of showing up as a
   missing banner.
`login.yaml` is unchanged: every other flow uses it.

### Resolution

- Spec changes: none (rule 15 is right).
- Tests:
  - the prep subflow and the wrapper changes;
  - 307's header and the Maestro README record the expected reading: 307 itself 44 / 0 / 4 / 3
    WARNED, plus 2 for the prep flow.
- Evidence: two runs on the fix at staging 01125fb09, fresh DB at `7a294b4a5a9c (head)`.
  - Cold: Metro started with `--clear`, no prewarm. 46 COMPLETED / 0 FAILED / 4 SKIPPED / 3 WARNED,
    exit 0.
  - Warm: an immediate rerun from 307's end state (signed in, notifications allowed). Same counts,
    exit 0.
  - The two step lists match line for line, and the deny read back as 1 both times.
  - The PAD-744 evidence holds: `[push] notification permission not granted`, then
    `[push] skipping registration: not a physical device` on the return, with no new `fonts-ready`
    between them.
- Resolved: 2026-10-23 (PR into staging for PAD-752).
