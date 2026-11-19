import { describe, expect, it } from "vitest";

import { classWhenLabel, sortClassesByStart } from "./class-when";

describe("classWhenLabel", () => {
  const klass = { startDatetime: "2026-11-09T10:30:00", endDatetime: "2026-11-09T12:00:00" };

  it("[ATTENDANCE-VALIDATION-53] reads weekday, dd/mm and the time range in Portuguese", () => {
    expect(classWhenLabel(klass, "pt")).toBe("seg 09/11 · 10:30–12:00");
  });

  it("[ATTENDANCE-VALIDATION-53] reads the weekday in English for an English app", () => {
    expect(classWhenLabel(klass, "en")).toBe("Mon 09/11 · 10:30–12:00");
  });

  it("[ATTENDANCE-VALIDATION-53] keeps the stored digits: 23:30 stays on its own day", () => {
    expect(
      classWhenLabel({ startDatetime: "2026-07-14T23:30:00", endDatetime: "2026-07-15T00:30:00" }, "pt")
    ).toBe("ter 14/07 · 23:30–00:30");
  });

  it("[ATTENDANCE-VALIDATION-53] prints the start alone when the class has no end", () => {
    expect(classWhenLabel({ startDatetime: "2026-11-09T10:30:00", endDatetime: null }, "pt")).toBe(
      "seg 09/11 · 10:30"
    );
  });
});

describe("sortClassesByStart", () => {
  it("[ATTENDANCE-VALIDATION-53] puts the oldest start first and leaves the input alone", () => {
    const input = [
      { id: 3, startDatetime: "2026-11-10T09:00:00" },
      { id: 1, startDatetime: "2026-11-09T10:30:00" },
      { id: 2, startDatetime: "2026-11-09T18:00:00" },
    ];
    expect(sortClassesByStart(input).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(input.map((c) => c.id)).toEqual([3, 1, 2]);
  });
});
