/**
 * B-541 (PAD-579) — eligibility.open-spot-visibility rule 11, calendar.mobile-views rules 5, 10, 13
 * on the phone web shell: an open-spot class is the dashed outline in the class colour with
 * readable ink and the "Open spot" chip, on the day card and on the Semana grid block alike,
 * and the day's dot is the class colour. jsdom drops `hsl(var(--card))` and `color-mix(...)`
 * inline values, so the surface and the ink are pinned by `calendar-card.test.ts` on the shared
 * helper; here the variant and the dashed border prove the card resolved through it.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@levelup/types";
import { MobileEventCard } from "./MobileEventCard";
import { TimeGrid } from "./TimeGrid";
import { dotColor } from "./DayStrip";

const BLUE = "#1355DC";
const NOW = new Date(2026, 9, 10, 12, 0);

const openSpot = (extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    model: "ClassInstance",
    originalId: 7,
    id: "class-7-2026-10-19",
    type: "class",
    title: "PEAK PERFORMANCE",
    date: "2026-10-19",
    startTime: "09:00",
    endTime: "10:30",
    color: BLUE,
    maxPlayers: 16,
    participantCount: 12,
    openSpot: true,
    ...extra,
  }) as CalendarEvent;

describe("the phone day card for an open spot", () => {
  it("is the dashed outline in the class colour, readable ink, with the chip", () => {
    render(<MobileEventCard event={openSpot()} now={NOW} />);
    const card = screen.getByTestId("calendar-event-card");
    expect(card.getAttribute("data-event-state")).toBe("open-spot");
    expect(card.style.border.toLowerCase()).toBe(`1.5px dashed ${BLUE.toLowerCase()}`); // jsdom lowercases the hex
    expect(screen.getByTestId("calendar-open-spot-chip")).toBeTruthy();
    expect(screen.getByText("PEAK PERFORMANCE")).toBeTruthy();
    expect(screen.getByText("09:00 – 10:30")).toBeTruthy();
  });

  it("the open spot is never 'next' even when flagged so", () => {
    render(<MobileEventCard event={openSpot()} isNext now={NOW} />);
    expect(screen.getByTestId("calendar-event-card").getAttribute("data-event-state")).toBe("open-spot");
  });
});

describe("the phone Semana grid block for an open spot", () => {
  it("carries the same dashed treatment as the card", () => {
    const day = new Date(2026, 9, 19);
    render(
      <TimeGrid
        weekDays={[day]}
        selectedDay={day}
        onSelectDay={() => undefined}
        eventsByDay={{ "2026-10-19": [openSpot()] }}
        hourRange={{ startHour: 8, endHour: 12 }}
      />
    );
    const block = screen.getByTestId("calendar-grid-block");
    expect(block.getAttribute("data-event-state")).toBe("open-spot");
    expect(block.style.border.toLowerCase()).toBe(`1.5px dashed ${BLUE.toLowerCase()}`);
  });
});

describe("the day's dot for an outlined treatment (rule 10)", () => {
  it("is the class colour for an open spot, never the white card", () => {
    expect(dotColor(openSpot(), NOW)).toBe(BLUE);
  });
});
