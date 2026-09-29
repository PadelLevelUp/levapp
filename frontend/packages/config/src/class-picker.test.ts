import { describe, expect, it } from "vitest";
import { canStepBackPickerWeek, upcomingPickerClasses } from "./class-picker";

// Thursday 24 September 2026, 23:00 in Lisbon (22:00Z, WEST): the owner's example.
const NOW = new Date("2026-09-24T22:00:00Z");
const cls = (date: string, startTime: string) => ({ id: `${date} ${startTime}`, date, startTime });

describe("upcomingPickerClasses (PAD-439, players.profile rule 5a)", () => {
  it("drops every class that has started on the club's clock, today's included", () => {
    const week = [
      cls("2026-09-21", "10:00"), // Monday, past
      cls("2026-09-23", "18:00"), // Wednesday, past
      cls("2026-09-24", "12:00"), // today at 12:00, and it is 23:00
      cls("2026-09-24", "23:00"), // today, starting right now: started
      cls("2026-09-24", "23:30"), // today, later
      cls("2026-09-25", "09:00"), // tomorrow
    ];
    expect(upcomingPickerClasses(week, NOW).map((c) => c.id)).toEqual(["2026-09-24 23:30", "2026-09-25 09:00"]);
  });

  it("reads class times as Lisbon wall clock, not the device's zone", () => {
    // 21:30Z is 22:30 in Lisbon: a 22:00 class has started, a 23:00 one has not.
    const now = new Date("2026-09-24T21:30:00Z");
    expect(upcomingPickerClasses([cls("2026-09-24", "22:00"), cls("2026-09-24", "23:00")], now).map((c) => c.id)).toEqual([
      "2026-09-24 23:00",
    ]);
  });
});

describe("canStepBackPickerWeek (PAD-439, players.profile rule 5b)", () => {
  it("cannot step back from the current week", () => {
    expect(canStepBackPickerWeek(new Date(2026, 8, 21), NOW)).toBe(false);
  });
  it("can step back from a later week, to the current one", () => {
    expect(canStepBackPickerWeek(new Date(2026, 8, 28), NOW)).toBe(true);
  });
  it("uses the club's today: at 00:30 Monday in Lisbon (Sunday 23:30Z) the current week is the new one", () => {
    const mondayLisbon = new Date("2026-09-27T23:30:00Z");
    expect(canStepBackPickerWeek(new Date(2026, 8, 28), mondayLisbon)).toBe(false);
  });
});
