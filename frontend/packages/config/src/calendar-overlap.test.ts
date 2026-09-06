import { describe, expect, it } from "vitest";

import { findOverlappingEvent, type OverlapEventLike } from "./calendar-overlap";

/**
 * PAD-99 / PAD-159. This logic shipped on web with no test at all; PAD-159
 * lifts it here so iOS can share it rather than reimplement the gate, and
 * asks for it to be unit-tested once. These are those tests.
 */

function ev(
  id: string,
  date: string,
  startTime: string | null,
  endTime: string | null
): OverlapEventLike {
  return { id, date, startTime, endTime };
}

const DAY = "2026-09-07";

describe("findOverlappingEvent", () => {
  it("finds an event whose interval intersects the candidate", () => {
    const clash = ev("1", DAY, "10:30", "11:30");

    expect(
      findOverlappingEvent(
        { date: DAY, startTime: "10:00", endTime: "11:00" },
        [clash]
      )
    ).toBe(clash);
  });

  it("does NOT treat back-to-back classes as an overlap", () => {
    // Half-open intervals: 10:00–11:00 then 11:00–12:00 is a normal
    // consecutive pair, and warning about it would cry wolf all day.
    expect(
      findOverlappingEvent({ date: DAY, startTime: "10:00", endTime: "11:00" }, [
        ev("1", DAY, "11:00", "12:00"),
      ])
    ).toBeNull();

    expect(
      findOverlappingEvent({ date: DAY, startTime: "11:00", endTime: "12:00" }, [
        ev("1", DAY, "10:00", "11:00"),
      ])
    ).toBeNull();
  });

  it("ignores events on a different day", () => {
    expect(
      findOverlappingEvent({ date: DAY, startTime: "10:00", endTime: "11:00" }, [
        ev("1", "2026-09-08", "10:00", "11:00"),
      ])
    ).toBeNull();
  });

  it("compares by day, so an ISO timestamp matches a plain date", () => {
    const clash = ev("1", "2026-09-07T00:00:00.000Z", "10:00", "11:00");

    expect(
      findOverlappingEvent(
        { date: "2026-09-07T18:00:00", startTime: "10:00", endTime: "11:00" },
        [clash]
      )
    ).toBe(clash);
  });

  it("never reports the event being edited as clashing with itself", () => {
    const self = ev("42", DAY, "10:00", "11:00");

    expect(
      findOverlappingEvent(
        { date: DAY, startTime: "10:00", endTime: "11:00" },
        [self],
        "42"
      )
    ).toBeNull();
  });

  it("returns the first clash when several overlap", () => {
    const first = ev("1", DAY, "10:30", "11:30");
    const second = ev("2", DAY, "10:45", "11:45");

    expect(
      findOverlappingEvent(
        { date: DAY, startTime: "10:00", endTime: "11:00" },
        [first, second]
      )
    ).toBe(first);
  });

  it("skips events with no times rather than throwing", () => {
    expect(
      findOverlappingEvent({ date: DAY, startTime: "10:00", endTime: "11:00" }, [
        ev("1", DAY, null, null),
        ev("2", DAY, "10:00", null),
      ])
    ).toBeNull();
  });

  it("returns null for an incomplete or inverted candidate", () => {
    const events = [ev("1", DAY, "00:00", "23:59")];

    expect(
      findOverlappingEvent({ date: "", startTime: "10:00", endTime: "11:00" }, events)
    ).toBeNull();
    expect(
      findOverlappingEvent({ date: DAY, startTime: "", endTime: "11:00" }, events)
    ).toBeNull();
    // Zero-length and inverted intervals have nothing meaningful to compare.
    expect(
      findOverlappingEvent({ date: DAY, startTime: "11:00", endTime: "11:00" }, events)
    ).toBeNull();
    expect(
      findOverlappingEvent({ date: DAY, startTime: "12:00", endTime: "11:00" }, events)
    ).toBeNull();
  });

  it("returns null when there is nothing to compare against", () => {
    expect(
      findOverlappingEvent({ date: DAY, startTime: "10:00", endTime: "11:00" }, [])
    ).toBeNull();
  });

  it("gives the caller its own event type back", () => {
    // Generic, so a shell holding richer events keeps its fields without a cast.
    const typed = { id: "1", date: DAY, startTime: "10:30", endTime: "11:30", title: "Class" };

    const hit = findOverlappingEvent(
      { date: DAY, startTime: "10:00", endTime: "11:00" },
      [typed]
    );

    expect(hit?.title).toBe("Class");
  });
});
