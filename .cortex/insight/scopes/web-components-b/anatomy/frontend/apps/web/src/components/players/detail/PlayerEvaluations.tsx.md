---
path: frontend/apps/web/src/components/players/detail/PlayerEvaluations.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 46
size_tokens: 396
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "83ccb8b66b2acf560d9fff5eabf21edfc3bf475ac388ee3bf02289a5cca47928"
---

## Purpose

A small read-only card listing a player's evaluation scores as progress bars, one per category, each computed as a percentage of that category's own scale (`(score - scaleMin) / (scaleMax - scaleMin) * 100`) rather than assuming a fixed 0–10 or 0–100 range. Shows an empty-state message when there are no evaluations yet.

## Connections

Uses: `@/components/ui/card`, `@/components/ui/progress`; `@/types` (`PlayerEvaluation`).

Used by: a player-detail page (outside this scope).

Semantically related (not imports): `players/detail/AddEvaluationSheet.tsx` — the editable counterpart that writes the scores this component displays.
