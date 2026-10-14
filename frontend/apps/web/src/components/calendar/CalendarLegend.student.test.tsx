/** PAD-664 (calendar.view rule 23): the student's legend follows the filter; the coach's is unchanged. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalendarLegend } from "./CalendarLegend";
import { CalendarViewerProvider } from "./viewer-context";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const variants = () => screen.getAllByTestId("calendar-legend-item").map((i) => i.getAttribute("data-variant"));

describe("the student legend", () => {
  it("'eligible' lists all six states", () => {
    render(<CalendarViewerProvider viewer="student"><CalendarLegend studentFilter="eligible" /></CalendarViewerProvider>);
    expect(variants()).toEqual(["scheduled", "invited", "waiting", "not-coming", "open-spot", "full"]);
  });
  it("defaults to the eligible list", () => {
    render(<CalendarViewerProvider viewer="student"><CalendarLegend /></CalendarViewerProvider>);
    expect(variants()).toHaveLength(6);
  });
  it("'mine' drops the two offers", () => {
    render(<CalendarViewerProvider viewer="student"><CalendarLegend studentFilter="mine" /></CalendarViewerProvider>);
    expect(variants()).toEqual(["scheduled", "invited", "waiting", "not-coming"]);
  });
});

describe("the coach legend", () => {
  it("is unchanged: no student items, the coach keys and the fill key", () => {
    render(<CalendarLegend studentFilter="mine" />);
    expect(screen.queryAllByTestId("calendar-legend-item")).toHaveLength(0);
    const text = screen.getByTestId("calendar-legend").textContent ?? "";
    for (const k of ["next", "full", "done", "event", "fill"]) expect(text).toContain(`calendar.legend.${k}`);
  });
});
