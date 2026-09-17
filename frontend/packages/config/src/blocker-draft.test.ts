import { describe, expect, it } from "vitest";
import { blockerDraftError, blockerDraftToInput, emptyBlockerDraft, type BlockerDraft } from "./blocker-draft";

// PAD-356 / calendar.student-blockers rules 15–16: one validation and one
// payload builder for the Criar bloqueio sheet, shared by web and iOS.

const single = (patch: Partial<BlockerDraft> = {}): BlockerDraft => ({
  ...emptyBlockerDraft(),
  mode: "single",
  date: "2026-09-21",
  startTime: "18:00",
  endTime: "20:00",
  ...patch,
});
const recurring = (patch: Partial<BlockerDraft> = {}): BlockerDraft =>
  single({ mode: "recurring", daysOfWeek: [1, 3], endDate: "2026-12-21", ...patch });

describe("blockerDraftError", () => {
  it("accepts a valid single and a valid recurring block", () => {
    expect(blockerDraftError(single())).toBeNull();
    expect(blockerDraftError(recurring())).toBeNull();
  });

  it("requires a date", () => {
    expect(blockerDraftError(single({ date: "" }))).toBe("date_required");
  });

  it("requires both times: a cleared time input is not a time", () => {
    expect(blockerDraftError(single({ startTime: "" }))).toBe("time_required");
    expect(blockerDraftError(single({ endTime: "" }))).toBe("time_required");
    expect(blockerDraftError(recurring({ startTime: "", endTime: "" }))).toBe("time_required");
    expect(blockerDraftError(single({ startTime: "9" }))).toBe("time_required");
  });

  it("refuses an end time at or before the start time", () => {
    expect(blockerDraftError(single({ startTime: "18:00", endTime: "18:00" }))).toBe("end_before_start");
    expect(blockerDraftError(single({ startTime: "18:00", endTime: "17:30" }))).toBe("end_before_start");
    expect(blockerDraftError(recurring({ startTime: "09:00", endTime: "08:59" }))).toBe("end_before_start");
  });

  it("refuses a recurring end date before the start date, but not the same day", () => {
    expect(blockerDraftError(recurring({ endDate: "2026-09-20" }))).toBe("end_date_before_start_date");
    expect(blockerDraftError(recurring({ endDate: "2026-09-21" }))).toBeNull();
    // a single block ignores any leftover end date
    expect(blockerDraftError(single({ endDate: "2026-01-01" }))).toBeNull();
  });
});

describe("blockerDraftToInput", () => {
  it("builds a single block with the reason as its title", () => {
    expect(blockerDraftToInput(single({ title: "  Trabalho " }))).toEqual({
      title: "Trabalho",
      date: "2026-09-21",
      startTime: "18:00",
      endTime: "20:00",
      isRecurring: false,
      recurrenceRule: null,
      endDate: null,
    });
    expect(blockerDraftToInput(single({ title: "   " })).title).toBeNull();
  });

  it("builds a recurring block from its weekdays and end date", () => {
    expect(blockerDraftToInput(recurring())).toMatchObject({
      isRecurring: true,
      recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 3] },
      endDate: "2026-12-21",
    });
  });

  it("defaults a recurring block with no weekday to the start date's weekday, and no end date to +3 months", () => {
    // 2026-09-21 is a Monday (getDay 1)
    expect(blockerDraftToInput(recurring({ daysOfWeek: [], endDate: "" }))).toMatchObject({
      recurrenceRule: { frequency: "weekly", daysOfWeek: [1] },
      endDate: "2026-12-21",
    });
  });

  it("round-trips an existing blocker into a draft", async () => {
    const { blockerToDraft } = await import("./blocker-draft");
    const draft = blockerToDraft({
      title: "Ginásio",
      date: "2026-09-21",
      startTime: "07:00",
      endTime: "08:00",
      isRecurring: true,
      recurrenceRule: { frequency: "weekly", daysOfWeek: [2, 4] },
      recurrenceEnd: "2026-11-30",
    });
    expect(draft).toEqual({
      title: "Ginásio",
      mode: "recurring",
      date: "2026-09-21",
      startTime: "07:00",
      endTime: "08:00",
      daysOfWeek: [2, 4],
      endDate: "2026-11-30",
    });
  });
});
