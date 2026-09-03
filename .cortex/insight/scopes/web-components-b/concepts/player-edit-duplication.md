---
slug: player-edit-duplication
---

# Duplicated player-edit surfaces

Two independently-built components both edit a player's name/level/side: `players/EditPlayerSheet.tsx` (a slide-out sheet, two-step edit — open read-only, click "Edit" in the footer, edit mode, "Save changes") and `players/detail/PlayerHeader.tsx` (inline edit-in-place directly in the header, no sheet). Both are consumer-controlled (`isEditing` as a prop, or `open` for the sheet), so which one the player-detail page actually wires up to its own "Edit" button is not resolvable from this scope alone — the page itself lives outside `web-components-b`.

Separately, strengths/weaknesses have the same duplication: `players/detail/PlayerStrengthsWeaknesses.tsx` (inline card-toggle editor) and `players/detail/AddEvaluationSheet.tsx` (a sheet that also edits strengths/weaknesses, calling `deleteCoachNote` directly rather than through parent callbacks) are two separately-implemented editors for the same data, both reachable from a player-detail page.

Files: `file:frontend/apps/web/src/components/players/EditPlayerSheet.tsx`, `file:frontend/apps/web/src/components/players/detail/PlayerHeader.tsx`, `file:frontend/apps/web/src/components/players/detail/PlayerStrengthsWeaknesses.tsx`, `file:frontend/apps/web/src/components/players/detail/AddEvaluationSheet.tsx`.
