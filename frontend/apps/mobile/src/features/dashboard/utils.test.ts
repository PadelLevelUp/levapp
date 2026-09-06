import { describe, expect, it } from "vitest";

import { classListItemISODate } from "./utils";

describe("classListItemISODate", () => {
  it("pulls the occurrence date out of the calendar deep link", () => {
    // The exact shape `_calendar_href` emits (backend/padel_app/helpers/dashboard/events.py).
    expect(
      classListItemISODate("/calendar?classId=lesson-3&date=2026-09-07")
    ).toBe("2026-09-07");
  });

  it("finds the date wherever it sits in the query string", () => {
    expect(
      classListItemISODate("/calendar?date=2026-09-07&classId=lesson-3")
    ).toBe("2026-09-07");
  });

  it("returns null when the href carries no date, so the caller can fall back", () => {
    expect(classListItemISODate("/calendar?classId=lessoninstance-12")).toBeNull();
    expect(classListItemISODate("/calendar?classId=lesson-3&date=")).toBeNull();
    expect(classListItemISODate("/calendar")).toBeNull();
  });

  it("returns null for a missing href", () => {
    expect(classListItemISODate(undefined)).toBeNull();
    expect(classListItemISODate(null)).toBeNull();
    expect(classListItemISODate("")).toBeNull();
  });

  it("does not match a truncated or over-long date", () => {
    expect(classListItemISODate("/calendar?date=2026-09")).toBeNull();
    expect(classListItemISODate("/calendar?date=2026-09-071")).toBeNull();
  });
});
