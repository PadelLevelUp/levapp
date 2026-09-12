---
id: B-089
title: "Android: a portal dialog can be drawn without its React component, or dimmed without its content"
type: incomplete-rule
severity: high
status: open
affects:
  - mobile.android-runtime
  - frontend/apps/mobile/src/components/ui/dialog.tsx
  - frontend/apps/mobile/src/components/ui/alert-dialog.tsx
  - frontend/apps/mobile/app/verify-email.tsx
proposed_fix: "PAD-314: find where the Android view tree and the React tree diverge for portal-rendered surfaces, and make the transition remount rather than move (or split it across commits). Regression test: three dialogs mounted, open the third, assert its confirm acts."
opened: 2026-09-12T11:45:00Z
---

# B-089 — Android: a portal dialog can be drawn without its React component

**Source:** PAD-304's Android lane (runs 34683096399, 34687035240, 34690202946) and Session I's
flow 44 run. Session F. Fix tracked as **PAD-314**; PAD-323 was folded into it.

**What happens:** on Android, what is drawn and what React thinks is mounted come apart, in
three observed shapes. All are intermittent, all involve surfaces rendered through
`@rn-primitives/portal`.

1. **Blank surface.** After the email verification code is accepted, the app's window contains
   only the system bars around an empty content frame and the screen is white. The device log
   names it one second after the code is typed: `SurfaceMountingManager` throws
   `addViewAt: cannot insert view [2614] into parent [2642]: View already has a parent`,
   followed by two unhandled soft exceptions from `ReactHost`. Nothing mounts afterwards.
2. **Content without a component.** In `34-player-removal` the remove dialog's Cancel button is
   tapped, Maestro reports the tap completed at the button's centre, and the dialog is still
   drawn five seconds later. It is not that the dialog ignores input — a dialog that is open
   registers a `hardwareBackPress` handler, and a back press was **not** consumed: it reached
   the navigator and popped the whole screen, taking the "dialog" with it. Tapping the screen's
   own back button, behind the dialog, also works and pops the screen. So touches reach the
   live screen underneath and the pixels on top answer to nothing.
3. **Overlay without content.** In `03-class-management` the new-class form is uniformly dimmed
   — a dialog overlay is drawn — while the accessibility tree captured at that instant contains
   the form and no dialog at all: no overlay node, no buttons. The save is blocked because the
   confirmation it waits for never appears. No mounting exception in that run's log.

**What should happen:** a dialog is either mounted and interactive, or gone. The Android view
tree follows the React tree.

**Root cause:** not established. *Inferred, untested:* Fabric fails to apply part of a mount
transaction for portal-hosted surfaces — inserting content whose view is still attached
elsewhere (symptom 1, which is the only one with an exception), and leaving views behind or
unmounted when the portal's children change (symptoms 2 and 3). Symptom 1's trace is the only
direct evidence; 2 and 3 are inferred from behaviour and from the accessibility tree
disagreeing with the screen. **PAD-314 must confirm the mechanism before the fix is called
done**, and must check iOS: Fabric is the architecture on both shells, and iOS may simply be
tolerating what Android refuses. If iOS is affected, this is live for every user today.

**Not caused by recent work:** symptom 3 appeared on a head where only a Maestro YAML file had
changed, and flow 03 had passed on the three runs before it.

**Impact:** blocking for the Play track — no Android release ships over an unreliable dialog
layer. On iOS, unconfirmed.

### Change Plan

**Spec:** `mobile.android-runtime` — extend rule 9 (portalled surfaces reachable by touch and
accessibility) or add a rule that the drawn surface and the mounted component agree. Rule
number from the coordinator.

**Code:** PAD-314, once the divergence is located.

**Test:** a regression test that fails against today's code — three dialogs mounted on one
screen, open the third, assert its confirm button acts — plus the Maestro flows below, which
work around the defect today and must be simplified when it is fixed:
`34-player-removal` (returns by whichever route the app leaves open) and
`16-class-notify-remind` (falls back to the dialog's close control).

### Resolution

Open.
