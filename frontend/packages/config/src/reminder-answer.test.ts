import { describe, expect, it } from "vitest";
import { canConfirmAttendance, reminderAnswerOutcome, studentRowAction } from "./reminder-answer";

/**
 * PAD-315 (`attendance.confirm` rule 26) and B-074.
 *
 * Two things are pinned here. The gate for "actually, I can come" — offered on
 * the state, never on a guess about capacity. And the mapping from the SERVER's
 * answer to what the client should do, which is where B-074 lives: the shipped
 * clients branch on three values against a server that returns five, and their
 * defensive defaults turn an unknown answer into a confident wrong one. The
 * mobile bubble records "no" when the server said `spot_filled`; the mobile
 * dashboard toasts "declined" as a success.
 *
 * The rule these tests encode: when you cannot tell, say nothing rather than
 * guess the common case.
 */

describe("canConfirmAttendance — PAD-570, the server's flag and nothing else", () => {
  it("is offered only while the server says the student is asked and still planned", () => {
    expect(canConfirmAttendance({ state: "planned", pendingConfirmation: true, classStarted: false })).toBe(true);
  });
  it("never re-derives the ask: without the flag a planned row gets no 'Vou'", () => {
    expect(canConfirmAttendance({ state: "planned", pendingConfirmation: false, classStarted: false })).toBe(false);
    expect(canConfirmAttendance({ state: "planned", pendingConfirmation: undefined, classStarted: false })).toBe(false);
  });
  it("is closed on every other state, flag or no flag — not_coming is final (rule 28)", () => {
    for (const state of ["coming", "not_coming", "attended", "missed"] as const) {
      expect(canConfirmAttendance({ state, pendingConfirmation: true, classStarted: false })).toBe(false);
    }
  });
  it("is closed once the class started", () => {
    expect(canConfirmAttendance({ state: "planned", pendingConfirmation: true, classStarted: true })).toBe(false);
  });
});

describe("studentRowAction — what a dashboard row offers (dashboard.blocks rule 3a)", () => {
  it("Yes / No while the server says pending", () => {
    expect(studentRowAction({ pendingConfirmation: true, attendanceState: "planned" })).toBe("answer");
  });
  it("only 'Avisar que não vou' before the ask, and after a yes", () => {
    expect(studentRowAction({ pendingConfirmation: false, attendanceState: "planned" })).toBe("decline");
    expect(studentRowAction({ pendingConfirmation: false, attendanceState: "coming" })).toBe("decline");
  });
  it("the hint, and no button, after a no", () => {
    expect(studentRowAction({ pendingConfirmation: false, attendanceState: "not_coming" })).toBe("declined");
  });
  it("nothing once the coach's record stands or the row is unknown", () => {
    expect(studentRowAction({ pendingConfirmation: false, attendanceState: "attended" })).toBe("none");
    expect(studentRowAction({ pendingConfirmation: false, attendanceState: "missed" })).toBe("none");
    expect(studentRowAction({ pendingConfirmation: undefined, attendanceState: undefined })).toBe("decline");
  });
  it("a stale pending flag never beats a settled state", () => {
    expect(studentRowAction({ pendingConfirmation: true, attendanceState: "not_coming" })).toBe("declined");
    expect(studentRowAction({ pendingConfirmation: true, attendanceState: "coming" })).toBe("decline");
  });
});

describe("the three PAD-570 refusals record nothing and explain themselves", () => {
  it.each([
    ["not_yet_asked", "calendar.detail.notYetAsked"],
    ["already_declined", "calendar.detail.declinedFinalHint"],
    ["already_marked", "calendar.detail.alreadyMarked"],
  ])("%s", (action, key) => {
    expect(reminderAnswerOutcome({ action })).toEqual({ record: null, messageKey: key, tone: "info" });
  });
});

describe("reminderAnswerOutcome — the server's answer decides, and unknown says nothing", () => {
  it("records a confirmation", () => {
    expect(reminderAnswerOutcome({ action: "confirmed" })).toEqual({
      record: "confirmed",
      messageKey: null,
      tone: null,
    });
  });

  it("treats a repeat tap as the success it is", () => {
    // From the student's point of view nothing failed: the answer they wanted
    // recorded is recorded.
    expect(reminderAnswerOutcome({ action: "confirmed", duplicate: true })).toEqual({
      record: "confirmed",
      messageKey: null,
      tone: null,
    });
  });

  it("records a decline", () => {
    expect(reminderAnswerOutcome({ action: "declined" })).toEqual({
      record: "declined",
      messageKey: null,
      tone: null,
    });
  });

  it("B-074: a refused return writes NOTHING and says the spot was taken", () => {
    // The shipped shells write "no" here, or toast "declined" as a success.
    expect(reminderAnswerOutcome({ action: "spot_filled" })).toEqual({
      record: null,
      messageKey: "calendar.detail.spotFilled",
      tone: "info",
    });
  });

  it("leaves an expired answer unrecorded and says so", () => {
    expect(reminderAnswerOutcome({ action: "expired" })).toEqual({
      record: null,
      messageKey: "messages.reminderExpired",
      tone: "error",
    });
  });

  it("settles a no-longer-enrolled student without painting an absence", () => {
    expect(reminderAnswerOutcome({ action: "not_enrolled" })).toEqual({
      record: "not_enrolled",
      messageKey: null,
      tone: null,
    });
  });

  it("writes nothing at all for an answer it does not know", () => {
    // The whole point of B-074: a default that picks one of the known answers
    // turns a new server value into a confident lie. Say nothing instead.
    for (const action of ["something_new", "", null, undefined]) {
      expect(reminderAnswerOutcome({ action } as never)).toEqual({
        record: null,
        messageKey: "messages.somethingWentWrong",
        tone: "error",
      });
    }
    expect(reminderAnswerOutcome(null)).toEqual({
      record: null,
      messageKey: "messages.somethingWentWrong",
      tone: "error",
    });
  });

  it("never returns a record for an answer that carries a message", () => {
    // The invariant behind both halves: an outcome either settles the row or
    // explains itself, and the explaining ones must not also write state.
    for (const action of ["spot_filled", "expired", "whatever"]) {
      const outcome = reminderAnswerOutcome({ action } as never);
      if (outcome.messageKey !== null) expect(outcome.record).toBeNull();
    }
  });
});
