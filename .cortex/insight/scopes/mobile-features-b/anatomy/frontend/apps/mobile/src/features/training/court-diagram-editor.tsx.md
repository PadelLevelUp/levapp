---
path: frontend/apps/mobile/src/features/training/court-diagram-editor.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 758
size_tokens: 7156
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8c046f174384f42cf11c10d2da19f6f95e42cf2e5e1982ece6f867a878dbd72b"
---

## Purpose

`CourtDiagramEditor` is a touch-driven port of web's `CourtDiagramEditor.tsx` — a tap/drag SVG editor for placing players, cones, blockers, balls, and curved arrow/movement lines on a padel court diagram, used inside exercise creation. The court geometry, element rendering, and bezier curve math are ported near-verbatim from web (and MUST stay pixel-identical: diagrams are shared data across platforms, keyed to the same `COURT_W`/`COURT_H`/`SERVICE_LINE` constants). What's re-architected is the interaction model: web's per-element DOM `pointerdown`/`pointermove`/`pointerup` listeners have no RN equivalent, so this file drives everything from a single canvas-level `Gesture.Pan()` that does its own JS hit-testing (`hitTestElement`, `elementContainsPoint`, `hitTestLineControls`) against the current element list — effectively reimplementing what the DOM's `e.target` resolution gives web for free. Touch targets get a `MIN_TOUCH_RADIUS_PX` floor (44pt recommended, halved) so a `cone`'s 10-unit visual radius is still comfortably tappable. Since mobile form widths often exceed the court's `MAX_BOX_HEIGHT` cap (unlike web, where the court rarely gets that wide on desktop), the file implements its own aspect-fit ("meet") coordinate mapping to replicate SVG's `preserveAspectRatio="xMidYMid meet"` so touch coordinates translate correctly even when letterboxed.

## Connections

Uses (external, not in this scope): `@levelup/types` for `CourtDiagram`/`CourtElement`/`CourtElementType`; `@levelup/config` for `lightTheme`; `react-native-gesture-handler`'s `Gesture`/`GestureDetector`; `react-native-svg` primitives (`Svg`, `Circle`, `Path`, `Polygon`, `Rect`, `Line`, `Marker`, `Text as SvgText`, `G`, `Defs`).

Used by: `frontend/apps/mobile/src/features/training/exercise-form.tsx`: renders `<CourtDiagramEditor value={diagram} onChange={setDiagram} />` inside a collapsible section, collapsed by default to keep the exercise form compact (visible via direct import; not captured as a resolved in-scope edge in this scope's L1 data).
