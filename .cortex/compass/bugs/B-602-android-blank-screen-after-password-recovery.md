---
id: B-602
title: "Android: after password recovery signs the user in, the window stays blank (Fabric addViewAt 'View already has a parent'), a new face of B-089"
type: incomplete-rule
severity: high
status: resolved
affects:
  - mobile.android-runtime
  - frontend/apps/mobile/app/forgot-password.tsx
proposed_fix: "Apply B-089 face C's resolution (remount rather than move, or split the transition across commits) to the recovery → dashboard path; regression guard: flow 28 (or a rate probe like 51)."
opened: 2026-10-21T21:34:00Z
resolved: 2026-10-23T20:30:00Z
---

# B-602: blank surface after password recovery on Android (id unconfirmed, wave 16 range)

**Source:** Android nightly lane run 39666441295, shard 4, flow `28-password-recovery`. It asserts
`screen-dashboard` visible after a successful recovery.

**What happened:**
- flask.log shows the recovery confirm, then `/auth/me` and `/app/dashboard`, all 200.
- The window stayed blank: the tree held only `action_bar_root/content`.
- `full-logcat.txt` has 14 `SurfaceMountingManager … addViewAt: cannot insert view [302] into parent
  [330]: View already has a parent` lines at 21:04:41, inside flow 28's run (21:03:52–21:05:06).

**Root cause:**
- This is the B-089 mounting signature.
- B-089 face C (post-verification transition) was resolved in PAD-314. This is the recovery →
  signed-in transition, which that fix did not cover.
- Seen 1/1. The rate is unknown.

**Ticket:** PAD-717. Flow 28's password restore moved to `onFlowComplete` in the PAD-710 follow-up,
so a failure no longer poisons the next flow's login (36).

### Resolution (PAD-717, Session D, 2026-10-23)

**Cause, confirmed in code:**
- The recovery screen copied verify-email's drawn-cells code input in PAD-139 (8fe0dd83c, 9 Sep).
- PAD-314's face C fix (0f8fe6444, 16 Sep) changed only `verify-email.tsx`.
- So `forgot-password.tsx`'s `submit()` still ran `finally { setSubmitting(false) }` in the commit that replaces the screen. That restyled all six cells (`submitting && "opacity-50"`), which is face C's mechanism.
- The type is a code violation of `mobile.android-runtime` rule 10, which already said a screen does not restyle itself in the commit that removes it. The rule was right; the second screen did not follow it.

**Fix:**
- `forgot-password.tsx`: `submitting` is reset only on a failure, the same as PAD-314.
- A grep found no third copy of the drawn-cells input.
- Rule 10 now names the recovery screen and has a criterion; flow 28 is the guard.
- Flow 28 takes a screenshot of the dashboard it lands on.
- `android-build.yaml` now uploads flows' named screenshots, which landed in `.maestro/` and were never uploaded.

**Evidence (flow 28 alone, by dispatch, junit read per run):**
- Before, run 40008693359 (staging plus the screenshot step only): `status="ERROR"`, "Assertion is false: id: screen-dashboard is visible". `full-logcat.txt` has `addViewAt: cannot insert view [302] into parent [330]: View already has a parent` at 19:29:58. Reproduced 1/1.
- After, runs 40008699101, 40008703407 and 40008708542 (fix 725dc9eb1): `status="SUCCESS"` 3/3, with zero "already has a parent" lines.

