---
path: frontend/apps/web/src/components/settings/DataImportSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 1278
size_tokens: 10858
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3b1404f16d9842772fb602c0645365fad6b85c4a47ca6c5c453e08bad9943b3c"
---

## Purpose

`DataImportSection` is the coach onboarding/bulk-import flow: drop or pick a spreadsheet/PDF file, choose which tables to import (Players, Classes, Players-in-Classes, Presences, Evaluations, Strengths, Weaknesses — Coach Levels and Evaluation Categories are always auto-included), watch an AI analysis phase stream live "thinking" lines and a progress bar over SSE, review/edit an editable preview table per detected table (grouped by Class for the two per-class tables), then confirm import and see a results view with per-table imported/error counts. It is a large single-file state machine (`idle → selecting → uploading → processing → analyzing → done`, tracked via the `Phase` type) composed of several presentational sub-components it also exports for reuse/testing: `AiSpinner`, `PhaseIndicator`, `ThinkingLog`, `TableSelectionStep`, `EditableCell`, `GroupedTableBody`, `ImportTableView`, `ImportResultsView`. Despite being the largest file in this scope (1,278 lines), the scope's structural ranking classifies it `centrality: low` — nothing else in the scope imports from it, so its size reflects self-contained UI complexity rather than graph centrality. The Players-table duplicate-name check (PAD-17, sourced from a `getCoachPlayers` snapshot loaded once on mount) is deliberately warn-not-block: flagged rows stay fully importable.

## Connections

Uses:
- `@/api/import` (`analyzeFile`, `confirmImportStream`, `AnalyzeSSEEvent`): the two SSE-streamed calls driving the analysis and import phases.
- `@/api/players` (`getCoachPlayers`): preloads existing player names (lowercased) once on mount, used only to flag possible duplicate names in the Players table preview (PAD-17) — a warning badge, never a block.
- `@/components/ui/{badge,button,checkbox,input,progress,separator,table}`, `@/lib/utils` (`cn`), `@/hooks/use-toast`.
- `@/types` (`Phase`, `ImportTableRow`, `ImportTable`, `ThinkingLine`).

Used by: not observed within this scope (rendered on the same Settings tab as `ImportHistorySection`, which lists the runs this component creates).

Semantically related (not imports): the duplicate-name warn-not-block pattern (PAD-17) mirrors other advisory-only checks elsewhere in Settings, e.g. `EligibilitySection`'s "no bar = everyone eligible" default.
