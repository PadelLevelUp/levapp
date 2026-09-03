---
id: B-014
title: "DeleteClassDialog.tsx is dead code, superseded by ClassScopeDialog"
type: layer-drift
severity: low
status: open
affects:
  - frontend/apps/web/src/components/calendar/DeleteClassDialog.tsx
proposed_fix: "Delete the file; ClassScopeDialog carries the single-occurrence-vs-series delete flow."
opened: 2026-09-03T14:40:00Z
---

# B-014 — DeleteClassDialog.tsx is dead code, superseded by ClassScopeDialog

Repo-wide grep finds no importer (verified 2026-09-03). The class-delete flow moved to `ClassScopeDialog` (apply-scope: this occurrence vs the series); the old dialog stayed behind.

*Surfaced by the initial Cortex insight extraction (web-components-a scope), 2026-09-03.*
