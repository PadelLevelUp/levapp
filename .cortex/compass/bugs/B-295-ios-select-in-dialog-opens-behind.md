---
id: B-295
title: "iOS: a Select inside a Dialog opened its list behind the dialog, and its options were unreachable"
type: missing-criterion
severity: medium
status: resolved
affects:
  - frontend/apps/mobile/src/features/players/waiting-list-dialog.tsx
  - frontend/apps/mobile/src/components/ui/dialog.tsx
proposed_fix: "No Select inside a Dialog: the waiting-list dialog's presets are chips; a picker inside a dialog renders through a PortalHost inside the dialog overlay (DialogContent innerPortalHost)."
opened: 2026-10-03T15:49:57Z
resolved: 2026-10-03T15:49:57Z
---

# B-295: a Select inside a Dialog opened behind it (iOS)

**Source:** PAD-507's Maestro flow 157 on the simulator, 2026-10-03.

**What happened:** the standing waiting-list dialog chose its duration in a Select. On iOS, tapping it drew the list BEHIND the dialog: only the options below the panel showed ("6 months", "12 months"), none tappable through it. The duration select had been like this since the dialog was ported (no flow ever opened it), so on iOS the coach could only ever add with the default duration.

**Root cause, in two layers (2×2 on the simulator, bundle verified each time):**
1. Both the Dialog and the Select render into the root PortalHost; the Dialog's overlay draws above the Select's list.
2. With a PortalHost inside the dialog's full-screen overlay, the list draws on top, but its options are absent from the accessibility tree (`maestro hierarchy`: no option elements). The dialog panel is the modal accessibility container, so anything outside it is invisible to VoiceOver and Maestro.

A zIndex on the Select overlay was tried first; that run was void because Metro had missed the file rewrite (the bundle grep showed the old code). It was not retried, because layer 2 makes a list outside the panel unusable anyway.

**Scope:** this was the only Select inside a Dialog in the iOS app (a scan of every `<SelectContent>` between `<DialogContent>` tags).

### Resolution
- The presets are chips (`waiting-list-preset-<key>`, as web's pills), so no Select sits inside the dialog.
- `DialogContent` takes `innerPortalHost`, a PortalHost inside its overlay. The dialog's date picker renders there, above the panel; its own dialog is then the top-most modal container and is reachable. Flow 157 opens and cancels it.
- The `waiting-list-duration` test id is gone; nothing referenced it.
