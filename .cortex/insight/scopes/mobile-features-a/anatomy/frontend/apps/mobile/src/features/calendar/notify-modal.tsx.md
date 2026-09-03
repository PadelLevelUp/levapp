---
path: frontend/apps/mobile/src/features/calendar/notify-modal.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 314
size_tokens: 2695
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c56250d7eb983f86f85de95818e4e539018c3734b82b70e832038c0a8df736ac"
---

## Purpose

Manual class-invitation modal: collapsible notification-group checkboxes (with a select-all-in-group toggle) plus a free-text individual-player search, both funneled into a single flat `playerIds` array sent via `useSendManualNotifications`. Ports web's `ManualNotificationModal.tsx` — group membership is resolved to player ids client-side before the request, matching exactly what web sends over the wire. Queries are lazily enabled only while the modal is `open`, via `useNotificationGroups`'s own `enabled: !!model && !!originalId && !!date` gate — passing `undefined` while closed disables both queries without any extra wiring in `calendar/hooks.ts`.

## Connections

Uses:
- `frontend/apps/mobile/src/features/calendar/hooks.ts` (in scope): `useNotificationGroups`, `useSendManualNotifications`.
- `@levelup/api` (frontend/packages/api/src/index.ts): `playersApi.getCoachPlayers`.
- `@levelup/config` (frontend/packages/config/src/index.ts): `lightTheme`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `CalendarEvent`, `StudentGroup`.
- `@/components/ui/{button,checkbox,dialog,input,spinner,text,toast}`, `@/lib/utils` (outside this scope): `cn`.

Used by: none within this scope — opened from a class-detail screen outside this slice.
