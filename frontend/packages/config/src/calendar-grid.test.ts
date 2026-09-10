import { describe, expect, it } from "vitest";
import {
  clampSheetTop,
  eventBlockGeometry,
  groupOverlappingEvents,
  layoutDayEvents,
  resolveHourRange,
  sheetTopBounds,
  isSheetRaised,
} from "./calendar-grid";

/**
 * calendar.mobile-views rules 3 and 13 — the Semana time grid and the day
 * sheet, shared by web and iOS so the two shells cannot disagree on where a
 * block sits or how far the sheet may travel.
 *
 * Criteria: "Week time grid positions events by minutes", "Empty week shows
 * the default range", "Bottom sheet resizes within bounds".
 */
const ev = (id: string, startTime: string, endTime: string, date = "2026-09-08") => ({
  id,
  date,
  startTime,
  endTime,
});

describe("resolveHourRange", () => {
  it("runs from one hour before the earliest start to one hour after the latest end", () => {
    const range = resolveHourRange([ev("a", "10:00", "11:30"), ev("b", "16:15", "17:45")]);
    expect(range).toEqual({ startHour: 9, endHour: 19 });
  });

  it("rounds to whole hours outward", () => {
    expect(resolveHourRange([ev("a", "10:30", "11:15")])).toEqual({ startHour: 9, endHour: 13 });
  });

  it("clamps to 07:00–23:00", () => {
    expect(resolveHourRange([ev("a", "07:00", "22:30")])).toEqual({ startHour: 7, endHour: 23 });
    expect(resolveHourRange([ev("a", "06:00", "23:00")])).toEqual({ startHour: 7, endHour: 23 });
  });

  it("an empty week shows 08:00–20:00", () => {
    expect(resolveHourRange([])).toEqual({ startHour: 8, endHour: 20 });
  });

  it("ignores events without times", () => {
    expect(resolveHourRange([{ id: "x", date: "2026-09-08" }])).toEqual({
      startHour: 8,
      endHour: 20,
    });
  });
});

describe("eventBlockGeometry", () => {
  it("top and height come from start and end minutes", () => {
    expect(eventBlockGeometry(ev("a", "10:00", "11:30"), { startHour: 8, rowHeight: 40 })).toEqual({
      top: 80,
      height: 60,
    });
  });

  it("a very short event keeps the 18px floor", () => {
    expect(eventBlockGeometry(ev("a", "10:00", "10:05"), { startHour: 8, rowHeight: 40 })).toEqual({
      top: 80,
      height: 18,
    });
  });

  it("returns null without times", () => {
    expect(eventBlockGeometry({ id: "x", date: "2026-09-08" }, { startHour: 8, rowHeight: 40 })).toBeNull();
  });
});

describe("groupOverlappingEvents", () => {
  it("puts intersecting events in one group and adjacent ones apart", () => {
    const a = ev("a", "15:00", "16:00");
    const b = ev("b", "15:30", "16:30");
    const c = ev("c", "16:30", "17:00");
    expect(groupOverlappingEvents([a, b, c])).toEqual([[a, b], [c]]);
  });
});

describe("layoutDayEvents", () => {
  it("gives overlapping events side-by-side columns", () => {
    const laid = layoutDayEvents(
      [ev("a", "15:00", "16:00"), ev("b", "15:30", "16:30"), ev("c", "17:00", "18:00")],
      { startHour: 8, rowHeight: 40 }
    );
    expect(laid.map((l) => [l.event.id, l.column, l.columns, l.top, l.height])).toEqual([
      ["a", 0, 2, 280, 40],
      ["b", 1, 2, 300, 40],
      ["c", 0, 1, 360, 40],
    ]);
  });
});

describe("sheetTopBounds / clampSheetTop", () => {
  it("min leaves one hour row visible, max shows the header only, initial is 60% down", () => {
    expect(sheetTopBounds(420, { rowHeight: 40, collapsedHeight: 94 })).toEqual({
      min: 40,
      max: 326,
      initial: 252,
    });
  });

  it("initial is clamped when the grid is tiny", () => {
    expect(sheetTopBounds(100, { rowHeight: 40, collapsedHeight: 94 })).toEqual({
      min: 40,
      max: 6,
      initial: 6,
    });
  });

  it("clamps a drag to the bounds", () => {
    const b = { min: 40, max: 326 };
    expect(clampSheetTop(10, b)).toBe(40);
    expect(clampSheetTop(400, b)).toBe(326);
    expect(clampSheetTop(200, b)).toBe(200);
  });
});

/**
 * PAD-248 rule 18 (coordinator decision): in Mês the add buttons step aside
 * while the day sheet is dragged above its resting height.
 * Criterion: "Add buttons step aside while the Mês sheet is pulled up".
 */
describe("isSheetRaised", () => {
  const b = { min: 44, max: 241, initial: 201 };

  it("is false at the resting height and below it", () => {
    expect(isSheetRaised(201, b)).toBe(false);
    expect(isSheetRaised(230, b)).toBe(false);
    expect(isSheetRaised(241, b)).toBe(false);
  });

  it("is true once the sheet is dragged above its resting height", () => {
    expect(isSheetRaised(200, b)).toBe(true);
    expect(isSheetRaised(44, b)).toBe(true);
  });

  it("with no room to rest above the collapsed height, only a drag up counts", () => {
    const tight = { min: 44, max: 60, initial: 60 };
    expect(isSheetRaised(60, tight)).toBe(false);
    expect(isSheetRaised(50, tight)).toBe(true);
  });
});
