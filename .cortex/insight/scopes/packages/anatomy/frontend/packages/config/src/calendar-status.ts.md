---
path: frontend/packages/config/src/calendar-status.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 398
size_tokens: 3846
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8e443fa40d552df8824e9168a8a9fb49aff990633bb346a7976e46da2bee63c2"
---

## Purpose

Turns a calendar class's coach-picked hex color (user DATA, not state) into visual STATE — fill, fade, border, and text-contrast — for both web (CSS `color-mix()`/`hsl(var(...))` emitters that let the browser re-resolve on theme flip) and React Native (`*Native` emitters doing the same gamma-sRGB arithmetic in JS against resolved `lightTheme`/`darkTheme` surfaces, since RN has no CSS variable indirection). Also owns event-state resolution (`resolveEventState`: block/canceled/past/next/future) and "next class" detection (`findNextEventId`) — logic that used to live only in `apps/web` and drifted from mobile's separate reimplementation until unified here. Every color decision (contrast crossover luminance, fade/readable-ink mix percentages) is a shared constant so the two platforms cannot silently diverge again.

## Connections

Uses:
- `frontend/packages/config/src/tokens.ts`: `darkTheme`/`lightTheme` for `nativeCalendarSurfaces()`'s resolved `card`/`foreground`/`mutedForeground` colors.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `CalendarEvent`.

Used by:
- `frontend/packages/config/src/index.ts`: re-exported as part of the `@levelup/config` barrel.
- `frontend/packages/config/src/calendar-status.test.ts`: asserts CSS `color-mix()` and the native `mixColors()` arithmetic agree, rather than trusting they do.
