---
path: frontend/apps/web/src/components/players/AddToStandingWaitingListDialog.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 116
size_tokens: 1068
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "cfa0fec4e17238020b0981836122cd2a5ff319d66f6ed6e092c65c8d0a962895"
---

## Purpose

A small dialog for adding a player to the "standing" waiting list (as opposed to a per-class waiting list): pick a duration (1 week to 2 months, preset chip buttons) and a max-classes-to-fill "credits" count (stepper, 1–20, default 3), then `addToStandingWaitingList`. The credits field's hint text explains it caps how many classes the standing entry will auto-fill before it's spent — it isn't a generic priority number.

## Connections

Uses: `@/api/notificationEngine` (`addToStandingWaitingList`, outside this scope); `@/components/ui/dialog`, `@/components/ui/button`; `@/types` (`StandingWaitingListEntry`).

Used by: a player-detail or players-list page (outside this scope), which supplies `playerId`/`playerName` and an `onAdded` callback.

Semantically related (not imports): `presences/PresenceMarkToggle.tsx`'s doc comment references the same standing/auto-invitation domain (invite queues, waiting-list rounds) that this dialog's `addToStandingWaitingList` call feeds into.
