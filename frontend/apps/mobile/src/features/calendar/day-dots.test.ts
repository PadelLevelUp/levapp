import { fadeColorNative, lightTheme, nativeCalendarSurfaces } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { describe, expect, it } from "vitest";
import { dayDotColors, MAX_DAY_DOTS } from "./day-dots";

/**
 * calendar.mobile-views rule 10 — the Dia strip shows dots, never chips.
 * Criterion: "Dia strip shows dots, never chips".
 */
const NOW = new Date("2026-09-08T12:00:00");
const SURFACES = nativeCalendarSurfaces("light");

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    model: "LessonInstance",
    originalId: 1,
    id: "e",
    type: "class",
    isRecurring: false,
    title: "Aula",
    date: "2026-09-08",
    startTime: "14:00",
    endTime: "15:00",
    status: "scheduled",
    participantCount: 4,
    maxPlayers: 6,
    ...overrides,
  };
}

describe("dayDotColors", () => {
  it("paints a scheduled class in its own colour, in the order given", () => {
    const colors = dayDotColors(
      [event({ id: "a", color: "#0EA5E9" }), event({ id: "b", color: "#8B5CF6" })],
      SURFACES,
      NOW
    );
    expect(colors).toEqual(["#0EA5E9", "#8B5CF6"]);
  });

  it("caps at three dots", () => {
    const events = ["#1355DC", "#0EA5E9", "#0891B2", "#0D9488"].map((color, i) =>
      event({ id: String(i), color })
    );
    expect(dayDotColors(events, SURFACES, NOW)).toHaveLength(MAX_DAY_DOTS);
  });

  it("a canceled class is red, a block is muted, a finished class is faded", () => {
    const colors = dayDotColors(
      [
        event({ id: "c", color: "#0EA5E9", status: "canceled" }),
        event({ id: "d", type: "block", blockType: "break", maxPlayers: undefined }),
        event({ id: "e", color: "#0EA5E9", status: "completed", startTime: "08:00", endTime: "09:00" }),
      ],
      SURFACES,
      NOW
    );
    expect(colors).toEqual([
      lightTheme.destructive,
      SURFACES.mutedForeground,
      fadeColorNative("#0EA5E9", SURFACES),
    ]);
  });

  it("a class without a colour falls back to primary", () => {
    expect(dayDotColors([event({ color: undefined })], SURFACES, NOW)).toEqual([
      lightTheme.primary,
    ]);
  });
});
