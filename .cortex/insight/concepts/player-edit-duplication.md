Two independently-built web components both edit a player's name/level/side: `EditPlayerSheet.tsx` (a slide-out sheet, two-step edit) and `PlayerHeader.tsx` (inline edit-in-place directly in the header, no sheet). Both are consumer-controlled, so which one the player-detail page actually wires up is not resolvable from either file alone. Separately, strengths/weaknesses have the same duplication: `PlayerStrengthsWeaknesses.tsx` (inline card-toggle editor) and `AddEvaluationSheet.tsx` (a sheet that also edits strengths/weaknesses, calling `deleteCoachNote` directly rather than through parent callbacks) are two separately-implemented editors for the same data, both reachable from a player-detail page.

## Implemented by
`frontend/apps/web/src/components/players/EditPlayerSheet.tsx`
`frontend/apps/web/src/components/players/detail/PlayerHeader.tsx`
`frontend/apps/web/src/components/players/detail/PlayerStrengthsWeaknesses.tsx`
`frontend/apps/web/src/components/players/detail/AddEvaluationSheet.tsx`

## Related concepts
[[dual-report-mount-points]]
