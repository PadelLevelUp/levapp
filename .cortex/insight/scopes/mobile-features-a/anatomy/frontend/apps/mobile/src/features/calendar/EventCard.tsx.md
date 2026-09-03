---
path: frontend/apps/mobile/src/features/calendar/EventCard.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 3
size_lines: 211
size_tokens: 1866
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "dd11d1d025f73ff81f488fd0fe9c2e0a7474015f803209d94b1015e8bab3a101"
---

## Purpose

Renders a single class/block/event in a selected day's list — React Native port of the web `CalendarEventCard`'s `row` variant. Colour identifies the class (the coach's chosen swatch); visual STYLE (next/past/canceled/default) reports its state via `resolveEventState`. Because the coach can pick any hex, nothing here assumes white text is legible on it — every text/ink colour is resolved through `@levelup/config`'s shared contrast helpers, the same module the web card uses, so the two platforms can't drift apart on colour logic again.

## Main players

- `EventCard` (lines 40–210, critical): the sole export. Resolves visual state (`next`/`past`/`canceled`/default) into concrete RN style props (no CSS variables in RN), computes an accessible ink colour via `readableInkNative`/`contrastTextOnNative`, and renders title, level chip, time, recurrence icon, the fill bar, and a canceled label.
- `SURFACES` (line 29, supporting): `nativeCalendarSurfaces("light")` — the resolved light-theme surface palette used throughout the component; RN cannot read CSS custom properties so this is computed once at module scope.

## Insights

- The "spots to fill" outline that used to sit next to the count was deliberately removed at the user's request (comment at line 55–56) — the three-part fill bar alone now carries that information. Don't re-add it without checking with product intent.
- State-to-style mapping is asymmetric: `next` gets a white card with the class colour as a 1px border (explicitly `borderWidth: 1`, NOT `StyleSheet.hairlineWidth`, to match the web rule's visible thickness); `past` fades the hex via `fadeColorNative` and also gets a 1px border because a 22%-alpha pale hue over a white card barely reads against the list otherwise; the default state fills solid with the hex and computes `onColor` (white vs ink text) from `contrastTextOnNative`.
- `chipBackground` differs by whether text sits "on colour" (`onColor`) or on a light surface — white-at-20%-alpha vs foreground-at-10%-alpha — so the level chip stays legible against both saturated and unsaturated cards.
- `isClass` gates whether the card is pressable at all (`disabled={!isClass || !onPress}`) — blocks and other non-class event types render but never navigate.

## Connections

Uses:
- `frontend/apps/mobile/src/features/calendar/ClassFillBar.tsx` (in scope): renders it for the fill row when `showFill` is true.
- `@levelup/config` (frontend/packages/config/src/index.ts): `contrastTextOnNative`, `fadeColorNative`, `lightTheme`, `nativeCalendarSurfaces`, `readableInkNative`, `resolveEventState`, `withAlpha`, `EventVisualState`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `CalendarEvent`.
- `@/components/ui/text`, `@/lib/utils` (outside this scope): `Text`, `cn`.

Used by: none within this scope — rendered by a day/list screen outside this slice.

## Query pointers

If you need to change class-card colour/state logic, also read: `ClassFillBar.tsx` (the fill-bar colour it's handed) and `apps/web/src/components/calendar/CalendarEventCard.tsx` (the row variant this explicitly mirrors) — both must move together to avoid re-diverging.
