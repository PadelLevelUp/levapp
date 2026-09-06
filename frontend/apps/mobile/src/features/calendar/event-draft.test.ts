import { enUS, pt } from "date-fns/locale";
import { describe, expect, it } from "vitest";

import {
  EVENT_END_DATE_PATTERN,
  blockToDraft,
  draftToPayload,
  formatEventDate,
  type EventDraft,
} from "./event-draft";

/**
 * PAD-160. iOS could create a calendar block but never open, edit or delete
 * one. These pin the two conversions the new detail screen depends on, which
 * web does inline in `EventDetailSheet`.
 */

const FALLBACK = {
  date: "2026-09-07",
  startTime: "09:00",
  endTime: "10:00",
};

const BLOCK = {
  type: "holiday",
  title: "Feriado",
  description: "Fechado",
  date: "2026-09-08",
  startTime: "08:00",
  endTime: "18:00",
  isRecurring: true,
  recurrenceRule: { daysOfWeek: [1, 3] },
  recurrenceEnd: "2026-12-31",
};

describe("blockToDraft", () => {
  it("prefers the block's own values", () => {
    expect(blockToDraft(BLOCK, FALLBACK)).toEqual<EventDraft>({
      type: "holiday",
      title: "Feriado",
      description: "Fechado",
      date: "2026-09-08",
      startTime: "08:00",
      endTime: "18:00",
      isRecurring: true,
      selectedDays: [1, 3],
      endDate: "2026-12-31",
    });
  });

  it("falls back to the tapped occurrence for date and times", () => {
    // A recurring block carries the SERIES date/times, so the occurrence the
    // coach actually tapped is what should be shown when the block omits them.
    const draft = blockToDraft(
      { type: "personal", isRecurring: true },
      FALLBACK
    );

    expect(draft.date).toBe("2026-09-07");
    expect(draft.startTime).toBe("09:00");
    expect(draft.endTime).toBe("10:00");
  });

  it("degrades an unknown or missing type to personal", () => {
    // Passing an unrecognised value straight through would leave the type
    // Select showing nothing selectable.
    expect(blockToDraft({ type: "wat" }, FALLBACK).type).toBe("personal");
    expect(blockToDraft({}, FALLBACK).type).toBe("personal");
    expect(blockToDraft(null, FALLBACK).type).toBe("personal");
  });

  it("uses empty strings, not null, for absent text", () => {
    const draft = blockToDraft({ title: null, description: null }, FALLBACK);

    // Controlled TextInputs must never receive null.
    expect(draft.title).toBe("");
    expect(draft.description).toBe("");
  });
});

describe("draftToPayload", () => {
  const base: EventDraft = {
    type: "personal",
    title: "Almoço",
    description: "",
    date: "2026-09-07",
    startTime: "12:00",
    endTime: "13:00",
    isRecurring: false,
    selectedDays: [],
    endDate: "",
  };

  it("sends null, not an empty string, for cleared text", () => {
    // Otherwise clearing a title stores "" instead of actually clearing it.
    const payload = draftToPayload({ ...base, title: "", description: "" });

    expect(payload.title).toBeNull();
    expect(payload.description).toBeNull();
  });

  it("nulls the recurrence fields when recurrence is off", () => {
    // Turning recurrence off must not leave a stale rule or end date behind.
    const payload = draftToPayload({
      ...base,
      isRecurring: false,
      selectedDays: [1, 2],
      endDate: "2026-12-31",
    });

    expect(payload.isRecurring).toBe(false);
    expect(payload.recurrenceRule).toBeNull();
    expect(payload.endDate).toBeNull();
  });

  it("sends a weekly rule and the end date when recurrence is on", () => {
    const payload = draftToPayload({
      ...base,
      isRecurring: true,
      selectedDays: [1, 3],
      endDate: "2026-12-31",
    });

    expect(payload.recurrenceRule).toEqual({
      frequency: "weekly",
      daysOfWeek: [1, 3],
    });
    expect(payload.endDate).toBe("2026-12-31");
  });

  it("sends a null end date for an open-ended recurring event", () => {
    const payload = draftToPayload({
      ...base,
      isRecurring: true,
      selectedDays: [1],
      endDate: "",
    });

    expect(payload.recurrenceRule).toEqual({
      frequency: "weekly",
      daysOfWeek: [1],
    });
    expect(payload.endDate).toBeNull();
  });

  it("round-trips a block unchanged through both conversions", () => {
    const payload = draftToPayload(blockToDraft(BLOCK, FALLBACK));

    expect(payload).toMatchObject({
      type: "holiday",
      title: "Feriado",
      description: "Fechado",
      date: "2026-09-08",
      startTime: "08:00",
      endTime: "18:00",
      isRecurring: true,
      recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 3] },
      endDate: "2026-12-31",
    });
  });
});

/**
 * The read-only date line (PAD-160). The first attempt printed the raw
 * `YYYY-MM-DD` the API stores, where web localizes it — a Portuguese coach saw
 * "2026-09-07" instead of "segunda-feira, 7 setembro".
 */
describe("formatEventDate", () => {
  it("renders the weekday and month in the given locale", () => {
    expect(formatEventDate("2026-09-07", pt)).toBe("segunda-feira, 7 setembro");
    expect(formatEventDate("2026-09-07", enUS)).toBe("Monday, 7 September");
  });

  it("reads a date-only string in local time, not UTC", () => {
    // `new Date("2026-09-07")` is midnight UTC, which is still the 6th in the
    // Americas. parseISO keeps the calendar day the API meant.
    expect(formatEventDate("2026-09-07", enUS)).toContain("7 September");
  });

  it("puts the day before the month, matching PAD-157's mobile ordering", () => {
    const formatted = formatEventDate("2026-09-07", pt);
    expect(formatted.indexOf("7")).toBeLessThan(formatted.indexOf("setembro"));
  });

  it("takes the year for a recurrence end date", () => {
    expect(formatEventDate("2026-12-31", pt, EVENT_END_DATE_PATTERN)).toBe(
      "31 dezembro 2026"
    );
  });

  it("falls back to the raw value rather than rendering Invalid Date", () => {
    expect(formatEventDate("", pt)).toBe("");
    expect(formatEventDate("not-a-date", pt)).toBe("not-a-date");
  });
});
