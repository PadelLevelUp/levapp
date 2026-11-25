/**
 * messaging.conversation-detail rule 9c (B-732, B-733): a landing is repeated until the list settles
 * with its row on screen, a bounded number of times, and ends with the reader's own action.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_MAX_REPEATS, landingReducer, type LandingEvent, type LandingState } from "./landing-state";

function run(events: LandingEvent[]) {
  let state: LandingState = null;
  const scrolls: (string | null)[] = [];
  for (const event of events) {
    const next = landingReducer(state, event);
    state = next.state;
    scrolls.push(next.effect?.scrollTo ?? null);
  }
  return { state, scrolls };
}

const settled = (...visibleIds: (string | number)[]): LandingEvent => ({ type: "settled", visibleIds });

describe("a landing that checks it arrived (rule 9c)", () => {
  it("[MESSAGING-CONVERSATION-DETAIL-28] scrolls again when the list settled without the target on screen", () => {
    const { scrolls, state } = run([
      { type: "land", messageId: 21 },
      settled(51, 52, 63), // the undone landing: the newest rows
      settled("20", "21", "22"), // ids compare as strings
    ]);
    expect(scrolls).toEqual([null, "21", null]);
    expect(state).toBeNull();
  });

  it("[MESSAGING-CONVERSATION-DETAIL-28] issues nothing more once the list settled on the target", () => {
    const { scrolls } = run([{ type: "land", messageId: "64" }, settled("64", "65"), settled("100")]);
    expect(scrolls.filter(Boolean)).toEqual([]);
  });

  it("[MESSAGING-CONVERSATION-DETAIL-28] gives up after the bound", () => {
    const { scrolls, state } = run([
      { type: "land", messageId: "21" },
      ...Array.from({ length: LANDING_MAX_REPEATS + 3 }, () => settled("63")),
    ]);
    expect(scrolls.filter(Boolean)).toHaveLength(LANDING_MAX_REPEATS);
    expect(state).toBeNull();
  });

  it("[MESSAGING-CONVERSATION-DETAIL-28] the reader's action, another thread or a vanished row ends it", () => {
    const { scrolls } = run([{ type: "land", messageId: "21" }, { type: "end" }, settled("63")]);
    expect(scrolls.filter(Boolean)).toEqual([]);
  });

  it("[MESSAGING-CONVERSATION-DETAIL-28] a new landing replaces the old one, and nothing happens without one", () => {
    const { scrolls } = run([
      settled("1"),
      { type: "land", messageId: "21" },
      { type: "land", messageId: "40" },
      settled("63"),
    ]);
    expect(scrolls.filter(Boolean)).toEqual(["40"]);
  });

  // The thread screen cannot be mounted in the mobile harness (thread-screen-wiring.test.ts).
  it("[MESSAGING-CONVERSATION-DETAIL-28] the thread screen dispatches the landing's events", () => {
    const source = readFileSync(join(__dirname, "..", "..", "..", "app", "conversation", "[id].tsx"), "utf8");
    const between = (from: string, to: string) => {
      const start = source.indexOf(from);
      expect(start, from).toBeGreaterThan(-1);
      const end = source.indexOf(to, start);
      expect(end, to).toBeGreaterThan(start);
      return source.slice(start, end);
    };
    expect(between("const handleScroll = ", "const handleContentSizeChange")).toContain("armLandingSettle()");
    expect(between("const handleContentSizeChange = ", "const viewportHeightRef")).toContain("armLandingSettle()");
    expect(between("const scrollToBottom = ", "const handleScroll")).toContain("endLanding()");
    expect(between("onScrollBeginDrag=", "scrollEventThrottle")).toContain("endLanding()");
    expect(between("A different thread must be anchored", "loadedMessageCount =")).toContain("endLanding()");
    expect(between("requestAnimationFrame(() => {\n      scrollToMessage(landedId", "});")).toContain("startLanding(landedId");
    expect(source).toContain("onViewableItemsChanged={handleViewableItemsChanged}");
  });
});
