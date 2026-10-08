import { describe, expect, it } from "vitest";

import {
  INVITATION_OUTCOME_KEY,
  inviteeActionsFor,
  outcomeAfterCoachAction,
  outcomeAfterResponse,
  statusForOutcome,
} from "./invitation-outcome";

describe("PAD-548 invitee outcomes (calendar.event-detail rules 16–18)", () => {
  it("names every outcome with one calendar.detail key", () => {
    expect(Object.keys(INVITATION_OUTCOME_KEY).sort()).toEqual(
      ["accepted", "declined", "expired", "pending", "spot_filled", "withdrawn"],
    );
    expect(INVITATION_OUTCOME_KEY.withdrawn).toBe("calendar.detail.outcomeWithdrawn");
    expect(INVITATION_OUTCOME_KEY.pending).toBe("calendar.detail.outcomePending");
  });

  it("offers actions only where rule 17 says", () => {
    expect(inviteeActionsFor("pending")).toEqual(["accept", "decline", "delete"]);
    expect(inviteeActionsFor("declined")).toEqual(["accept"]);
    for (const outcome of ["accepted", "withdrawn", "spot_filled", "expired"] as const) {
      expect(inviteeActionsFor(outcome)).toEqual([]);
    }
  });

  it("maps a live event's response to the row's outcome", () => {
    expect(outcomeAfterResponse("yes")).toBe("accepted");
    expect(outcomeAfterResponse("no")).toBe("declined");
    expect(outcomeAfterResponse("spot_filled")).toBe("spot_filled");
    expect(outcomeAfterResponse("withdrawn")).toBe("withdrawn");
    expect(outcomeAfterResponse("something_new")).toBeNull();
  });

  it("maps a coach action's answer to the row's outcome", () => {
    expect(outcomeAfterCoachAction("confirmed")).toBe("accepted");
    expect(outcomeAfterCoachAction("declined")).toBe("declined");
    expect(outcomeAfterCoachAction("withdrawn")).toBe("withdrawn");
    expect(outcomeAfterCoachAction("spot_filled")).toBe("spot_filled");
    expect(outcomeAfterCoachAction("expired")).toBe("expired");
    expect(outcomeAfterCoachAction("unknown")).toBeNull();
  });

  it("keeps status in step with the outcome", () => {
    expect(statusForOutcome("accepted")).toBe("confirmed");
    expect(statusForOutcome("pending")).toBe("sent");
    expect(statusForOutcome("withdrawn")).toBe("expired");
  });
});
