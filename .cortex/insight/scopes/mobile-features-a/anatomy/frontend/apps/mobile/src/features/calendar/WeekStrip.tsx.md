---
path: frontend/apps/mobile/src/features/calendar/WeekStrip.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 213
size_tokens: 2094
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5ed2264998edd882404df4399f9f406fa73a0cdfc4163d55583afbfc8990e5a0"
---

## Purpose

Mon–Sun week strip with today/prev/next navigation and, under each day cell, up to `MAX_CHIPS` (4) small class chips tinted with each class's own colour and computed text colour — titles rather than bare dots, so a coach reads the week by recognising class names. React Native port of the top half of the web `MobileCalendarView`. The whole day column is a single `Pressable` with plain `View`s inside (nesting a `Pressable` per chip breaks VoiceOver on iOS, and the chips aren't individually actionable — tapping anywhere selects the day). Unlike web, which bounds its strip and scrolls each day column internally, this strip has no clean RN equivalent for that and is simply capped at `MAX_CHIPS`, so the busiest day sets the height of all seven columns (~210px on a 390×844 screen) — a bigger share of screen than web gives it; lower `MAX_CHIPS` to 3 if the detail list below feels squeezed.

## Connections

Uses:
- `@levelup/config` (frontend/packages/config/src/index.ts): `contrastTextOnNative`, `fadeColorNative`, `lightTheme`, `nativeCalendarSurfaces`, `resolveEventState`, `withAlpha`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `CalendarEvent`.
- `@/components/ui/text`, `@/lib/utils` (outside this scope): `cn`.
- `date-fns`: `format`, `isSameDay`, `isToday`.

Used by: none within this scope — rendered by the calendar tab screen outside this slice.

Semantically related (not imports): the selected-day background is an explicit `rgba(...)` string rather than a Tailwind `bg-primary/20` class, because React Native's colour parser rejects the slash-alpha `hsl(h s% l% / a)` form Tailwind emits for opacity modifiers — a gotcha shared with any other file in this app resolving alpha colours for inline `style`.
