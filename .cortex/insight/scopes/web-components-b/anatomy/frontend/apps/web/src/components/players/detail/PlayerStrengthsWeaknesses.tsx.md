---
path: frontend/apps/web/src/components/players/detail/PlayerStrengthsWeaknesses.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 165
size_tokens: 1610
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ea738b29aa9782c6db04f2ed07563b3df1bfbd9ae81fe8ec00f270bd4dffc9cd"
---

## Purpose

A second, separately-built strengths/weaknesses editor for the player-detail page: two side-by-side cards (thumbs-up/thumbs-down) with a shared "Edit"/"Done" toggle (`canEdit` is derived from whether ALL FOUR of `onAddStrength`/`onRemoveStrength`/`onAddWeakness`/`onRemoveWeakness` were supplied — partial callback sets silently disable editing entirely rather than partially). Add/remove happen purely through the callback props; this component holds no note data itself beyond the two new-item text-input drafts.

## Connections

Uses: `@/components/ui/card`, `@/components/ui/button`, `@/components/ui/input`; `@/types` (`CoachNote`).

Used by: a player-detail page (outside this scope), which supplies `strengths`/`weaknesses` and the four optional CRUD callbacks — matching the memory note that this is the component behind the player-detail page's SECOND "Edit" button (toggling S&W edit mode, distinct from `PlayerHeader`'s "Edit").

Semantically related (not imports): `players/detail/AddEvaluationSheet.tsx` — that sheet ALSO edits strengths/weaknesses (with its own add/remove UI, calling `deleteCoachNote` directly), so the app has two independently-implemented strengths/weaknesses editors reachable from the same page. Note: this file imports `api` from `@/api/client` and `USE_MOCK_DATA` from `@/config` but neither is referenced anywhere in the file — dead imports, likely left over from a version that called the API directly before add/remove was lifted to parent-supplied callbacks.
