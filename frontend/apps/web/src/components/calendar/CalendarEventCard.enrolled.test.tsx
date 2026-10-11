/**
 * PAD-578 — calendar.view rule 6 ("A student's own class carries a mark that is not a colour"):
 * on the desktop card a student's enrolled class carries the ✓ (`calendar-enrolled-mark`,
 * labelled), an open spot carries the chip and no ✓, a canceled class no ✓, and a coach's
 * calendar no ✓ at all. Rule 13: the student legend adds "Inscrito" and "Vagas por preencher".
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/types";
import { CalendarEventCard } from "./CalendarEventCard";
import { CalendarLegend } from "./CalendarLegend";
import { CalendarViewerProvider } from "./viewer-context";

// The web unit harness loads no locale tree; the keys are what the cards and the legend
// ask for (the pt/en strings are pinned by the mobile locale test, same files).
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const cls = (extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    model: "ClassInstance",
    originalId: 7,
    id: "class-7-2026-10-19",
    type: "class",
    isRecurring: false,
    title: "PEAK PERFORMANCE",
    date: "2026-10-19",
    startTime: "09:00",
    endTime: "10:30",
    color: "#1355DC",
    status: "scheduled",
    maxPlayers: 16,
    participantCount: 12,
    ...extra,
  }) as CalendarEvent;

describe("desktop card ✓ (PAD-578)", () => {
  it("a student's enrolled class is ticked, with an accessible label", () => {
    render(
      <CalendarViewerProvider viewer="student">
        <CalendarEventCard event={cls()} />
      </CalendarViewerProvider>
    );
    const mark = screen.getByTestId("calendar-enrolled-mark");
    expect(mark.getAttribute("aria-label")).toBe("calendar.eventCard.enrolled");
    expect(screen.getByTestId("calendar-event-card").getAttribute("draggable")).toBe("true");
  });

  it("an open spot carries the chip and no tick; a canceled class no tick", () => {
    render(
      <CalendarViewerProvider viewer="student">
        <CalendarEventCard event={cls({ openSpot: true })} />
        <CalendarEventCard event={cls({ id: "c2", status: "canceled" })} />
      </CalendarViewerProvider>
    );
    expect(screen.queryByTestId("calendar-enrolled-mark")).toBeNull();
    expect(screen.getByTestId("calendar-open-spot-chip")).toBeTruthy();
  });

  it("a coach (default viewer) sees no tick", () => {
    render(<CalendarEventCard event={cls()} />);
    expect(screen.queryByTestId("calendar-enrolled-mark")).toBeNull();
  });
});

describe("desktop legend for a student (rule 13)", () => {
  it("adds Inscrito ✓ and the open-spot outline ahead of the shared items", () => {
    render(
      <CalendarViewerProvider viewer="student">
        <CalendarLegend />
      </CalendarViewerProvider>
    );
    const legend = screen.getByTestId("calendar-legend");
    expect(legend.querySelector('[data-testid="calendar-legend-enrolled"]')).not.toBeNull();
    expect(legend.querySelector('[data-testid="calendar-legend-open-spots"]')).not.toBeNull();
    const text = legend.textContent ?? "";
    expect(text.indexOf("calendar.legend.enrolled")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("calendar.legend.openSpots")).toBeLessThan(text.indexOf("calendar.legend.next"));
  });

  it("the coach legend is unchanged", () => {
    render(<CalendarLegend />);
    expect(screen.queryByTestId("calendar-legend-enrolled")).toBeNull();
    expect(screen.queryByTestId("calendar-legend-open-spots")).toBeNull();
  });
});
