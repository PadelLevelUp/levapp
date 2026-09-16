import { describe, expect, it } from "vitest";
import { canComeBack, reminderAnswerOutcome } from "./reminder-answer";

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

describe("canComeBack — offered on the state, never on a guess", () => {
  it("is offered while the student is not coming and the class has not started", () => {
    expect(canComeBack({ state: "not_coming", classStarted: false })).toBe(true);
  });

  it("is not offered in any other state", () => {
    for (const state of ["planned", "coming", "attended", "missed"] as const) {
      expect(canComeBack({ state, classStarted: false })).toBe(false);
    }
  });

  it("is not offered once the class has started", () => {
    expect(canComeBack({ state: "not_coming", classStarted: true })).toBe(false);
  });

  it("does NOT consider whether the spot looks free", () => {
    // The client cannot know without racing the invitation engine, and hiding a
    // working action is worse than offering one the server may refuse
    // (`attendance.confirm` rule 26). The signature takes no capacity at all —
    // this test exists so adding one is a deliberate act, not a quiet one.
    expect(canComeBack({ state: "not_coming", classStarted: false, spotsFree: 0 } as never)).toBe(true);
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
