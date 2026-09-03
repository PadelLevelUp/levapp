---
path: frontend/apps/web/src/components/players/EditPlayerSheet.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 352
size_tokens: 2743
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "771000f374232a50de3d235efb4b3020aad59b7d06a3316fb2454ee26154fc81"
---

## Purpose

A side sheet showing full player detail with a two-step edit flow: opens read-only (header + contact info + configuration, all display-only) with a single "Edit" button in the footer; clicking it flips `isEditing` and swaps the same fields to editable inputs, ending in "Cancel"/"Save changes". For an inactive (no-account) player it also shows a copyable registration invite link. Contact fields (email/phone) are only editable while BOTH `isEditing` AND the player is inactive (`isInactive`) — an active player's contact info is presumed to come from their own account, not the coach. Note: `isInactive` is computed as `!initialValues.isActive` without an optional-chain guard even though `initialValues` is typed as optional (`Partial<EditPlayerInput> | undefined`) — every current caller apparently always passes it, but a caller that omits it would throw at render.

## Connections

Uses: `@/components/ui/sheet`, `@/components/ui/button`, `@/components/ui/input`, `@/components/ui/label`, `@/components/ui/select`, `@/components/ui/avatar`, `@/components/ui/badge`, `@/components/ui/separator`; `@/types` (`CoachLevel`, `PlayerSide`, `sideLabel`).

Used by: not referenced by any other file in this scope's `files[]` — mounted from a players-related page (outside this scope) that supplies `levels` and `initialValues`.

Semantically related (not imports): `players/detail/PlayerHeader.tsx` — a SECOND, structurally different edit-in-place UI for largely the same fields (name/level/side), used within the player-detail page rather than this standalone sheet; it's not resolvable from this scope's data which of the two (or both) `PlayerDetailPage` actually mounts. `players/AddPlayerSheet.tsx` — the create-mode counterpart with a different field-availability-checked UX.
