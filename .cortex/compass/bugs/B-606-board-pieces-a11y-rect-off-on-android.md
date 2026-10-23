---
id: B-606
title: "Android: the tactical board's pieces, badges and handles reported their accessibility rect off from where they were drawn (growing with x), so taps aimed at them missed"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-22T09:50:00Z
affects:
  - frontend/apps/mobile/src/features/training/board/court-surface.tsx
  - .specflow/specs/training/tactical-board.spec.md
proposed_fix: "Draw every board shape at absolute coordinates (cx/cy, text x/y, offset points) instead of inside a translated <G x y>."
opened: 2026-10-22T02:31:00Z
---

# B-606: board shapes' accessibility rects were off on Android

**Source:** the Android lane, PAD-728.
- Flow 41 tapped `ball-style-handle-1`, landed on the court, and added a ball (#785, run 39706883004).
- Flow 59 tapped `piece-a2` and missed, so no leg was made (#803, run 39729251137).

**Measured:**
- A1's reported centre x was 433 px against the drawn 398 (~35 px off).
- A2's was 701 against 634 (~67 px off), more than the ~58 px hit radius.
- The error grows with x. The app's hit radius (≥22 pt) was fine; the tap point was wrong.

**Root cause:**
- `court-surface.tsx` positioned each piece, order badge, ball-number badge and style handle as a `<G x={…} y={…}>` around shapes drawn at the origin.
- react-native-svg on Android reports such a group's accessibility rect with the translation mis-scaled. Paths drawn at absolute coordinates (the ball paths) were reported correctly, which is why flow 41's workaround of tapping the path worked.
- TalkBack and Maestro both aim at that rect. No rule said what the rect had to match: an incomplete rule.

**Fix (PAD-728):**
- Every shape is drawn at absolute coordinates, and the `<G>` keeps only its testID.
- Flow 41's Android workaround is gone: it taps the handle on both platforms. Flow 59 names itself as the guard.
- `court-surface.geometry.test.ts` fails on the old source (2/2) and passes on the fix.
- The tactical-board spec has a new criterion.
