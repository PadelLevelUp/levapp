import type { CalendarEvent } from "@levelup/types";

/**
 * What one day column of the week strip renders.
 *
 * `chips` are the classes drawn as tinted blocks, in the order given.
 * `overflowCount` is how many were cut and summarised as "+N" — zero means
 * nothing was cut and no indicator is drawn.
 */
export type DayColumnContent = {
  chips: CalendarEvent[];
  overflowCount: number;
};

/**
 * Decides which of a day's classes the column shows: all of them.
 *
 * `calendar.view` rule 14 (PAD-172). The strip is a bounded `flex-1` half of
 * the screen and each column scrolls internally, so a busy day overflows by
 * scrolling rather than by truncating — there is nothing to cut, and
 * `overflowCount` is always 0. It stays in the return type because the "+N"
 * affordance is a real concept on the web side, which still caps its column at
 * four chips; keeping the shape makes that divergence explicit rather than
 * silently absent.
 *
 * Extracted from `WeekStrip`'s JSX so the rule is reachable from a unit test:
 * the mobile runner is a plain Node environment with `react-native` aliased to
 * a stub, so a rendered-component assertion is not available here (see
 * `vitest.config.ts`) — but a pure decision function is.
 */
export function dayColumnContent(dayEvents: CalendarEvent[]): DayColumnContent {
  return { chips: dayEvents, overflowCount: 0 };
}
