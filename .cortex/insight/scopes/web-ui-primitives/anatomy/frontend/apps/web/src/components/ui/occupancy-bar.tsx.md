---
path: frontend/apps/web/src/components/ui/occupancy-bar.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 61
size_tokens: 473
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7540ff19c3222876a3627162006563f50bd250d39e16af832ebdc43a86a7436e"
---

## Purpose

LevApp-specific class-occupancy visualization, not a shadcn primitive: `OccupancyBar` renders a thin horizontal fill bar showing filled/total seats at a glance, plus `parseOccupancy`, a helper that parses the "2/6"-style string the dashboard emits as `rightLabel`. Its own doc comment states the design rule it follows: width is the *only* animated property in this system (280ms ease-out, no bounce, collapsed under `motion-reduce`); full occupancy renders `bg-success` — the one case green is used for ("done") — while any partial fill stays informational `bg-primary` rather than an amber warning color, since a separate "Missing N" badge elsewhere already carries the call-to-action.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `frontend/packages/config/src/tokens.ts` (outside this scope): its header comment states the same rule this file's comment restates — blue carries identity/primary actions and green is reserved to mean only "done/confirmed", never picked "for visual variety". See `levapp-visual-design-conventions`.
