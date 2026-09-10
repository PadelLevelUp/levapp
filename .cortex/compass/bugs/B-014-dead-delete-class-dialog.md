---
id: B-014
title: "DeleteClassDialog.tsx is dead code, superseded by ClassScopeDialog"
type: layer-drift
severity: low
status: fixed
affects:
  - frontend/apps/web/src/components/calendar/DeleteClassDialog.tsx
proposed_fix: "Delete the file; ClassScopeDialog carries the single-occurrence-vs-series delete flow."
opened: 2026-09-03T14:40:00Z
fixed: 2026-09-06T00:00:00Z
fixed_by: PAD-179
---

# B-014 — DeleteClassDialog.tsx is dead code, superseded by ClassScopeDialog

Repo-wide grep finds no importer (verified 2026-09-03). The class-delete flow moved to `ClassScopeDialog` (apply-scope: this occurrence vs the series); the old dialog stayed behind.

*Surfaced by the initial Cortex insight extraction (web-components-a scope), 2026-09-03.*

## Resolution (PAD-179, 2026-09-06)

Deleted `frontend/apps/web/src/components/calendar/DeleteClassDialog.tsx`. Re-verified zero importers before removing; `ClassScopeDialog` carries the occurrence-vs-series delete flow and has six importers, one of them mobile.

**The trap this nearly walked into.** The dead component's strings, `calendar.deleteDialog.*`, look orphaned once it is gone — but they are live: `frontend/apps/mobile/app/class/[id].tsx` renders the iOS delete-scope dialog from those exact keys, and `apps/mobile/src/lib/i18n.ts` statically imports the same shared `frontend/src/locales/{pt,en}/calendar.json` the web app uses. Deleting them as "dead strings" would have broken the iOS dialog into raw key paths with nothing failing — a grep scoped to `apps/web` cannot see it. The locale block was therefore kept, and a regression guard added at `apps/mobile/src/features/calendar/delete-dialog-i18n.test.ts` which reads the keys out of the iOS screen source, so a newly-used subkey is covered without anyone maintaining a list.
