---
path: frontend/apps/web/src/components/players/detail/PlayerHeader.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 199
size_tokens: 1810
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "af7cd0bce9f0e70148e031f99f154b98145cad5f1d4981ce3d6dec60839de667"
---

## Purpose

The player-detail page's header block: avatar, name, and side/level/inactive/notifications-blocked badges, with an inline (not sheet-based) edit mode — clicking "Edit" flips a controlled `isEditing` prop and swaps name/side/level to inputs/selects directly in place, ending in Cancel/Save buttons. An inactive player additionally shows the copyable registration invite link, both in and out of edit mode. This is a SEPARATE edit affordance from `players/EditPlayerSheet.tsx`, which edits largely the same fields (name/level/side) via a slide-out sheet instead — it isn't resolvable from this scope's data whether the app's player-detail page uses this component's inline edit, `EditPlayerSheet`, both for different fields, or one has superseded the other.

## Connections

Uses: `@/components/ui/avatar`, `@/components/ui/badge`, `@/components/ui/button`, `@/components/ui/input`, `@/components/ui/select`; `@/components/LevelLabel` (outside this scope); `@/types` (`CoachPlayer`, `CoachLevel`, `PlayerSide`, `sideLabel`).

Used by: a player-detail page (outside this scope), which owns all the draft-field state (`draftName`, `draftLevelId`, `draftSide`) and the `onEdit`/`onSave`/`onCancel` handlers — this component itself holds no draft state beyond the copy-link `copied` flag.

Semantically related (not imports): `players/EditPlayerSheet.tsx` — see Purpose; `players/detail/PlayerInfoCard.tsx` — the notifications-blocked badge here (`player-notifications-blocked-badge` test id) is the summary form of the detail `PlayerInfoCard.tsx` shows in full (blocked-notification reason, PAD-112).
