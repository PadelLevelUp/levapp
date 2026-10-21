/**
 * PAD-578 — calendar.view rule 6 ("A student's own class carries a mark that is not a colour"):
 * on the desktop card a student's enrolled class carries the ✓ (`calendar-enrolled-mark`,
 * labelled), an open spot carries the chip and no ✓, a canceled class no ✓, and a coach's
 * calendar no ✓ at all. Rule 13: the student legend adds "Inscrito" and "Vagas por preencher".
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { CalendarEvent } from "@/types";
import { CalendarEventCard } from "./CalendarEventCard";
import { CalendarLegend } from "./CalendarLegend";
import { CalendarViewerProvider } from "./viewer-context";

// The web unit harness loads no locale tree; the keys are what the cards and the legend
// ask for (the pt/en strings are pinned by the mobile locale test, same files).
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The class is "upcoming" only while the clock is before it: pin the clock, derive every fixture date from DAY.
const DAY = "2026-10-19";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const cls = (extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    model: "ClassInstance",
    originalId: 7,
    id: `class-7-${DAY}`,
    type: "class",
    isRecurring: false,
    title: "PEAK PERFORMANCE",
    date: DAY,
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
  // PAD-664 (rule 23) supersedes PAD-578's student legend: the shared student items, in order.
  it("lists the student's states (enrolled first, open spot after the own ones)", () => {
    render(
      <CalendarViewerProvider viewer="student">
        <CalendarLegend />
      </CalendarViewerProvider>
    );
    const legend = screen.getByTestId("calendar-legend");
    const items = Array.from(legend.querySelectorAll('[data-testid="calendar-legend-item"]'));
    expect(items.map((i) => i.getAttribute("data-variant"))).toEqual([
      "scheduled", "invited", "waiting", "not-coming", "open-spot", "full",
    ]);
    expect(items[0].textContent).toBe("calendar.legend.student.enrolled");
  });

  it("the coach legend is unchanged", () => {
    render(<CalendarLegend />);
    expect(screen.queryByTestId("calendar-legend-enrolled")).toBeNull();
    expect(screen.queryByTestId("calendar-legend-open-spots")).toBeNull();
  });
});

// PAD-611 (calendar.view rule 22): the student's other relations on the desktop card and legend.
describe("desktop card and legend — a student's relations (PAD-611)", () => {
  it("'Não vou': its chip, no ✓; invited and waiting: their chips, no ✓", () => {
    render(
      <CalendarViewerProvider viewer="student">
        <CalendarEventCard event={cls({ id: "n1", studentRelation: "not_coming" })} />
        <CalendarEventCard event={cls({ id: "i1", studentRelation: "invited" })} />
        <CalendarEventCard event={cls({ id: "w1", studentRelation: "waiting" })} />
      </CalendarViewerProvider>
    );
    expect(screen.queryByTestId("calendar-enrolled-mark")).toBeNull();
    const chips = screen.getAllByTestId("calendar-relation-chip");
    expect(chips.map((c) => [c.getAttribute("data-relation"), c.textContent])).toEqual([
      ["not-coming", "calendar.relation.notComing"],
      ["invited", "calendar.relation.invited"],
      ["waiting", "calendar.relation.waiting"],
    ]);
  });

  it("the student legend explains the three", () => {
    render(
      <CalendarViewerProvider viewer="student">
        <CalendarLegend />
      </CalendarViewerProvider>
    );
    const variants = screen
      .getAllByTestId("calendar-legend-item")
      .map((i) => i.getAttribute("data-variant"));
    for (const v of ["invited", "waiting", "not-coming"]) expect(variants).toContain(v);
  });
});

// PAD-664 (calendar.view rule 23): a full class carries its "Cheia" chip, no ✓.
describe("desktop card — a full class (PAD-664)", () => {
  it("full: its chip, resolved for the student viewer, and no ✓", () => {
    render(
      <CalendarViewerProvider viewer="student">
        <CalendarEventCard event={cls({ id: "f1", studentRelation: "full", openSpot: true })} />
      </CalendarViewerProvider>
    );
    expect(screen.queryByTestId("calendar-enrolled-mark")).toBeNull();
    const chip = screen.getByTestId("calendar-relation-chip");
    expect([chip.getAttribute("data-relation"), chip.textContent]).toEqual(["full", "calendar.relation.full"]);
  });
});
