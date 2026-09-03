---
path: frontend/apps/web/src/components/training/CourtDiagramEditor.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 629
size_tokens: 5688
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1a0de15304770b4bfcb90910052fa27e7b428246dedacaed6b86a24eae58eadf"
---

## Purpose

`CourtDiagramEditor` is a hand-rolled SVG tactical-diagram editor for padel court drawings embedded in `ExerciseFormSheet`: a toolbar of tools (select, up to 4 uniquely-colored players, coach, cone, blocker, ball, arrow, movement, eraser) and a pointer-driven canvas drawn to a fixed court viewBox. Points/lines are placed by tool-specific pointer handlers; arrows/movement lines support drag-to-curve (perpendicular offset from the midpoint) and draggable start/end endpoints once selected. State is the flat `CourtElement[]` array on the controlled `value`/`onChange` props — no internal undo history beyond a full-clear button. Exports the pure geometry helpers `bezierMidpoint`, `bezierPath`, `getControlPoint` and the `CourtElementRenderer` sub-component alongside the main editor.

## Connections

Uses:
- `@/components/ui/{button,input,label}`, `@/lib/utils` (`cn`).
- `@/types/training` (`CourtElement`, `CourtElementType`, `CourtDiagram`).

Used by:
- `frontend/apps/web/src/components/training/ExerciseFormSheet.tsx`: embeds it as the diagram field of the exercise create/edit form, passing `diagram`/`setDiagram` as the controlled value.

Semantically related (not imports): the four-player-color mapping (`PLAYER_COLORS`) and per-element-type shape rendering (`CourtElementRenderer`) is independently re-implemented, simplified, in `ExerciseCard.tsx`'s inline thumbnail SVG rather than reused from here. The file's own comment records a deliberate exception to the app's semantic color palette: the player/element colors here are diagram *content* (distinguishing player 1–4 on a tactical plan, plus a green court), not UI status, so they're intentionally kept outside the success/warning/destructive palette.
