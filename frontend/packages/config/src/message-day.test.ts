import { describe, expect, it } from "vitest";

import { groupByDay, messageDayKey, messageDayLabel } from "./message-day";

// Wednesday 2026-10-21, 20:00 in Lisbon (summer time, UTC+1).
const NOW = new Date("2026-10-21T19:00:00Z");
const pt = { language: "pt", todayLabel: "Hoje", yesterdayLabel: "Ontem", now: NOW };
const en = { language: "en", todayLabel: "Today", yesterdayLabel: "Yesterday", now: NOW };

describe("messageDayLabel (PAD-676, conversation-detail rule 4a)", () => {
  it("names today, yesterday, a weekday within the week, and a date beyond it", () => {
    expect(messageDayLabel("2026-10-21", pt)).toBe("Hoje");
    expect(messageDayLabel("2026-10-20", pt)).toBe("Ontem");
    expect(messageDayLabel("2026-10-18", pt)).toBe("Domingo"); // 3 days ago
    expect(messageDayLabel("2026-10-15", pt)).toBe("Quinta-feira"); // 6 days ago
    expect(messageDayLabel("2026-10-14", pt)).toBe("14 out"); // 7 days ago
    expect(messageDayLabel("2026-10-07", pt)).toBe("7 out"); // two weeks ago
  });

  it("adds the year only when it is not this year", () => {
    expect(messageDayLabel("2025-12-30", pt)).toBe("30 dez 2025");
    expect(messageDayLabel("2026-01-02", pt)).toBe("2 jan");
  });

  it("speaks English for an English UI", () => {
    expect(messageDayLabel("2026-10-21", en)).toBe("Today");
    expect(messageDayLabel("2026-10-20", en)).toBe("Yesterday");
    expect(messageDayLabel("2026-10-18", en)).toBe("Sunday");
    expect(messageDayLabel("2026-10-07", en)).toBe("Oct 7");
    expect(messageDayLabel("2025-12-30", en)).toBe("Dec 30, 2025");
  });

  it("treats a message a little ahead of the clock as today", () => {
    expect(messageDayLabel("2026-10-22", pt)).toBe("Hoje");
  });

  it("gives no label for an unparsable timestamp", () => {
    expect(messageDayLabel(messageDayKey("not a date"), pt)).toBe("");
  });

  it("counts days on the Lisbon calendar across the October clock change", () => {
    // 2026-10-25 is the last Sunday of October: Lisbon goes from UTC+1 to UTC+0.
    const monday = new Date("2026-10-26T10:00:00Z");
    expect(messageDayLabel("2026-10-25", { ...pt, now: monday })).toBe("Ontem");
    expect(messageDayLabel("2026-10-24", { ...pt, now: monday })).toBe("Sábado");
  });
});

describe("messageDayKey groups by the Lisbon date, not UTC", () => {
  it("puts 00:30 Lisbon (23:30 UTC the day before) on the Lisbon day", () => {
    expect(messageDayKey("2026-10-20T23:30:00Z")).toBe("2026-10-21");
    expect(messageDayKey("2026-10-20T22:59:00Z")).toBe("2026-10-20");
  });

  it("reads Lisbon winter time (UTC+0) too", () => {
    expect(messageDayKey("2026-12-01T23:30:00Z")).toBe("2026-12-01");
  });
});

describe("groupByDay", () => {
  it("opens a group at the first message and at every change of Lisbon date", () => {
    const stamps = [
      "2026-10-07T10:00:00Z", // two weeks ago
      "2026-10-18T09:00:00Z", // three days ago
      "2026-10-18T21:00:00Z", // same Lisbon day
      "2026-10-20T23:30:00Z", // 00:30 Lisbon on the 21st: today
      "2026-10-21T18:00:00Z",
    ];
    const groups = groupByDay(stamps, (s) => s);
    expect(groups.map((g) => g.day)).toEqual(["2026-10-07", "2026-10-18", "2026-10-21"]);
    expect(groups.map((g) => g.items.length)).toEqual([1, 2, 2]);
    expect(groupByDay([], (s: string) => s)).toEqual([]);
  });
});
