import { describe, expect, it } from "vitest";
import {
  DAY_HEADER_HEIGHT,
  GRID_ROW_HEIGHT,
  MONTH_WEEKDAY_HEADER_HEIGHT,
  SHEET_COLLAPSED_HEIGHT,
  SHEET_HANDLE_HEIGHT,
  clampSheetTop,
  gridBottomInset,
  eventBlockGeometry,
  groupOverlappingEvents,
  desktopHourRange,
  layoutDayColumn,
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

  it("clamps to 07:00–23:00 while every class fits inside", () => {
    expect(resolveHourRange([ev("a", "07:00", "22:30")])).toEqual({ startHour: 7, endHour: 23 });
  });

  it("never cuts a class: one outside 07:00–23:00 widens the grid to its whole hours (B-544)", () => {
    expect(resolveHourRange([ev("a", "06:00", "23:00")])).toEqual({ startHour: 6, endHour: 23 });
    expect(resolveHourRange([ev("a", "05:30", "06:30")])).toEqual({ startHour: 5, endHour: 8 });
  });

  it("a class ending at midnight ends at 24:00, not 00:00 (B-544, PAD-553)", () => {
    expect(resolveHourRange([ev("a", "09:00", "10:00"), ev("late", "22:30", "00:00")])).toEqual({
      startHour: 8,
      endHour: 24,
    });
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

  it("a class ending at midnight runs to the bottom of 23:00, not above its start (B-544)", () => {
    expect(eventBlockGeometry(ev("late", "22:30", "00:00"), { startHour: 7, rowHeight: 60 })).toEqual({
      top: 930,
      height: 90,
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

describe("layoutDayEvents — a dense day (PAD-625, B-543)", () => {
  // 22 classes, 60 min each, one every 40 min: each overlaps only its neighbours, so at
  // most TWO run at any moment — the day needs two columns, not twenty-two.
  const chain = Array.from({ length: 22 }, (_, i) => {
    const start = 7 * 60 + 40 * i;
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return ev(`d${i}`, hhmm(start), hhmm(start + 60));
  });

  it("packs a chain of overlaps into as many columns as run at once", () => {
    const laid = layoutDayEvents(chain, { startHour: 7, rowHeight: 60 });
    expect(laid).toHaveLength(22);
    expect(Math.max(...laid.map((l) => l.columns))).toBe(2);
    expect(laid.map((l) => l.column)).toEqual(chain.map((_, i) => i % 2));
  });

  it("a lane freed by an ended class is reused", () => {
    const laid = layoutDayEvents(
      [ev("a", "09:00", "11:00"), ev("b", "09:30", "10:00"), ev("c", "10:00", "10:30")],
      { startHour: 7, rowHeight: 60 }
    );
    expect(laid.map((l) => [l.event.id, l.column, l.columns])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 1, 2],
    ]);
  });
});

describe("layoutDayColumn — the cap and its '+N' marker (B-543)", () => {
  const four = [
    ev("a", "18:00", "19:00"),
    ev("b", "18:00", "19:00"),
    ev("c", "18:00", "19:00"),
    ev("d", "18:30", "19:30"),
  ];

  it("over the cap: the first lanes render and the last column holds one marker with the rest", () => {
    const { blocks, overflow } = layoutDayColumn(four, { startHour: 7, rowHeight: 60, maxColumns: 3 });
    expect(blocks.map((b) => [b.event.id, b.column, b.columns])).toEqual([
      ["a", 0, 3],
      ["b", 1, 3],
    ]);
    expect(overflow).toHaveLength(1);
    expect(overflow[0].events.map((e) => e.id)).toEqual(["c", "d"]);
    expect([overflow[0].column, overflow[0].columns]).toEqual([2, 3]);
    // spans 18:00–19:30 on a 60 px/h grid from 07:00
    expect([overflow[0].top, overflow[0].height]).toEqual([660, 90]);
  });

  it("at or under the cap nothing is hidden", () => {
    const { blocks, overflow } = layoutDayColumn(four.slice(0, 3), { startHour: 7, rowHeight: 60, maxColumns: 3 });
    expect(blocks).toHaveLength(3);
    expect(overflow).toEqual([]);
  });

  it("the 22-class chain needs no marker even at a cap of two", () => {
    const chain = Array.from({ length: 22 }, (_, i) => {
      const start = 7 * 60 + 40 * i;
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return ev(`d${i}`, hhmm(start), hhmm(start + 60));
    });
    const { blocks, overflow } = layoutDayColumn(chain, { startHour: 7, rowHeight: 60, maxColumns: 2 });
    expect(blocks).toHaveLength(22);
    expect(overflow).toEqual([]);
  });

  it("a class ending at midnight overlaps the 23:00 class beside it (PAD-553)", () => {
    const { blocks } = layoutDayColumn(
      [ev("late", "22:30", "00:00"), ev("later", "23:00", "23:30")],
      { startHour: 7, rowHeight: 60 }
    );
    expect(blocks.map((b) => [b.event.id, b.column, b.columns])).toEqual([
      ["late", 0, 2],
      ["later", 1, 2],
    ]);
  });
});

describe("desktopHourRange — the desktop week (B-544, calendar.view rule 21)", () => {
  it("07:00–22:00 while every class fits", () => {
    expect(desktopHourRange([ev("a", "09:00", "10:00"), ev("b", "20:00", "21:30")])).toEqual({ startHour: 7, endHour: 22 });
    expect(desktopHourRange([])).toEqual({ startHour: 7, endHour: 22 });
  });

  it("widens to the whole hours of a class outside it, midnight included", () => {
    expect(desktopHourRange([ev("early", "05:30", "06:30"), ev("late", "22:30", "00:00")])).toEqual({
      startHour: 5,
      endHour: 24,
    });
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

/**
 * PAD-286 — calendar.mobile-views rule 17: in Mês the sheet's container is the
 * month grid plus the single-day grid, and `gridTop` says where the day grid
 * starts inside it. Criterion: "The Mês sheet rises past half of the screen".
 */
describe("sheetTopBounds with a month grid above the day grid (gridTop)", () => {
  it("rests right under the month grid, filling everything below it (PAD-436)", () => {
    // 574pt container: 300pt of month grid, the sheet takes the other 274pt at rest. There is no
    // day grid under it any more (rule 17): the owner saw the selected day twice.
    const b = sheetTopBounds(574, { rowHeight: 44, collapsedHeight: 104, gridTop: 300 });
    expect(b.initial).toBe(300);
  });

  it("rises to one hour row below the top of the month grid, so it covers more than half a phone", () => {
    const b = sheetTopBounds(574, { rowHeight: 44, collapsedHeight: 104, gridTop: 300 });
    expect(b.min).toBe(44);
    expect(b.max).toBe(574 - 104);
    // Sheet height at its highest, on an 844pt phone.
    expect(574 - b.min).toBeGreaterThan(844 / 2);
  });

  it("is the old behaviour when gridTop is 0 or omitted", () => {
    expect(sheetTopBounds(420, { rowHeight: 40, collapsedHeight: 94, gridTop: 0 })).toEqual(
      sheetTopBounds(420, { rowHeight: 40, collapsedHeight: 94 })
    );
  });

  it("keeps the resting height inside the bounds when the day grid is tiny", () => {
    const b = sheetTopBounds(400, { rowHeight: 44, collapsedHeight: 104, gridTop: 360 });
    expect(b.initial).toBe(b.max);
    expect(isSheetRaised(b.initial, b)).toBe(false);
  });
});

/**
 * PAD-286 review (Session I): the Mês sheet's maximum must leave the weekday
 * header fully visible — rule 17. The header row is a fixed shared height on
 * both shells, so this pin is the whole guarantee.
 */
describe("the Mês sheet's maximum leaves the weekday header visible", () => {
  it("one grid row is taller than the weekday header row", () => {
    expect(MONTH_WEEKDAY_HEADER_HEIGHT).toBeLessThan(GRID_ROW_HEIGHT);
    const b = sheetTopBounds(574, { rowHeight: GRID_ROW_HEIGHT, collapsedHeight: SHEET_COLLAPSED_HEIGHT, gridTop: 300 });
    expect(b.min).toBeGreaterThan(MONTH_WEEKDAY_HEADER_HEIGHT);
  });

  it("the collapsed height is the handle row plus the day header, declared once", () => {
    expect(SHEET_COLLAPSED_HEIGHT).toBe(SHEET_HANDLE_HEIGHT + DAY_HEADER_HEIGHT);
    expect(SHEET_HANDLE_HEIGHT).toBeGreaterThanOrEqual(28);
  });
});

/**
 * PAD-790 (B-710), rule 13: the day sheet floats over the week grid, so the grid's scroll content
 * ends with padding as tall as the part the sheet covers, and never shorter than the floating
 * buttons' clearance. Criterion "The last hour clears the sheet".
 */
describe("gridBottomInset (PAD-790)", () => {
  it("is the part of the grid the sheet covers, at rest", () => {
    // 700 tall, sheet resting at 60% (420): it covers 280.
    expect(gridBottomInset(700, 420, 168)).toBe(280);
  });

  it("follows a raised sheet", () => {
    expect(gridBottomInset(700, GRID_ROW_HEIGHT, 168)).toBe(700 - GRID_ROW_HEIGHT);
  });

  it("never drops below the floating buttons' clearance with the sheet lowered", () => {
    expect(gridBottomInset(700, 700 - SHEET_COLLAPSED_HEIGHT, 168)).toBe(168);
  });

  it("is the clearance alone before the grid is measured", () => {
    expect(gridBottomInset(0, null, 168)).toBe(168);
    expect(gridBottomInset(700, null, 168)).toBe(168);
  });
});
