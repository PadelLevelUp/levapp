---
path: frontend/apps/web/src/components/settings/NotificationGroupsSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 66
size_tokens: 583
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7a5b1b6034f53d4edcf00467c3e3f8c17a119279346ddbebd621d2c7a0fce7d8"
---

## Purpose

`NotificationGroupsSection` is a small controlled list of `Switch` toggles for the *manual*-mode notify-groups feature ("same level", "recent absences", "justified absences", "all students") inside the notification engine, distinct from `InvitationGroupsSection`'s automatic invitation ordering despite the similar name. It's a pure presentational component: it receives `groups`/`onChange`/`disabled` and flips one group's `enabled` flag on toggle, with no data fetching of its own.

## Connections

Uses:
- `@/components/ui/switch`, `lucide-react` (`GripVertical`, decorative-only — the list is not actually draggable, unlike its siblings).
- `@/types` (`NotificationGroup`).

Used by:
- `frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx`: renders it inside the "Notify Groups" collapsible section, always enabled (not gated behind the master `autoNotifyEnabled` switch, since it's the manual-mode path).
