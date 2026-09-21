/**
 * classes.availability (PAD-357): the one computation of "when is a private
 * class possible", shared by web and iOS. Minutes never leave the module;
 * windows are HH:MM strings in and out.
 */
import { describe, expect, it } from "vitest";

import {
  addWorkingWindow,
  DEFAULT_WORKING_WINDOW,
  freeWindowsForDay,
  occurrenceDates,
  slotStarts,
  snapToGrid,
  subtractIntervals,
  weeklyIntersection,
  workingWindowsFor,
} from "./availability";
import { hhmmOf, minutesOf } from "./class-request-slots";

const W = (startTime: string, endTime: string) => ({ startTime, endTime });

describe("workingWindowsFor", () => {
  it("falls back to the default window when nothing is set, per day", () => {
    expect(workingWindowsFor(null, 1)).toEqual([DEFAULT_WORKING_WINDOW]);
    expect(workingWindowsFor({}, 3)).toEqual([DEFAULT_WORKING_WINDOW]);
    expect(DEFAULT_WORKING_WINDOW).toEqual(W("08:00", "22:00"));
  });

  it("returns the coach's windows for the weekday, and nothing for a day off", () => {
    const hours = { tue: [["09:00", "13:00"], ["15:00", "21:00"]] as [string, string][], wed: [] as [string, string][] };
    expect(workingWindowsFor(hours, 2)).toEqual([W("09:00", "13:00"), W("15:00", "21:00")]);
    expect(workingWindowsFor(hours, 3)).toEqual([]);
    // a day the coach never mentioned is the default, not a day off
    expect(workingWindowsFor(hours, 4)).toEqual([DEFAULT_WORKING_WINDOW]);
  });
});

describe("subtractIntervals", () => {
  it("cuts busy time out of the windows, half-open", () => {
    expect(subtractIntervals([W("08:00", "22:00")], [W("10:00", "11:00"), W("14:00", "16:00")])).toEqual([
      W("08:00", "10:00"),
      W("11:00", "14:00"),
      W("16:00", "22:00"),
    ]);
    // touching intervals do not eat a minute
    expect(subtractIntervals([W("08:00", "10:00")], [W("10:00", "11:00")])).toEqual([W("08:00", "10:00")]);
    // busy time outside the window is ignored; busy covering the window empties it
    expect(subtractIntervals([W("09:00", "10:00")], [W("07:00", "08:00")])).toEqual([W("09:00", "10:00")]);
    expect(subtractIntervals([W("09:00", "10:00")], [W("08:00", "11:00")])).toEqual([]);
  });
});

describe("freeWindowsForDay", () => {
  it("is working time minus everyone's busy time, dropping short leftovers (spec criterion 1)", () => {
    const working = [W("09:00", "13:00"), W("15:00", "21:00")];
    const coach = [W("10:00", "11:00"), W("16:00", "17:00")];
    const bruno = [W("12:00", "13:00")];
    const carla = [W("19:00", "21:00")];
    expect(freeWindowsForDay(working, [coach, bruno, carla])).toEqual([
      W("09:00", "10:00"),
      W("11:00", "12:00"),
      W("15:00", "16:00"),
      W("17:00", "19:00"),
    ]);
  });

  it("drops windows shorter than minMinutes (default 30)", () => {
    expect(freeWindowsForDay([W("08:00", "10:00")], [[W("08:20", "09:45")]])).toEqual([]);
    expect(freeWindowsForDay([W("08:00", "10:00")], [[W("08:20", "09:45")]], { minMinutes: 15 })).toEqual([
      W("08:00", "08:20"),
      W("09:45", "10:00"),
    ]);
  });
});

describe("occurrenceDates", () => {
  it("lists the recurrence's dates, Monday = 1", () => {
    // 2026-10-06 is a Tuesday
    expect(occurrenceDates({ weekdays: [2, 4], startDate: "2026-10-06", endDate: "2026-10-15" })).toEqual([
      "2026-10-06",
      "2026-10-08",
      "2026-10-13",
      "2026-10-15",
    ]);
    expect(occurrenceDates({ weekdays: [7], startDate: "2026-10-06", endDate: "2026-10-10" })).toEqual([]);
  });
});

