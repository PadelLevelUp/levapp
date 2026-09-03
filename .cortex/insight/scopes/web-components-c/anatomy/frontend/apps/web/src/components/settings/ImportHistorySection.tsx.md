---
path: frontend/apps/web/src/components/settings/ImportHistorySection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 215
size_tokens: 1826
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6de31fc91003cb22df92e97e3ea89084094aa5533c19e437bb16bc5e3721e114"
---

## Purpose

`ImportHistorySection` lists past data-import runs (see `DataImportSection`) with per-table row-count summaries and lets a coach revert an active import (soft-undo, via an `AlertDialog` confirm). It renders nothing (`return null`) when history is empty rather than showing an empty state, and reverting invalidates the app-wide coach-players cache so other screens pick up the rollback. Exports `formatDate`/`formatSummary` helpers alongside the component, both used by the confirm-dialog copy.

## Connections

Uses:
- `@/api/import` (`getImportHistory`, `revertImport`, `ImportHistoryEntry`): the data layer.
- `@/api/players` (`invalidateCoachPlayersCache`): forces a refetch elsewhere after a revert.
- `@/components/ui/{alert-dialog,button,badge}`, `@/hooks/use-toast`.

Used by: not observed within this scope (rendered on the same Settings tab as `DataImportSection`, which it lists the history for).

Semantically related (not imports): its "revert" `AlertDialog` confirm pattern matches `AccountSection`'s delete-account dialog — same single-step destructive-confirm shape used throughout Settings.
