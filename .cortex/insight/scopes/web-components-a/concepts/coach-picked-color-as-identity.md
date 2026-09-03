---
concept: coach-picked-color-as-identity
---

# Coach-picked colour as identity, not decoration

Every class carries a colour the coach chose (`AddClassSheet`'s `COLORS` swatch picker), and the calendar rendering layer treats that hex as the class's *identity* channel while a separate `EventVisualState` (`next` / `past` / plain, from `@levelup/config`'s `resolveEventState`) carries *state* — the two are composed, never conflated. `CalendarEventCard` is the shared rendering surface for both the desktop grid and the mobile list; it never hardcodes a palette, instead deriving legible ink-vs-white text via `contrastTextOn`/`readableInk` and fading via `fadeColor` from the coach's own hex. `ClassFillBar` extends the same idea one level deeper: it draws in `currentColor` so it inherits whatever ink/white decision the card already made, rather than knowing about backgrounds itself. `CalendarLegend` reinforces this by deliberately NOT sampling the real palette in its swatches — it shows the *treatment* (border, fade, ring) on a neutral stand-in, since the actual colour is arbitrary per class.

## Members

- `frontend/apps/web/src/components/calendar/CalendarEventCard.tsx` — the central color/state composition point
- `frontend/apps/web/src/components/calendar/ClassFillBar.tsx` — `currentColor` inheritance
- `frontend/apps/web/src/components/calendar/CalendarLegend.tsx` — explains the treatments, not the palette
- `frontend/apps/web/src/components/calendar/AddClassSheet.tsx` — where the coach picks the colour
- `@levelup/config` (outside this scope) — `contrastTextOn`, `readableInk`, `fadeColor`, `resolveEventState`