describe("weeklyIntersection", () => {
  it("keeps only the time free on every occurrence (spec criterion 3)", () => {
    const byDate = {
      "2026-10-06": [W("18:00", "20:00")], // Tue week 1
      "2026-10-08": [W("18:00", "20:00")], // Thu week 1
      "2026-10-13": [W("18:30", "20:00")], // Tue week 2: 18:00–18:30 taken
      "2026-10-15": [W("18:00", "20:00")], // Thu week 2
      "2026-10-20": [W("18:00", "20:00")], // Tue week 3
      "2026-10-22": [W("18:00", "20:00")], // Thu week 3
    };
    const rec = { weekdays: [2, 4], startDate: "2026-10-06", endDate: "2026-10-22" };
    const out = weeklyIntersection(byDate, rec);
    expect(out.dates).toHaveLength(6);
    expect(out.windows).toEqual([W("18:30", "20:00")]);
    expect(slotStarts(out.windows, 60)).toEqual([W("18:30", "19:30"), W("19:00", "20:00")]);
  });

  it("treats a date missing from the map as fully busy", () => {
    const byDate = { "2026-10-06": [W("18:00", "20:00")] };
    const rec = { weekdays: [2], startDate: "2026-10-06", endDate: "2026-10-13" };
    expect(weeklyIntersection(byDate, rec).windows).toEqual([]);
  });

  it("intersects split windows across days", () => {
    const byDate = {
      "2026-10-06": [W("09:00", "12:00"), W("14:00", "18:00")],
      "2026-10-13": [W("10:00", "15:00")],
    };
    const rec = { weekdays: [2], startDate: "2026-10-06", endDate: "2026-10-13" };
    expect(weeklyIntersection(byDate, rec).windows).toEqual([W("10:00", "12:00"), W("14:00", "15:00")]);
  });
});

describe("slotStarts", () => {
  it("offers the starts a duration fits in, on the grid, never past the window", () => {
    expect(slotStarts([W("08:00", "09:30"), W("11:00", "11:45")], 60)).toEqual([W("08:00", "09:00"), W("08:30", "09:30")]);
    expect(slotStarts([W("08:00", "09:00")], 90)).toEqual([]);
  });
});

describe("addWorkingWindow (settings.coach-working-hours rule 5, PAD-361)", () => {
  it("REVIEW #347 F1: reads the whole day, not the last row — rows are never sorted in the editor", () => {
    // A day the server accepts, with the early window typed last. Appending after the
    // LAST ROW gave 08:00–22:00 over both other windows → 400 "windows overlap".
    const day = addWorkingWindow([["08:00", "13:00"], ["14:00", "17:30"], ["06:00", "07:00"]]);
    expect(day).toEqual([["06:00", "07:00"], ["08:00", "13:00"], ["14:00", "17:30"], ["18:30", "22:00"]]);
  });

  it("REVIEW #347 F2: an evening-only coach gets a morning window, not a disabled button", () => {
    expect(addWorkingWindow([["20:00", "22:00"]])).toEqual([["08:00", "19:00"], ["20:00", "22:00"]]);
    expect(addWorkingWindow([["18:00", "22:00"]])).toEqual([["08:00", "17:00"], ["18:00", "22:00"]]);
  });

  it("takes the largest gap, and never fills the break it has just made", () => {
    expect(addWorkingWindow([["08:00", "09:00"], ["12:00", "13:00"], ["21:00", "22:00"]])).toEqual([
      ["08:00", "09:00"], ["12:00", "13:00"], ["14:00", "20:00"], ["21:00", "22:00"],
    ]);
    // 13:00–14:00 is free but it IS the break: the second tap splits the afternoon instead.
    expect(addWorkingWindow([["08:00", "13:00"], ["14:00", "22:00"]])).toEqual([
      ["08:00", "13:00"], ["14:00", "17:30"], ["18:30", "22:00"],
    ]);
  });

  it("answers null for a day the server would refuse anyway: fix the row first", () => {
    expect(addWorkingWindow([["", "22:00"]])).toBeNull();
    expect(addWorkingWindow([["08:00", "14:00"], ["13:00", "22:00"]])).toBeNull();
    expect(addWorkingWindow([["08:07", "22:00"]])).toBeNull();
  });

  it("splits an untouched day around the lunch break instead of adding 22:00–22:00 (B-140)", () => {
    expect(addWorkingWindow([["08:00", "22:00"]])).toEqual([
      ["08:00", "13:00"],
      ["14:00", "22:00"],
    ]);
  });

  it("uses the room after the last window, one hour after it ends", () => {
    expect(addWorkingWindow([["09:00", "13:00"]])).toEqual([
      ["09:00", "13:00"],
      ["14:00", "22:00"],
    ]);
  });

  it("splits at the middle of the last window when lunch does not fit inside it", () => {
    // 15:00–22:30: no hour left after it before 22:00, lunch is outside it.
    expect(addWorkingWindow([["08:00", "13:00"], ["15:00", "22:30"]])).toEqual([
      ["08:00", "13:00"],
      ["15:00", "18:15"],
      ["19:15", "22:30"],
    ]);
  });

  it("answers null when no window of an hour fits: the control is disabled, never a refused value", () => {
    // Full of short windows: no gap leaves an hour, none is long enough to split.
    expect(addWorkingWindow([["08:00", "10:00"], ["10:30", "13:00"], ["13:30", "16:00"], ["16:30", "19:00"], ["19:30", "22:00"]])).toBeNull();
    expect(addWorkingWindow([["18:00", "17:00"]])).toBeNull();
  });

  it("gives a day with no windows the default window", () => {
    expect(addWorkingWindow([])).toEqual([["08:00", "22:00"]]);
  });

  it("never returns a day the server refuses, from single, multi-window and unsorted days alike", () => {
    const valid = (day: [string, string][]) => {
      const m = day.map(([s, e]) => [minutesOf(s), minutesOf(e)]).sort((a, b) => a[0] - b[0]);
      return m.every(([s, e]) => s % 15 === 0 && e % 15 === 0 && s >= 0 && s < e && e <= 1440) &&
        m.every(([s], i) => i === 0 || s >= m[i - 1][1]);
    };
    const tapFour = (start: [string, string][]) => {
      let day: [string, string][] | null = start;
      for (let taps = 0; taps < 4 && day; taps++) {
        day = addWorkingWindow(day);
        if (day) expect(valid(day), `${JSON.stringify(start)} → ${JSON.stringify(day)}`).toBe(true);
      }
    };
    let starts = 0;
    for (let s = 0; s < 1440; s += 45) {
      for (let e = s + 15; e <= 1440; e += 45) {
        tapFour([[hhmmOf(s), hhmmOf(e)]]);
        starts++;
        // A second window after it, given FIRST in the array (unsorted), and one before it.
        for (const gap of [0, 30, 90]) {
          if (e + gap + 60 <= 1440) { tapFour([[hhmmOf(e + gap), hhmmOf(e + gap + 60)], [hhmmOf(s), hhmmOf(e)]]); starts++; }
          if (s - gap - 45 >= 0) { tapFour([[hhmmOf(s), hhmmOf(e)], [hhmmOf(s - gap - 45), hhmmOf(s - gap)]]); starts++; }
        }
      }
    }
    expect(starts).toBeGreaterThan(2000);
  });
});

