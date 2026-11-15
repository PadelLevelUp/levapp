import { describe, expect, it } from "vitest";

import { joinRequestStatusKey } from "./join-request-status";

describe("joinRequestStatusKey (calendar.event-detail rule 26, PAD-842)", () => {
  it("[CALENDAR-EVENT-DETAIL-39] gives no line for an accepted or withdrawn request", () => {
    // The join block shows only while the student holds no place; an accepted request outlives it.
    expect(joinRequestStatusKey({ status: "accepted" })).toBeNull();
    expect(joinRequestStatusKey({ status: "withdrawn" })).toBeNull();
    expect(joinRequestStatusKey(null)).toBeNull();
  });

  it("[CALENDAR-EVENT-DETAIL-39] keeps the pending, refused and superseded lines", () => {
    expect(joinRequestStatusKey({ status: "pending" })).toBe("calendar.joinRequest.pending");
    expect(joinRequestStatusKey({ status: "rejected" })).toBe("calendar.joinRequest.rejected");
    expect(joinRequestStatusKey({ status: "superseded" })).toBe("calendar.joinRequest.superseded");
  });
});
