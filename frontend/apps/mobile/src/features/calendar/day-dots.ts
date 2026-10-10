import { cardSurfaceNative, lightTheme, resolveCardVariant, type CalendarSurfaces } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";

/** Up to three dots per day, in start order — calendar.mobile-views rule 10. */
export const MAX_DAY_DOTS = 3;

/**
 * The colours of a day's dots in the week strip: the class's own colour for a
 * scheduled class, faded when done, `destructive` when canceled, muted for a
 * block. Pure so the mobile vitest runner (no React Native) can pin it; the
 * strip only paints what this returns.
 */
export function dayDotColors(
  events: CalendarEvent[],
  surfaces: CalendarSurfaces,
  now: Date = new Date()
): string[] {
  return events.slice(0, MAX_DAY_DOTS).map((event) => {
    const { variant } = resolveCardVariant(event, { now });
    if (variant === "block") return surfaces.mutedForeground;
    const surface = cardSurfaceNative(event.color, variant, surfaces);
    // B-541 (rule 10): an outlined treatment's surface is the white card — the dot takes
    // the outline colour instead.
    const outlined = variant === "open-spot" || variant === "next";
    return (
      (outlined ? surface.borderColor : surface.backgroundColor) ?? lightTheme.primary
    );
  });
}
