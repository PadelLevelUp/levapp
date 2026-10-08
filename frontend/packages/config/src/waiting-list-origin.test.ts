import { describe, expect, it } from "vitest";

import { waitingListCandidates, waitingListOriginKey } from "./waiting-list-origin";

describe("PAD-547 class waiting list (calendar.event-detail rules 19–20)", () => {
  it("labels each origin", () => {
    expect(waitingListOriginKey({ origin: "standing", seriesScoped: false })).toBe("calendar.detail.waitingListOriginStanding");
    expect(waitingListOriginKey({ origin: "standing", seriesScoped: true })).toBe("calendar.detail.waitingListOriginStandingSeries");
    expect(waitingListOriginKey({ origin: "coach", seriesScoped: false })).toBe("calendar.detail.waitingListOriginCoach");
    expect(waitingListOriginKey({ origin: "student", seriesScoped: false })).toBe("calendar.detail.waitingListOriginStudent");
  });

  it("offers roster students not in the class and not already listed", () => {
    const roster = [{ playerId: 1 }, { playerId: 2 }, { playerId: "3" }, { playerId: 4 }];
    expect(waitingListCandidates(roster, ["1"], [{ playerId: 3 }]).map((p) => String(p.playerId))).toEqual(["2", "4"]);
  });
});
