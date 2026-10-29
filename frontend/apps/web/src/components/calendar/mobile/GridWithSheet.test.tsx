import { act, render, screen } from "@testing-library/react";
import { GRID_ROW_HEIGHT, SHEET_COLLAPSED_HEIGHT } from "@levelup/config";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GridWithSheet } from "./GridWithSheet";
import { FAB_CLEARANCE_PX } from "./layout";

// The sheet's committed position is what the grid's padding follows; the drag itself is DaySheet's.
let latestTopChange: ((top: number) => void) | null = null;
vi.mock("./DaySheet", () => ({
  DaySheet: (p: { top: number; onTopChange: (top: number) => void }) => {
    latestTopChange = p.onTopChange;
    return <div data-testid="calendar-day-sheet" style={{ top: p.top }} />;
  },
}));

/**
 * PAD-436 — calendar.mobile-views rule 17: in Mês the selected day is shown once, by the sheet.
 * A single-day time grid under the month grid showed it twice (the owner's report: "o dia
 * selecionado aparece duas vezes"). Semana keeps its week grid. jsdom has no layout, so where
 * the sheet rests is pinned by `sheetTopBounds` in @levelup/config; this pins what renders.
 */
// jsdom has no ResizeObserver; GridWithSheet measures with one. Nothing here depends on sizes.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const day = new Date(2026, 9, 29);
const props = {
  days: [day],
  selectedDay: day,
  onSelectDay: vi.fn(),
  eventsByDay: {},
  rangeEvents: [],
};

describe("GridWithSheet (PAD-436)", () => {
  it("renders no time grid under a block above (Mês)", () => {
    render(<GridWithSheet {...props} above={<div data-testid="month-grid-stub" />} />);
    expect(screen.getByTestId("month-grid-stub")).toBeTruthy();
    expect(screen.queryByTestId("calendar-time-grid")).toBeNull();
    expect(screen.getByTestId("calendar-month-sheet-space")).toBeTruthy();
  });

  it("keeps the time grid when nothing is above it (Semana)", () => {
    render(<GridWithSheet {...props} />);
    expect(screen.getByTestId("calendar-time-grid")).toBeTruthy();
  });
});

/**
 * PAD-790 (B-710) — rule 13: the sheet floats over the week grid, so the grid's scroll content ends
 * with a spacer as tall as the part the sheet covers, never shorter than the floating buttons'
 * clearance, following the sheet's committed position. Criterion "The last hour clears the sheet".
 */
describe("GridWithSheet bottom inset (PAD-790)", () => {
  it("is the part the sheet covers at rest, and follows the sheet raised and lowered", async () => {
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 800 });
    try {
      render(<GridWithSheet {...props} />);
      const spacer = () => screen.getByTestId("calendar-grid-end-space");
      const sheet = await screen.findByTestId("calendar-day-sheet");
      expect(sheet.style.top).toBe("480px"); // rests at 60% of 800
      expect(spacer().style.height).toBe(`${800 - 480}px`);

      act(() => latestTopChange!(GRID_ROW_HEIGHT));
      expect(spacer().style.height).toBe(`${800 - GRID_ROW_HEIGHT}px`);

      act(() => latestTopChange!(800 - SHEET_COLLAPSED_HEIGHT));
      expect(spacer().style.height).toBe(`${FAB_CLEARANCE_PX}px`);
    } finally {
      if (height) Object.defineProperty(HTMLElement.prototype, "clientHeight", height);
    }
  });
});
