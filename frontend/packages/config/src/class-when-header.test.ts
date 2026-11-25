import { describe, expect, it } from "vitest";
import { classWhenLabel } from "./class-when";
import { classWhenHeader } from "./class-when-header";

/**
 * calendar.event-detail rule 28 (UI idea 6): the date tile and the time range of the class page's header,
 * one helper for both shells. The digits are the stored ones (no zone), the words follow the language.
 */
describe("the class page's header parts", () => {
  it("[CALENDAR-EVENT-DETAIL-45] the tile's parts and the time range come from one helper", () => {
    // Portuguese: the tile's weekday, day and month, the spoken date, the spaced time range.
    const pt = classWhenHeader({ date: "2026-11-24", startTime: "10:30", endTime: "12:00" }, "pt");
    expect(pt).toEqual({
      weekday: "ter",
      day: "24",
      month: "nov",
      spokenDate: "terça-feira, 24 de novembro de 2026",
      timeRange: "10:30 – 12:00",
    });

    // English.
    const en = classWhenHeader({ date: "2026-11-24", startTime: "10:30", endTime: "12:00" }, "en");
    expect(en).toEqual({
      weekday: "Tue",
      day: "24",
      month: "Nov",
      spokenDate: "Tuesday, 24 November 2026",
      timeRange: "10:30 – 12:00",
    });
    // A region-tagged language reads as its primary subtag; no language is Portuguese.
    expect(classWhenHeader({ date: "2026-11-24", startTime: "10:30", endTime: "12:00" }, "en-GB").weekday).toBe("Tue");
    expect(classWhenHeader({ date: "2026-11-24", startTime: "10:30", endTime: "12:00" }).weekday).toBe("ter");

    // A class that ends at midnight shows 00:00, as on its card; a single-digit day is not padded.
    const midnight = classWhenHeader({ date: "2026-03-05", startTime: "23:00", endTime: "00:00" }, "en");
    expect(midnight.timeRange).toBe("23:00 – 00:00");
    expect(midnight.day).toBe("5");

    // A missing date or time is a dash, never an invented value.
    expect(classWhenHeader({ date: "", startTime: "10:30", endTime: "12:00" }, "pt")).toEqual({
      weekday: "—",
      day: "—",
      month: "—",
      spokenDate: "—",
      timeRange: "10:30 – 12:00",
    });
    expect(classWhenHeader({ date: null, startTime: "10:30", endTime: "12:00" }, "pt").day).toBe("—");
    expect(classWhenHeader({ date: "2026-11-24", startTime: "", endTime: "" }, "pt").timeRange).toBe("—");
    expect(classWhenHeader({ date: "2026-11-24", startTime: "10:30", endTime: "" }, "pt").timeRange).toBe("10:30 – —");
    expect(classWhenHeader({ date: "2026-11-24", startTime: null, endTime: "12:00" }, "pt").timeRange).toBe("— – 12:00");
    // A malformed date reads as missing.
    expect(classWhenHeader({ date: "24/11/2026", startTime: "10:30", endTime: "12:00" }, "pt").spokenDate).toBe("—");
  });

  it("[CALENDAR-EVENT-DETAIL-45] classWhenLabel's own output is unchanged (unspaced range, dd/mm)", () => {
    expect(
      classWhenLabel({ startDatetime: "2026-11-24T10:30:00", endDatetime: "2026-11-24T12:00:00" }, "pt")
    ).toBe("ter 24/11 · 10:30–12:00");
  });
});
