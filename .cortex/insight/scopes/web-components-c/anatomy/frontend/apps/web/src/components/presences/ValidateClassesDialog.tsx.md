---
path: frontend/apps/web/src/components/presences/ValidateClassesDialog.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 830
size_tokens: 7058
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d35a6c43c820147bfdde759028d77d0e5968ac207cc1c0dca010ec3a22adad77"
---

## Purpose

`ValidateClassesDialog` (PAD-140) is the coach's attendance-inbox dialog: classes that already ran but whose presence records aren't finalized, browsed a week at a time and bucketed into "ready to confirm" (every player answered) vs "needs your input" (someone didn't). It renders as a trigger button plus a `Dialog` with a list view (`ClassList`/`ClassCard`) and a drill-in detail view (`ClassDetail`) for resolving stragglers, adding walk-ins, and re-opening already-validated classes. All per-player marks live in local `edits`/`extras` state layered over the server-supplied prefill until the coach hits Validate, which POSTs the resolved marks in one call that both records attendance and stamps `validated=true`. Exports `ClassCard`, `ClassDetail`, `ClassList`, `RosterOption`, `ValidateClassesDialog`, and the `sortPlayers` helper (undecided players first) for reuse/testing.

## Connections

Uses:
- `./PresenceMarkToggle`: the present/absent/justified-absent control rendered per player row in both the card and detail views.
- `@levelup/config`: `effectiveMark`, `fromMark`, `undecidedCount`, and the `PresenceMark` type — the shared local-edit-over-server-prefill resolution logic also used by the presence-status package (`frontend/packages/config/src/presence-status.ts`), so the "what does this player's current mark resolve to" rule lives in one place instead of being reimplemented per screen.
- `@/components/ui/{button,checkbox,dialog,select,skeleton}`, `@/lib/utils` (`cn`): shadcn/ui primitives and the classname helper.
- `@/types`: `PendingValidationClass`, `PendingValidationPlayer`.

Used by: not observed within this scope (consumed by a presences page component outside `web-components-c`).
