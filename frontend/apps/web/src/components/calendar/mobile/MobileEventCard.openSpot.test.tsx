/**
 * B-541 (PAD-579) — eligibility.open-spot-visibility rule 11, calendar.mobile-views rules 5, 10, 13
 * on the phone web shell: an open-spot class is the dashed outline in the class colour with
 * readable ink and the "Open spot" chip, on the day card and on the Semana grid block alike,
 * and the day's dot is the class colour. jsdom drops `hsl(var(--card))` and `color-mix(...)`
 * inline values, so the surface and the ink are pinned by `calendar-card.test.ts` on the shared
 * helper; here the variant and the dashed border prove the card resolved through it.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { CalendarEvent } from "@levelup/types";
import { MobileEventCard } from "./MobileEventCard";
import { TimeGrid } from "./TimeGrid";
import { dotColor } from "./DayStrip";
import { CalendarViewerProvider } from "../viewer-context";

// The class is "upcoming" only while the clock is before it: pin the clock, derive every fixture date from DAY.
const DAY = "2026-10-19";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const BLUE = "#1355DC";
const NOW = new Date(2026, 9, 10, 12, 0);

const openSpot = (extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    model: "ClassInstance",
    originalId: 7,
    id: `class-7-${DAY}`,
    type: "class",
    title: "PEAK PERFORMANCE",
    date: DAY,
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
        eventsByDay={{ [DAY]: [openSpot()] }}
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

// PAD-578 (calendar.mobile-views rule 19): a student's enrolled class is ticked on the card and
// the grid block; an open spot carries the chip and no tick; a coach sees no tick.
describe("the ✓ on a student's enrolled class (PAD-578)", () => {
  const enrolled = () => openSpot({ id: `class-8-${DAY}`, openSpot: false, title: "Treino" });
  const day = new Date(2026, 9, 19);

  it("marks the card for a student, not an open spot", () => {
    render(
      <CalendarViewerProvider viewer="student">
        <MobileEventCard event={enrolled()} now={NOW} />
        <MobileEventCard event={openSpot()} now={NOW} />
      </CalendarViewerProvider>
    );
    const cards = screen.getAllByTestId("calendar-event-card");
    expect(cards[0].querySelector('[data-testid="calendar-enrolled-mark"]')).not.toBeNull();
    expect(cards[1].querySelector('[data-testid="calendar-enrolled-mark"]')).toBeNull();
    expect(cards[1].querySelector('[data-testid="calendar-open-spot-chip"]')).not.toBeNull();
  });

  it("marks the grid block for a student", () => {
    render(
      <CalendarViewerProvider viewer="student">
        <TimeGrid
          weekDays={[day]}
          selectedDay={day}
          onSelectDay={() => undefined}
          eventsByDay={{ [DAY]: [enrolled(), openSpot()] }}
          hourRange={{ startHour: 8, endHour: 12 }}
        />
      </CalendarViewerProvider>
    );
    const blocks = screen.getAllByTestId("calendar-grid-block");
    const marked = blocks.filter((b) => b.querySelector('[data-testid="calendar-enrolled-mark"]'));
    expect(marked.map((b) => b.getAttribute("data-event-id"))).toEqual([`class-8-${DAY}`]);
  });

  it("a coach (the default viewer) sees no tick", () => {
    render(<MobileEventCard event={enrolled()} now={NOW} />);
    expect(screen.queryByTestId("calendar-enrolled-mark")).toBeNull();
  });
});

// B-543 (calendar.mobile-views rule 13): past two classes at once, one "+N" selects the day.
describe("the phone grid on a busy hour (B-543)", () => {
  it("three at 18:00: one block and a '+2' that selects the day", () => {
    const day = new Date(2026, 9, 28);
    const onSelectDay = vi.fn();
    const at6 = (id: string) => openSpot({ id, openSpot: false, title: id, date: "2026-10-28", startTime: "18:00", endTime: "19:00" });
    render(
      <TimeGrid
        weekDays={[day]}
        selectedDay={new Date(2026, 9, 27)}
        onSelectDay={onSelectDay}
        eventsByDay={{ "2026-10-28": [at6("x1"), at6("x2"), at6("x3")] }}
        hourRange={{ startHour: 17, endHour: 20 }}
      />
    );
    expect(screen.getAllByTestId("calendar-grid-block")).toHaveLength(1);
    const marker = screen.getByTestId("calendar-overflow");
    expect(marker.getAttribute("data-count")).toBe("2");
    fireEvent.click(marker);
    expect(onSelectDay).toHaveBeenCalledWith(day);
  });
});

// PAD-611 (calendar.mobile-views rule 5): the student's relations on the phone card and dots.
describe("the phone card — a student's relations (PAD-611)", () => {
  const rel = (studentRelation: CalendarEvent["studentRelation"], id: string) =>
    openSpot({ id, openSpot: false, studentRelation });

  it("invited is dashed with its chip; waiting is dotted with its chip; 'Não vou' has its chip and no ✓", () => {
    render(
      <CalendarViewerProvider viewer="student">
        <MobileEventCard event={rel("invited", "i1")} now={NOW} />
        <MobileEventCard event={rel("waiting", "w1")} now={NOW} />
        <MobileEventCard event={rel("not_coming", "n1")} now={NOW} />
      </CalendarViewerProvider>
    );
    const cards = screen.getAllByTestId("calendar-event-card");
    expect(cards.map((c) => c.getAttribute("data-event-state"))).toEqual(["invited", "waiting", "not-coming"]);
    // PAD-664: a student's card is painted by the relation (blue `primary`, a CSS variable jsdom
    // drops), never by the coach colour; the surface is pinned on the shared helper in
    // calendar-card.test.ts.
    expect(cards[0].style.border.toLowerCase()).not.toContain(BLUE.toLowerCase());
    expect(screen.queryByTestId("calendar-enrolled-mark")).toBeNull();
    // This file renders with the real pt locale: the keys resolve.
    expect(screen.getAllByTestId("calendar-relation-chip").map((c) => c.textContent)).toEqual([
      "Convite",
      "Em lista de espera",
      "Não vou",
    ]);
  });

  it("control: the same invited card read by the coach keeps the class colour (R-032)", () => {
    render(
      <CalendarViewerProvider viewer="coach">
        <MobileEventCard event={rel("invited", "i3")} now={NOW} />
      </CalendarViewerProvider>
    );
    expect(screen.getByTestId("calendar-event-card").style.border.toLowerCase()).toBe(
      `1.5px dashed ${BLUE.toLowerCase()}`
    );
  });
  it("dots (coach viewer, unchanged): invited takes the class colour, waiting is muted", () => {
    expect(dotColor(rel("invited", "i2"), NOW)).toBe(BLUE);
    expect(dotColor(rel("waiting", "w2"), NOW)).toBe("hsl(var(--muted-foreground))");
  });

  it("dots (student viewer): the relation family, never the coach colour", () => {
    expect(dotColor(rel("invited", "i3"), NOW, "student")).toBe("hsl(var(--primary))");
    expect(dotColor(rel("waiting", "w3"), NOW, "student")).toBe("hsl(var(--warning))");
    expect(dotColor(rel("full", "f3"), NOW, "student")).toBe("hsl(var(--warning))");
    expect(dotColor(rel("open_spot", "o3"), NOW, "student")).toBe("hsl(var(--muted-foreground))");
  });
});

// PAD-664 (calendar.view rule 23): the phone card for a full class.
describe("the phone card — a full class (PAD-664)", () => {
  it("full: the 'Cheia' chip, no ✓, and never an amber seats-short flag", () => {
    render(
      <CalendarViewerProvider viewer="student">
        <MobileEventCard event={openSpot({ id: "f2", studentRelation: "full" })} now={NOW} />
      </CalendarViewerProvider>
    );
    const card = screen.getByTestId("calendar-event-card");
    expect(card.getAttribute("data-event-state")).toBe("full");
    expect(card.getAttribute("data-needs-players")).toBe("false");
    expect(screen.queryByTestId("calendar-enrolled-mark")).toBeNull();
    expect(screen.getByTestId("calendar-relation-chip").textContent).toBe("Cheia");
  });
});
