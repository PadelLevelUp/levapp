import { describe, expect, it } from "vitest";
import type { InviteSimulationSpot } from "@levelup/types";
import { describeSideRoster } from "./invite-simulation";

// PAD-825 (settings.tutorials rule 4.4): under the projection, the roster as the coach sees it —
// who is going and the open spots, each by side — from the engine's own parts, never recounted.
// PAD-822's class: 8 left and 5 right going, four open right spots, a right-side student cancels.
type Counts = NonNullable<InviteSimulationSpot["sideCounts"]>;
const pad822: Counts = {
  left: 8, right: 8, leaverSide: "right", chosen: "right",
  going: { left: 8, right: 4 }, open: { left: 0, right: 4 },
};

describe("PAD-825: describeSideRoster", () => {
  it("[SETTINGS-TUTORIALS-5] gives the going and open counts by side, which add up to the projection", () => {
    expect(describeSideRoster({ sideCounts: pad822 })).toEqual({
      key: "tutorials.sideRoster",
      params: { goingLeft: 8, goingRight: 4, openLeft: 0, openRight: 4 },
    });
  });

  it("shows nothing with no counts", () => {
    expect(describeSideRoster({ sideCounts: null })).toBeNull();
  });

  it("shows nothing for a server that does not send the parts", () => {
    const { going: _g, open: _o, ...older } = pad822;
    expect(describeSideRoster({ sideCounts: older as Counts })).toBeNull();
  });
});
