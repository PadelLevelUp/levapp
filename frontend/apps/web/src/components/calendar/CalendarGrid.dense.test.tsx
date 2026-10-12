/**
 * B-543 (PAD-625) — calendar.view rule 20, "A dense day on desktop keeps every class readable":
 * overlapping classes take as many columns as run at once; past three, one "+N" marker lists the
 * rest and choosing one opens it as its card would.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/types";
import { CalendarGrid } from "./CalendarGrid";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, o?: { count?: number }) => (o?.count != null ? `${key}:${o.count}` : key),
    i18n: { language: "pt" },
  }),
}));

const day = new Date(2026, 9, 28);
const cls = (id: string, startTime: string, endTime: string): CalendarEvent =>
  ({
    model: "LessonInstance",
    originalId: Number(id.replace(/\D/g, "")) || 1,
    id,
    type: "class",
    isRecurring: false,
    title: `Aula ${id}`,
    date: "2026-10-28",
    startTime,
    endTime,
    color: "#1355DC",
    status: "scheduled",
    maxPlayers: 4,
    participantCount: 2,
  }) as CalendarEvent;

const widthOf = (el: HTMLElement) => el.style.width;

describe("desktop grid on a dense day (rule 20, B-543)", () => {
  it("a chain of 22 classes, two at a time, takes two columns, no marker", () => {
    const chain = Array.from({ length: 22 }, (_, i) => {
      const s = 7 * 60 + 40 * i;
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return cls(`d${i}`, hhmm(s), hhmm(s + 60));
    });
    render(<CalendarGrid weekDays={[day]} events={chain} startHour={7} endHour={23} />);
    const cards = screen.getAllByTestId("calendar-event-card");
    expect(cards).toHaveLength(22);
    expect(new Set(cards.map(widthOf))).toEqual(new Set(["50%"]));
    expect(screen.queryByTestId("calendar-overflow")).toBeNull();
  });

  it("four at 18:00: two cards and a '+2' that lists the others and opens one", () => {
    const onEventClick = vi.fn();
    const four = [cls("a1", "18:00", "19:00"), cls("b2", "18:00", "19:00"), cls("c3", "18:00", "19:00"), cls("d4", "18:30", "19:30")];
    render(<CalendarGrid weekDays={[day]} events={four} startHour={7} endHour={23} onEventClick={onEventClick} />);
    expect(screen.getAllByTestId("calendar-event-card")).toHaveLength(2);
    const marker = screen.getByTestId("calendar-overflow");
    expect(marker.textContent).toBe("calendar.overflow.label:2");
    expect(marker.getAttribute("aria-label")).toBe("calendar.overflow.aria:2");
    fireEvent.click(marker);
    const list = screen.getByTestId("calendar-overflow-list");
    const items = within(list).getAllByTestId("calendar-overflow-item");
    expect(items.map((i) => i.textContent)).toEqual(["Aula c318:00–19:00", "Aula d418:30–19:30"]);
    fireEvent.click(items[1]);
    expect(onEventClick).toHaveBeenCalledWith(expect.objectContaining({ id: "d4" }));
  });
});
