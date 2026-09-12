import { describe, expect, it } from "vitest";

import {
  reminderAnswerOutcome,
  reminderRecordedState,
} from "@/components/messages/reminder-answer";

/**
 * PAD-259 (classes.instance-enrollment rule 7): a reminder answer from a
 * student who was taken off that date is recorded on the reminder attempt and
 * answered `not_enrolled`. The bubble must settle into "this class no longer
 * includes you" — never the "not attending" badge a decline paints.
 */
describe("reminderAnswerOutcome", () => {
  it("paints accepted for a confirmed answer", () => {
    expect(reminderAnswerOutcome("confirmed")).toEqual({ local: "accepted", toastKey: null });
  });

  it("paints declined for a declined answer", () => {
    expect(reminderAnswerOutcome("declined")).toEqual({ local: "declined", toastKey: null });
  });

  it("paints nothing and explains when the reminder expired (PAD-68)", () => {
    expect(reminderAnswerOutcome("expired")).toEqual({ local: null, toastKey: "messages.reminderExpired" });
  });

  it("settles a not_enrolled answer without painting declined (PAD-259 rule 7)", () => {
    expect(reminderAnswerOutcome("not_enrolled")).toEqual({ local: "not_enrolled", toastKey: null });
  });

  it("paints nothing for an action it does not know", () => {
    expect(reminderAnswerOutcome("something-new")).toEqual({ local: null, toastKey: "messages.somethingWentWrong" });
  });
});

describe("reminderRecordedState", () => {
  it("reads a recorded not_enrolled answer as settled, not declined", () => {
    const state = reminderRecordedState({ responded: true, response: "not_enrolled" }, null);
    expect(state).toEqual({ confirmed: false, declined: false, notEnrolled: true });
  });

  it("reads a recorded no as declined", () => {
    expect(reminderRecordedState({ responded: true, response: "no" }, null).declined).toBe(true);
  });

  it("trusts this session's not_enrolled answer over stale metadata", () => {
    const state = reminderRecordedState({ responded: false }, "not_enrolled");
    expect(state.notEnrolled).toBe(true);
    expect(state.declined).toBe(false);
  });
});
