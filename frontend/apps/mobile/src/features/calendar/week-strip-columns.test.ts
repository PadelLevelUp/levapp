import type { CalendarEvent } from "@levelup/types";
import { describe, expect, it } from "vitest";

import { dayColumnContent } from "./week-strip-columns";

/**
 * PAD-172 / `calendar.view` rule 14.
 *
 * The rule is a layout rule — a `flex-1`/`flex-1` split whose share of the
 * screen a unit test cannot measure (the mobile runner renders nothing; see
 * `vitest.config.ts`). Its one density clause IS reachable: because the strip
 * is bounded and each column scrolls internally, iOS shows every class in a
 * column and never cuts to a "+N" indicator. That is what this pins. The
 * proportion itself is simulator-verified — see the PR body.
 */

function classEvent(n: number): CalendarEvent {
  return {
    model: "LessonInstance",
    originalId: n,
    id: String(n),
    type: "class",
    isRecurring: false,
    title: `Class ${n}`,
    date: "2026-09-07",
    startTime: `${String(8 + n).padStart(2, "0")}:00`,
    endTime: `${String(9 + n).padStart(2, "0")}:00`,
  };
}

describe("dayColumnContent", () => {
  it("renders every class on a busy day, with nothing cut", () => {
    const events = Array.from({ length: 8 }, (_, i) => classEvent(i + 1));

    const { chips, overflowCount } = dayColumnContent(events);

    // The eighth class is reachable by scrolling the column, not summarised.
    expect(chips).toHaveLength(8);
    expect(overflowCount).toBe(0);
  });

  it("never reports overflow, however busy the day", () => {
    for (const count of [0, 1, 4, 5, 12, 30]) {
      const events = Array.from({ length: count }, (_, i) => classEvent(i + 1));

      const { chips, overflowCount } = dayColumnContent(events);

      expect(chips).toHaveLength(count);
      expect(overflowCount).toBe(0);
    }
  });

  it("keeps the order it is given (already sorted by start time upstream)", () => {
    const events = [classEvent(1), classEvent(2), classEvent(3)];

    expect(dayColumnContent(events).chips.map((e) => e.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
});
