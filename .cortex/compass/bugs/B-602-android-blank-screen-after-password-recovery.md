---
id: B-602
title: "Android: after password recovery signs the user in, the window stays blank (Fabric addViewAt 'View already has a parent'), a new face of B-089"
type: incomplete-rule
severity: high
status: open
affects:
  - mobile.android-runtime
  - frontend/apps/mobile/app/forgot-password.tsx
proposed_fix: "Apply B-089 face C's resolution (remount rather than move, or split the transition across commits) to the recovery → dashboard path; regression guard: flow 28 (or a rate probe like 51)."
opened: 2026-10-21T21:34:00Z
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
