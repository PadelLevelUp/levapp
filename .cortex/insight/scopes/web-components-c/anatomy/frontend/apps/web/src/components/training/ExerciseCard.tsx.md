---
path: frontend/apps/web/src/components/training/ExerciseCard.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 81
size_tokens: 905
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "91ee2054fe5fd26a0989033bf539b25cf03def56ebd7271a911477e2674f3a2a"
---

## Purpose

`ExerciseCard` is a clickable summary card for one training exercise: an optional mini court-diagram thumbnail (a cut-down inline SVG re-render of up to 15 diagram elements — not a reuse of `CourtDiagramEditor`'s renderer), name, description snippet, and type/difficulty badges, plus a hover-revealed delete button.

## Connections

Uses:
- `@/components/ui/{card,badge,button}`.
- `@/types/training` (`Exercise`).

Used by:
- `frontend/apps/web/src/components/training/ExerciseGroupFolder.tsx`: renders one `ExerciseCard` per exercise inside an expanded group folder, wiring `onClick`→edit and `onDelete`→remove.

Semantically related (not imports): its inline SVG thumbnail duplicates `CourtDiagramEditor`/`CourtElementRenderer`'s element-type→shape mapping (player circles, cone triangles, ball dot, arrow/movement lines) as a second, independent, simplified implementation rather than reusing the renderer.
