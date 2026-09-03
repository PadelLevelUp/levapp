---
path: frontend/apps/web/src/components/calendar/ClassFillBar.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 72
size_tokens: 696
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8d8c520e1254e595d24aa9f1cd5d73712c72c5dcef39194794ca0c4746b0be36"
---

## Purpose

A three-segment `role="progressbar"` splitting a class's capacity into confirmed (solid), awaiting-response (half-strength), and free (track) seats — because `participantCount` from the API is `confirmed + awaiting`, so a bare "7/16" can't tell a coach whether those 7 are actually coming. Draws entirely in `currentColor` so it inherits whatever colour the containing card has already resolved as legible (ink or white) against the class's own coach-picked hue, rather than needing to know the background itself.

## Connections

Uses: `@/lib/utils` (`cn`) — outside this scope.

Used by: `frontend/apps/web/src/components/calendar/CalendarEventCard.tsx` — rendered whenever `showFill` is true (not a placeholder block and `capacity > 0`), fed `confirmed`/`filled`/`capacity` from the event.
