Turns a class's coach-picked color plus its schedule/status into rendered visual state (fill, fade, border, contrast; block | canceled | past | next | future) identically on web and mobile. The mapping function itself lives once in `@levelup/config`, but the two platforms drifted onto independent from-scratch reimplementations of the surfaces that *consume* it before being pulled back into visual parity — `CalendarEventCard`/`ClassFillBar`/`CalendarLegend` on web and their calendar-feature counterparts on mobile treat the coach-picked hex color as an identity channel that composes with, but is never conflated with, the computed `EventVisualState`.

## Implemented by
`frontend/packages/config/src/calendar-status.ts`
`frontend/packages/config/src/calendar-status.test.ts`
`frontend/apps/web/src/components/calendar/CalendarEventCard.tsx`
`frontend/apps/web/src/components/calendar/ClassFillBar.tsx`
`frontend/apps/web/src/components/calendar/CalendarLegend.tsx`
`frontend/apps/web/src/components/calendar/AddClassSheet.tsx`
`frontend/apps/mobile/src/features/calendar/EventCard.tsx`
`frontend/apps/mobile/src/features/calendar/ClassFillBar.tsx`

## Related concepts
[[design-tokens]]
[[web-mobile-parity]]
[[effective-seat-count]]
