---
path: frontend/apps/web/src/components/settings/StandingWaitingListSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 212
size_tokens: 2006
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "bb6c14c565d0d94ce09c8fcff5b0a633399b27a22d8f732589c7c0a274e87441"
---

## Purpose

`StandingWaitingListSection` manages the "standing" waiting list: players who get first crack at any opening (with a credits-used/credits-total budget and an expiry date), independent of the per-class waiting list. It lets the coach search for and add a player (via a 300ms-debounced search plus `AddToStandingWaitingListDialog`) and remove existing entries, rendering each entry's expiry state (`expired` badge, dimmed row) computed client-side.

## Connections

Uses:
- `@/api/notificationEngine` (`getStandingWaitingList`, `removeFromStandingWaitingList`, `searchPlayers`).
- `@/components/players/AddToStandingWaitingListDialog`: the add-entry dialog (outside this scope, in `components/players`).
- `@/components/ui/{button,input,badge}`.
- `@/types` (`StandingWaitingListEntry`).

Used by:
- `frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx`: renders it inside the "Standing Waiting List" collapsible, always available regardless of the `autoNotifyEnabled` master switch (unlike most sibling sections).

## Insights

`expires_at` arrives from the backend as a naive-UTC ISO string with no `Z`/offset suffix (`.isoformat()` on the Python side); `parseExpiry` normalizes it by appending `Z` before parsing when no offset is already present, because `new Date()` on an offset-less ISO string reads it as *local* time and skews the displayed/compared instant by the host's UTC offset. `isExpired` compares against `Date.now()` as an instant, not a calendar date, deliberately — an entry expiring later today is not yet expired, so there is no separate "expires today" state.

Semantically related (not imports): the same debounced-search pattern (300ms `setTimeout`/`clearTimeout`) appears independently in `RestrictionsPanel.tsx`'s `ExcludedPlayersRow`.
