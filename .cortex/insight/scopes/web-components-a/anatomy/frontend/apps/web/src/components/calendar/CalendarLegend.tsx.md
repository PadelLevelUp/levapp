---
path: frontend/apps/web/src/components/calendar/CalendarLegend.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 71
size_tokens: 595
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5f024636b44644c1d449b196a4bfe5d6b1774af676d9be840117d1cbce98645a"
---

## Purpose

Explains the calendar grid's visual encoding — next/full/finished/event states plus the confirmed/awaiting/free fill split — since the grid encodes three variables at once (status, fill, level) and is guessable but not reliably readable without a key. Swatches deliberately render the *treatment* (border style, fade, ring) with a neutral stand-in colour rather than a fixed palette sample, because the real class colour is whatever the coach picked.

## Connections

Uses: none within this scope; imports `react-i18next`, `@/lib/utils` — both outside this scope.

Used by: `frontend/apps/web/src/components/calendar/CalendarToolbar.tsx` — rendered inline in the toolbar (ordered last on narrow screens via `order-last`, centered inline on `lg+`).
