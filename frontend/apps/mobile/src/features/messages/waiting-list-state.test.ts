import { describe, expect, it } from "vitest";

import {
  waitingListOfferState,
  waitingListResponseOutcome,
} from "./waiting-list-state";

/**
 * PAD-124. Neither client rendered a Yes/No on a `waiting_list_offer`, so the
 * only self-service route onto the waiting list was unreachable even though the
 * endpoint behind it worked. These pin the state rules both bubbles now derive.
 */

describe("waitingListOfferState", () => {
  it("offers Yes/No on a fresh, unanswered offer", () => {
    const s = waitingListOfferState({ responded: false });

    expect(s.showResponseButtons).toBe(true);
    expect(s.joined).toBe(false);
    expect(s.declined).toBe(false);
    expect(s.expired).toBe(false);
  });

  it("offers Yes/No when there is no metadata at all", () => {
    expect(waitingListOfferState(undefined).showResponseButtons).toBe(true);
    expect(waitingListOfferState(null).showResponseButtons).toBe(true);
  });

  it("shows joined once the student answered yes", () => {
    const s = waitingListOfferState({ responded: true, response: "yes" });

    expect(s.joined).toBe(true);
    expect(s.declined).toBe(false);
    expect(s.expired).toBe(false);
    expect(s.showResponseButtons).toBe(false);
  });

  it("shows declined once the student answered no", () => {
    const s = waitingListOfferState({ responded: true, response: "no" });

    expect(s.declined).toBe(true);
    expect(s.joined).toBe(false);
    expect(s.showResponseButtons).toBe(false);
  });

  it("shows expired when the server refused a late answer (PAD-68)", () => {
    const s = waitingListOfferState({ responded: true, response: "expired" });

    expect(s.expired).toBe(true);
    expect(s.joined).toBe(false);
    expect(s.declined).toBe(false);
    expect(s.showResponseButtons).toBe(false);
  });

  it("fails safe to declined on an unrecognised recorded answer", () => {
    const s = waitingListOfferState({ responded: true, response: "maybe" });

    expect(s.declined).toBe(true);
    expect(s.joined).toBe(false);
  });

  it("ignores a response value while responded is still false", () => {
    // Half-written metadata must not settle the bubble: the question is only
    // closed by `responded`, exactly as the invite and reminder bubbles read it.
    const s = waitingListOfferState({ responded: false, response: "yes" });

    expect(s.showResponseButtons).toBe(true);
    expect(s.joined).toBe(false);
  });

  it("lets a local answer settle the bubble before metadata catches up", () => {
    expect(waitingListOfferState({ responded: false }, "accepted").joined).toBe(
      true
    );
    expect(
      waitingListOfferState({ responded: false }, "declined").declined
    ).toBe(true);
    expect(waitingListOfferState({ responded: false }, "expired").expired).toBe(
      true
    );
  });

  it("prefers the local answer over stale metadata", () => {
    const s = waitingListOfferState(
      { responded: true, response: "no" },
      "accepted"
    );

    expect(s.joined).toBe(true);
    expect(s.declined).toBe(false);
  });
});

describe("waitingListResponseOutcome", () => {
  it("records a yes when the server queued the student", () => {
    expect(waitingListResponseOutcome("added_to_waiting_list")).toEqual({
      write: "yes",
      toastKey: null,
    });
  });

  it("records a no when the server took the decline", () => {
    expect(waitingListResponseOutcome("declined")).toEqual({
      write: "no",
      toastKey: null,
    });
  });

  it("settles as expired and warns when the class already started", () => {
    expect(waitingListResponseOutcome("expired")).toEqual({
      write: "expired",
      toastKey: "messages.waitingListOfferExpired",
    });
  });

  it("records nothing for an action the server could not resolve", () => {
    // "unknown" means the instance had no coach: nothing happened, so the
    // question stays answerable rather than being painted as declined.
    expect(waitingListResponseOutcome("unknown")).toEqual({
      write: null,
      toastKey: "messages.somethingWentWrong",
    });
    expect(waitingListResponseOutcome(undefined).write).toBeNull();
    expect(waitingListResponseOutcome(null).write).toBeNull();
  });
});
