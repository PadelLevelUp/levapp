import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@levelup/types";
import {
  DAY_LIST_MOVE_LIMIT_MS,
  dayListDayAtTop,
  dayListEdges,
  dayListRanges,
  dayListReadParams,
  dayListTailDue,
  nextClassIdInTodayWeek,
} from "./day-list";

/**
 * calendar.mobile-views rule 26 (the continuous Dia): the pure rules the list state and both screens
 * share. The clock is always passed in, so nothing here reads a timer.
 */

const days = [
  { date: "2026-11-23", top: 0 },
  { date: "2026-11-24", top: 300 },
  { date: "2026-11-25", top: 520 },
  { date: "2026-11-26", top: 600 },
];

describe("the day at the top (rule 26a, 26b)", () => {
  it("[CALENDAR-MOBILE-VIEWS-38] the day at the top is the selected day unless a target is in progress", () => {
    // No target: the section that holds the list's top.
    expect(dayListDayAtTop({ days, offset: 310 })).toBe("2026-11-24");
    // A target inside the loaded range, in progress: the target, wherever the list is.
    expect(dayListDayAtTop({ days, offset: 310, target: "2026-11-26", elapsedMs: 200 })).toBe("2026-11-26");
    // A touch ends the movement at once: back to the day at the top.
    expect(dayListDayAtTop({ days, offset: 310, target: "2026-11-26", elapsedMs: 200, touched: true })).toBe("2026-11-24");
    // One second at most.
    expect(DAY_LIST_MOVE_LIMIT_MS).toBe(1000);
    expect(dayListDayAtTop({ days, offset: 310, target: "2026-11-26", elapsedMs: DAY_LIST_MOVE_LIMIT_MS })).toBe("2026-11-24");
    expect(dayListDayAtTop({ days, offset: 310, target: "2026-11-26", elapsedMs: DAY_LIST_MOVE_LIMIT_MS - 1 })).toBe("2026-11-26");
  });

  it("[CALENDAR-MOBILE-VIEWS-38] a target outside the loaded days stays selected, touch or not, until its read is on screen", () => {
    const out = { days, offset: 100, target: "2027-01-12" };
    expect(dayListDayAtTop({ ...out, elapsedMs: 5000, touched: true })).toBe("2027-01-12");
  });

  it("[CALENDAR-MOBILE-VIEWS-38] above the first section the first day is at the top; an empty list has none", () => {
    expect(dayListDayAtTop({ days, offset: -40 })).toBe("2026-11-23");
    expect(dayListDayAtTop({ days: [], offset: 0 })).toBeNull();
  });
});

describe("what Dia loads (rule 26c)", () => {
  // Wednesday 25 Nov 2026; weeks start on Sunday (WEEK_STARTS_ON), so its week is 22–28 Nov.
  const selected = new Date(2026, 10, 25);

  it("[CALENDAR-MOBILE-VIEWS-37] the first read is seven whole weeks, two before the selected day's week and four after", () => {
    const { first, tail } = dayListRanges(selected);
    expect(first.start).toEqual(new Date(2026, 10, 8)); // 22 Nov − 2 weeks
    expect(first.end).toEqual(new Date(2026, 11, 26)); // 28 Nov + 4 weeks
    expect((first.end.getTime() - first.start.getTime()) / 86_400_000 + 1).toBe(49);
    // The tail is the next four weeks, and nothing is ever added above.
    expect(tail.start).toEqual(new Date(2026, 11, 27));
    expect(tail.end).toEqual(new Date(2027, 0, 23));
    expect(dayListReadParams(first)).toEqual({ from: "2026-11-08T00:00:00", to: "2026-12-26T23:59:59" });
  });

  it("[CALENDAR-MOBILE-VIEWS-37] the tail is due within one week of the end of the first read, and not before", () => {
    const ranges = dayListRanges(selected);
    expect(dayListTailDue(new Date(2026, 11, 19), ranges)).toBe(false);
    expect(dayListTailDue(new Date(2026, 11, 20), ranges)).toBe(true); // the first read's last week
    expect(dayListTailDue(new Date(2026, 11, 26), ranges)).toBe(true);
  });

  it("[CALENDAR-MOBILE-VIEWS-37] the edge rows open the first day of the week just outside what is loaded", () => {
    const { first, tail } = dayListRanges(selected);
    expect(dayListEdges(first)).toEqual({ before: new Date(2026, 10, 1), after: new Date(2026, 11, 27) });
    expect(dayListEdges({ start: first.start, end: tail.end })).toEqual({
      before: new Date(2026, 10, 1),
      after: new Date(2027, 0, 24),
    });
  });
});

const cls = (id: string, date: string, startTime: string, endTime: string): CalendarEvent =>
  ({ id, type: "class", date, startTime, endTime, title: id, model: "Lesson", originalId: 1, isRecurring: false }) as CalendarEvent;

describe("the next class (rule 26e)", () => {
  // An instant: 12:00 on the club's clock, Wednesday 25 Nov 2026 (the week is 22–28 Nov).
  const now = new Date("2026-11-25T12:00:00+00:00");

  it("[CALENDAR-MOBILE-VIEWS-44] the next class is searched in the week that holds today", () => {
    const doneThisWeek = cls("done", "2026-11-23", "09:00", "10:00");
    const nextWeek = cls("next-week", "2026-12-02", "18:00", "19:00");
    // This week has no class left and a later one has: no class is outlined.
    expect(nextClassIdInTodayWeek([doneThisWeek, nextWeek], now)).toBeUndefined();
    // With one left this week, that one.
    const thursday = cls("thursday", "2026-11-26", "18:00", "19:00");
    expect(nextClassIdInTodayWeek([nextWeek, doneThisWeek, thursday], now)).toBe("thursday");
    // A class later today counts too.
    const tonight = cls("tonight", "2026-11-25", "19:00", "20:00");
    expect(nextClassIdInTodayWeek([nextWeek, thursday, tonight], now)).toBe("tonight");
  });
});