describe("snapToGrid (settings.coach-working-hours rule 6, PAD-369)", () => {
  it("brings a time to the nearest quarter hour (B-141: 22:07 and 22:01 were refused)", () => {
    expect(snapToGrid("22:07")).toBe("22:00");
    expect(snapToGrid("22:08")).toBe("22:15");
    expect(snapToGrid("22:01")).toBe("22:00");
    expect(snapToGrid("08:53")).toBe("09:00");
  });

  it("leaves a time already on the grid alone", () => {
    for (const t of ["00:00", "08:15", "13:30", "23:45"]) expect(snapToGrid(t)).toBe(t);
  });

  it("never rounds past the last point a time field can show", () => {
    expect(snapToGrid("23:53")).toBe("23:45");
    expect(snapToGrid("23:59")).toBe("23:45");
  });

  it("returns what is not a time unchanged (an emptied field)", () => {
    expect(snapToGrid("")).toBe("");
    expect(snapToGrid("--:--")).toBe("--:--");
  });

  it("takes another grid", () => {
    expect(snapToGrid("10:20", 30)).toBe("10:30");
  });

  it("REVIEW #350: pads a one-digit hour, and leaves what is not a time or not a grid alone", () => {
    expect(snapToGrid("9:07")).toBe("09:00");
    for (const t of ["25:00", "09:75", "10:07:30", "24:00"]) expect(snapToGrid(t)).toBe(t);
    expect(snapToGrid("10:07", 0)).toBe("10:07");
    expect(snapToGrid("10:07", 7.5)).toBe("10:07");
  });

  it("REVIEW #350: snapping can leave a window with no length — the server's refusal, by design", () => {
    // 23:45–23:59 → 23:45–23:45. Rule 6 keeps the grid; rule 2 still judges the day.
    expect([snapToGrid("23:45"), snapToGrid("23:59")]).toEqual(["23:45", "23:45"]);
  });
});
