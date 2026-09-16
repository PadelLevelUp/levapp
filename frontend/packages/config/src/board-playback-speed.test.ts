import { describe, expect, it } from "vitest";
import type { CourtDiagramV2 } from "@levelup/types";
import {
  PLAYBACK_SPEEDS,
  clockElapsed,
  clockWithSpeed,
  newDiagram,
  playbackFrameAt,
  startClock,
} from "./court-diagram";

// PAD-310 / training.tactical-board rule 25: AUTO's clock runs at the chosen
// speed, and a change mid-play keeps the position. Shared by web and iOS.

const ONE_PATH: CourtDiagramV2 = {
  ...newDiagram("game"),
  steps: [{ id: "s1", movements: [], balls: [{ from: { x: 58, y: 20 }, to: { x: 40, y: 80 }, style: "flat" }] }],
};

describe("playback speed (rule 25)", () => {
  it("offers slow, normal and fast at 0.5x, 1x and 2x", () => {
    expect(PLAYBACK_SPEEDS).toEqual({ slow: 0.5, normal: 1, fast: 2 });
  });

  it("a one-path step lasts 400 ms at 2x and 1600 ms at 0.5x", () => {
    const fast = startClock(1000, PLAYBACK_SPEEDS.fast);
    expect(playbackFrameAt(ONE_PATH, clockElapsed(fast, 1399))).not.toBeNull();
    expect(playbackFrameAt(ONE_PATH, clockElapsed(fast, 1400))).toBeNull();
    const slow = startClock(1000, PLAYBACK_SPEEDS.slow);
    expect(playbackFrameAt(ONE_PATH, clockElapsed(slow, 2599))).not.toBeNull();
    expect(playbackFrameAt(ONE_PATH, clockElapsed(slow, 2600))).toBeNull();
  });

  it("changing speed mid-play keeps the position and continues at the new rate", () => {
    const normal = startClock(0, PLAYBACK_SPEEDS.normal);
    // halfway at 1x
    expect(playbackFrameAt(ONE_PATH, clockElapsed(normal, 400))).toEqual({ step: 0, t: 0.5 });
    const fast = clockWithSpeed(normal, 400, PLAYBACK_SPEEDS.fast);
    expect(playbackFrameAt(ONE_PATH, clockElapsed(fast, 400))).toEqual({ step: 0, t: 0.5 });
    // the remaining 400 ms of step time take 200 ms of wall time
    expect(playbackFrameAt(ONE_PATH, clockElapsed(fast, 599))).not.toBeNull();
    expect(playbackFrameAt(ONE_PATH, clockElapsed(fast, 600))).toBeNull();
  });
});
