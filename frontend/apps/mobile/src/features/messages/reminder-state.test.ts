import { describe, expect, it } from "vitest";

import { reminderState } from "./reminder-state";

/**
 * PAD-151. iOS rendered no buttons at all on an attendance reminder, so a
 * student could not answer from the app. These pin the state rules web derives
 * inline, each of which came from its own ticket (PAD-46, PAD-49, PAD-68) and
 * none of which is tested today.
 */

const NOW = new Date("2026-09-07T10:00:00Z");
const LATER = "2026-09-07T18:00:00Z";
const EARLIER = "2026-09-07T08:00:00Z";

describe("reminderState", () => {
  it("offers Yes/No on a fresh reminder for a future class", () => {
    const s = reminderState({ startsAt: LATER }, null, NOW);

    expect(s.showResponseButtons).toBe(true);
    expect(s.confirmed).toBe(false);
    expect(s.declined).toBe(false);
    expect(s.superseded).toBe(false);
  });

  it("shows confirmed once the student answered yes", () => {
    const s = reminderState(
      { responded: true, response: "yes", startsAt: LATER },
      null,
      NOW
    );

    expect(s.confirmed).toBe(true);
    expect(s.showResponseButtons).toBe(false);
    // Still ahead, so they can change their mind.
    expect(s.canCancel).toBe(true);
  });

  it("shows absent once the student answered no", () => {
    const s = reminderState(
      { responded: true, response: "no", startsAt: LATER },
      null,
      NOW
    );

    expect(s.declined).toBe(true);
    expect(s.showResponseButtons).toBe(false);
    expect(s.canCancel).toBe(false);
  });

  it("fails safe to absent for an unrecognised recorded answer", () => {
    // Anything that is not "yes" reads as declined, so a bad value never
    // paints a confirmation the student did not give.
    const s = reminderState(
      { responded: true, response: "maybe", startsAt: LATER },
      null,
      NOW
    );

    expect(s.confirmed).toBe(false);
    expect(s.declined).toBe(true);
  });

  it("trusts an answer given in this session over the stale metadata", () => {
    // The optimistic local answer, before the server round-trip lands.
    const s = reminderState({ startsAt: LATER }, "accepted", NOW);

    expect(s.confirmed).toBe(true);
    expect(s.showResponseButtons).toBe(false);
  });

  it("expires a reminder that a newer one superseded (PAD-49)", () => {
    const s = reminderState(
      { superseded: true, startsAt: LATER },
      null,
      NOW
    );

    expect(s.superseded).toBe(true);
    expect(s.showResponseButtons).toBe(false);
  });

  it("expires a reminder for a class that already started (PAD-68)", () => {
    // Derived from startsAt, so reminders already in history retire with no
    // data migration. Answering could not change anything anyway — the
    // backend rejects late responses.
    const s = reminderState({ startsAt: EARLIER }, null, NOW);

    expect(s.superseded).toBe(true);
    expect(s.showResponseButtons).toBe(false);
  });

  it("does not offer cancellation once the class has started", () => {
    const s = reminderState(
      { responded: true, response: "yes", startsAt: EARLIER },
      null,
      NOW
    );

    expect(s.confirmed).toBe(true);
    expect(s.canCancel).toBe(false);
  });

  it("flags a late cancellation past the coach's deadline (PAD-46)", () => {
    const s = reminderState(
      {
        responded: true,
        response: "yes",
        startsAt: LATER,
        cancellationDeadline: EARLIER,
      },
      null,
      NOW
    );

    // Still allowed — but warned about first.
    expect(s.canCancel).toBe(true);
    expect(s.isLateCancellation).toBe(true);
  });

  it("does not flag a late cancellation before the deadline", () => {
    const s = reminderState(
      {
        responded: true,
        response: "yes",
        startsAt: LATER,
        cancellationDeadline: LATER,
      },
      null,
      NOW
    );

    expect(s.isLateCancellation).toBe(false);
  });

  it("never warns on an older reminder that carries no deadline", () => {
    const s = reminderState(
      { responded: true, response: "yes", startsAt: LATER },
      null,
      NOW
    );

    expect(s.isLateCancellation).toBe(false);
  });

  it("treats a reminder with no startsAt as still answerable", () => {
    // Older reminders predate startsAt; they must not all read as expired.
    const s = reminderState({}, null, NOW);

    expect(s.superseded).toBe(false);
    expect(s.showResponseButtons).toBe(true);
  });

  it("survives missing metadata entirely", () => {
    expect(reminderState(null, null, NOW).showResponseButtons).toBe(true);
    expect(reminderState(undefined, null, NOW).showResponseButtons).toBe(true);
  });
});
