import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GridWithSheet } from "./GridWithSheet";

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
