/**
 * PAD-415 / B-189 (messaging.conversation-detail rules 9a, 10): a programmatic landing (the
 * first-unread or a push target) must not be cancelled by rule 10's "stay pinned to the
 * newest". Proven on the simulator (flow 114, run 9): the walk issued the scroll, a scroll
 * frame at the bottom (the offset adjustment after the older page was prepended) flipped
 * "at bottom" back on, and the next content-size change re-pinned to the end.
 */
import { describe, expect, it } from "vitest";
import { followReducer, initialFollowState, type FollowEvent, type FollowState } from "./follow-state";

function run(events: FollowEvent[], from: FollowState = initialFollowState()) {
  let state = from;
  const effects: (string | null)[] = [];
  for (const event of events) {
    const next = followReducer(state, event);
    state = next.state;
    effects.push(next.effect);
  }
  return { state, effects };
}

describe("following the newest message around a landing (B-189)", () => {
  it("rule 10 unchanged: at the bottom, new content keeps the thread pinned", () => {
    expect(run([{ type: "contentGrew" }]).effects).toEqual(["scrollToEnd"]);
  });

  it("the run-9 sequence: after a landing, a bottom scroll frame and a size change do NOT re-pin", () => {
    const { effects, state } = run([
      { type: "landing" },
      { type: "scroll", atBottom: true }, // the offset adjustment after the prepend
      { type: "contentGrew" },
      { type: "scroll", atBottom: true },
      { type: "contentGrew" },
    ]);
    expect(effects.filter(Boolean)).toEqual([]);
    expect(state.suspended).toBe(true);
  });

  it("a new message arriving while suspended does not pull the reader away from the landing", () => {
    // the landing's own frames can report the bottom before the scroll moves (run 9)
    const { effects } = run([{ type: "landing" }, { type: "scroll", atBottom: true }, { type: "contentGrew" }]);
    expect(effects).toEqual([null, null, null]);
  });

  it("the reader's own drag ends the suspension; from then on rule 10 applies as before", () => {
    const { effects, state } = run([
      { type: "landing" },
      { type: "drag" },
      { type: "scroll", atBottom: true },
      { type: "contentGrew" },
    ]);
    expect(state.suspended).toBe(false);
    expect(effects[3]).toBe("scrollToEnd");
  });

  it("sending or jumping to the latest ends the suspension at the newest message", () => {
    const { state, effects } = run([{ type: "landing" }, { type: "toLatest" }, { type: "contentGrew" }]);
    expect(state).toEqual({ atBottom: true, suspended: false });
    expect(effects[2]).toBe("scrollToEnd");
  });

  it("a new thread starts pinned and not suspended", () => {
    expect(run([{ type: "landing" }, { type: "reset" }]).state).toEqual(initialFollowState());
  });
});
