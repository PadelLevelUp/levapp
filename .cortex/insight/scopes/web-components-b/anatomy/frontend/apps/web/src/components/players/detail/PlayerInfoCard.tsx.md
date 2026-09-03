---
path: frontend/apps/web/src/components/players/detail/PlayerInfoCard.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 117
size_tokens: 1140
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f29d917f2ec8afc03a9475edaf0f636fdf9d4c56b32efd2a62ce9dd37cb74908"
---

## Purpose

A player-detail card for contact info (email/phone, editable only when `isEditing && !player.isActive` — same active/inactive gate as `EditPlayerSheet.tsx`) and free-text notes. Also shows the full detail of PAD-112's notification-block feature when `player.notificationsBlocked`: which categories are blocked (all/auto-invitations/manual-invitations) and the student's own explanation, read-only for the coach — deliberately contrasted in its own comment with a PAD-107 availability blocker's title/description/hours, which are the student's private calendar and are NEVER shown here.

## Connections

Uses: `@/components/ui/card`, `@/components/ui/input`; `@/types` (`CoachPlayer`); `lucide-react` (`BellOff`, `Mail`, `Phone` — its own comment notes `User` was dropped when PAD-105 removed the coach-facing username line).

Used by: a player-detail page (outside this scope), which owns the draft email/phone/notes state and change handlers.

Semantically related (not imports): `players/detail/PlayerHeader.tsx` — its notifications-blocked BADGE is the summary this card's full block-reason detail expands on; `players/EditPlayerSheet.tsx` — shares the identical `isEditing && isInactive` contact-field-editability rule.
